from flask import Flask, jsonify, request, session, send_from_directory, redirect, Response
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import re
import json
import base64
import hashlib
import shutil
from datetime import datetime, timedelta
from collections import defaultdict, deque
from functools import wraps


def _cargar_env_local():
    """Lee un archivo .env (solo para trabajar en tu PC). En Render las variables
    se definen en el panel, no con este archivo. Nunca pisa una variable ya definida."""
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.isfile(ruta):
        return
    with open(ruta, encoding="utf-8") as fh:
        for linea in fh:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


_cargar_env_local()

app = Flask(__name__)

# ============================================================
# CONFIGURACIÓN / PRODUCCIÓN
# ============================================================
IS_PRODUCTION = bool(os.getenv("RENDER") or os.getenv("FLASK_ENV") == "production")
secret_key = os.getenv("SECRET_KEY")
if IS_PRODUCTION and not secret_key:
    raise RuntimeError("SECRET_KEY es obligatorio en producción.")

app.config.update(
    SECRET_KEY=secret_key or "dev-only-change-this-secret",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=IS_PRODUCTION,
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    MAX_CONTENT_LENGTH=8 * 1024 * 1024,
)

# Detrás del proxy de Render, request.remote_addr sería siempre la IP del proxy
# y todos los visitantes compartirían el mismo límite de intentos. ProxyFix lee
# la IP real (un solo salto de confianza) solo en producción.
if IS_PRODUCTION:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Base de datos incluida en el proyecto (catálogo inicial). En local se usa tal cual.
BUNDLED_DB = os.path.join(BASE_DIR, "database", "ss_streetwear.db")
# En un hosting con disco persistente puedes definir SQLITE_DB_PATH=/var/data/ss_streetwear.db.
DATABASE = os.getenv("SQLITE_DB_PATH") or BUNDLED_DB

# Si defines DATABASE_URL (PostgreSQL, p. ej. Neon) los datos viven FUERA de Render y
# no se pierden al reiniciar. Si no la defines, se usa SQLite como siempre.
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
USE_PG = DATABASE_URL.lower().startswith(("postgres://", "postgresql://"))
if DATABASE_URL and not USE_PG:
    raise RuntimeError("DATABASE_URL debe empezar por postgresql:// (o déjala vacía para usar SQLite).")

if USE_PG:
    try:
        from backend import pgcompat  # gunicorn backend.app:app y pruebas
    except ImportError:
        import pgcompat  # python backend/app.py
    DBIntegrityError = (sqlite3.IntegrityError, pgcompat.IntegrityError)
else:
    pgcompat = None
    DBIntegrityError = (sqlite3.IntegrityError,)
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
    # Disco persistente nuevo y vacío: arrancar con el catálogo incluido en el proyecto.
    if (os.path.abspath(DATABASE) != os.path.abspath(BUNDLED_DB)
            and not os.path.exists(DATABASE) and os.path.isfile(BUNDLED_DB)):
        shutil.copy2(BUNDLED_DB, DATABASE)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ALLOWED_ORDER_STATES = {"Pendiente", "Confirmado", "Enviado", "Entregado", "Cancelado"}
RATE_WINDOW = 60
_login_attempts = defaultdict(deque)
_register_attempts = defaultdict(deque)
_order_attempts = defaultdict(deque)
_contact_attempts = defaultdict(deque)
_subscribe_attempts = defaultdict(deque)
MEDIA_SLOTS = {
    "hero", "hero2", "hero3", "hero4", "hero5", "categoryPoleras", "categorySudadera", "categoryPantalones", "categoryTenis",
    "categoryGorras", "editorial", "dropTall", "dropMono", "dropStreet",
    "gallery01", "gallery02", "gallery03", "gallery04",
}
MAX_IMAGE_CHARS = 1_400_000  # ~1 MB de imagen en base64


def ahora():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


USUARIO_RE = re.compile(r"^[a-z0-9_.-]{3,30}$")  # nombre de usuario simple, como "admin123"


def get_db():
    if USE_PG:
        return pgcompat.conectar(DATABASE_URL)
    conn = sqlite3.connect(DATABASE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def ensure_column(conn, table, column, definition):
    if USE_PG:
        conn.agregar_columna(table, column, definition)
        return
    columns = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    conn = get_db()
    script_tablas = """
    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT DEFAULT '',
        precio REAL NOT NULL CHECK(precio >= 0),
        categoria TEXT NOT NULL,
        talla TEXT DEFAULT '',
        color TEXT DEFAULT '',
        stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
        imagen TEXT DEFAULT '',
        destacado INTEGER NOT NULL DEFAULT 0 CHECK(destacado IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        correo TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'cliente' CHECK(rol IN ('cliente','admin')),
        activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
        fecha_registro TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        nombre TEXT NOT NULL,
        correo TEXT,
        telefono TEXT NOT NULL,
        direccion TEXT,
        fecha_registro TEXT NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        total REAL NOT NULL CHECK(total >= 0),
        estado TEXT NOT NULL DEFAULT 'Pendiente',
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS detalle_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        precio REAL NOT NULL CHECK(precio >= 0),
        talla TEXT,
        color TEXT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS mensajes_contacto (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        correo TEXT NOT NULL,
        asunto TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'Nuevo',
        fecha TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suscriptores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correo TEXT NOT NULL UNIQUE,
        activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
        fecha_registro TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        metodo TEXT NOT NULL,
        monto REAL NOT NULL CHECK(monto >= 0),
        estado TEXT NOT NULL DEFAULT 'Pendiente',
        referencia TEXT,
        fecha TEXT NOT NULL,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS medios_tienda (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
    CREATE INDEX IF NOT EXISTS idx_clientes_correo ON clientes(correo);
    CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_mensajes_estado ON mensajes_contacto(estado);
    """
    if USE_PG:
        conn.ejecutar_script(script_tablas)
    else:
        conn.executescript(script_tablas)

    # Migraciones para versiones anteriores del proyecto.
    ensure_column(conn, "productos", "sku", "TEXT DEFAULT ''")
    ensure_column(conn, "productos", "etiqueta", "TEXT DEFAULT ''")
    ensure_column(conn, "productos", "activo", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "productos", "prioridad", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "productos", "material", "TEXT DEFAULT ''")
    ensure_column(conn, "productos", "fit", "TEXT DEFAULT ''")
    ensure_column(conn, "productos", "galeria", "TEXT DEFAULT '[]'")
    ensure_column(conn, "clientes", "usuario_id", "INTEGER")
    ensure_column(conn, "clientes", "correo", "TEXT")
    ensure_column(conn, "detalle_pedido", "talla", "TEXT")
    ensure_column(conn, "detalle_pedido", "color", "TEXT")
    ensure_column(conn, "usuarios", "descuento_usado", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "pedidos", "usuario_id", "INTEGER")
    ensure_column(conn, "pedidos", "subtotal", "REAL")
    ensure_column(conn, "pedidos", "descuento", "REAL NOT NULL DEFAULT 0")

    conn.execute("UPDATE productos SET activo=1 WHERE activo IS NULL")
    conn.execute("UPDATE productos SET prioridad=0 WHERE prioridad IS NULL")
    conn.execute("UPDATE productos SET galeria='[]' WHERE galeria IS NULL OR galeria=''")

    # Configuración inicial.
    defaults = {
        "storeName": "S&S STREETWEAR",
        "subtitle": "TIENDA URBANA PREMIUM",
        "whatsapp": "59170000000",
        "currency": "Bs",
        "shipping": "Envíos a toda Bolivia",
        "instagram": "https://instagram.com/",
        "tiktok": "https://tiktok.com/",
        "email": "contacto@ssstreetwear.com",
        "welcomeDiscount": "10",
    }
    for key, value in defaults.items():
        conn.execute("INSERT OR IGNORE INTO configuracion(clave,valor) VALUES(?,?)", (key, value))

    if USE_PG:
        # Primera vez con PostgreSQL: copia el catálogo y los ajustes del .db incluido.
        pgcompat.sembrar_desde_sqlite(conn, BUNDLED_DB)

    # Administrador inicial. En producción se toma de variables de entorno.
    admin_email = os.getenv("ADMIN_EMAIL", "admin123").strip().lower()
    env_admin_password = os.getenv("ADMIN_PASSWORD")
    if IS_PRODUCTION and (not env_admin_password or len(env_admin_password) < 10):
        raise RuntimeError("ADMIN_PASSWORD es obligatorio en producción y debe tener al menos 10 caracteres.")
    admin_password = env_admin_password or "12345678admin"  # solo para desarrollo local; en producción se usa ADMIN_PASSWORD
    admin_name = os.getenv("ADMIN_NAME", "Administrador S&S").strip() or "Administrador S&S"

    if (EMAIL_RE.match(admin_email) or USUARIO_RE.match(admin_email)) and len(admin_password) >= 8:
        # Migración: el admin antiguo (admin@ssstreetwear.com, clave conocida) se renombra
        # al usuario nuevo con su clave nueva, o se desactiva si ya existe el nuevo.
        if admin_email != "admin@ssstreetwear.com":
            viejo = conn.execute("SELECT id FROM usuarios WHERE lower(correo)='admin@ssstreetwear.com' AND rol='admin'").fetchone()
            nuevo = conn.execute("SELECT id FROM usuarios WHERE lower(correo)=?", (admin_email,)).fetchone()
            if viejo and not nuevo:
                conn.execute("UPDATE usuarios SET correo=?, password_hash=? WHERE id=?", (admin_email, generate_password_hash(admin_password), viejo["id"]))
            elif viejo:
                conn.execute("UPDATE usuarios SET activo=0 WHERE id=?", (viejo["id"],))
        admin = conn.execute("SELECT * FROM usuarios WHERE lower(correo)=?", (admin_email,)).fetchone()
        if not admin:
            conn.execute(
                """INSERT INTO usuarios(nombre,correo,password_hash,rol,activo,fecha_registro)
                   VALUES(?,?,?,?,1,?)""",
                (admin_name, admin_email, generate_password_hash(admin_password), "admin", ahora())
            )
        else:
            # ADMIN_PASSWORD definido por el hosting se convierte en la fuente
            # de verdad del administrador. Así un ZIP que ya trae SQLite no queda
            # atrapado con una contraseña antigua al desplegarlo.
            if env_admin_password:
                conn.execute(
                    "UPDATE usuarios SET nombre=?, rol='admin', activo=1, password_hash=? WHERE lower(correo)=?",
                    (admin_name, generate_password_hash(env_admin_password), admin_email)
                )
            else:
                conn.execute(
                    "UPDATE usuarios SET rol='admin', activo=1, nombre=? WHERE lower(correo)=?",
                    (admin_name, admin_email)
                )
        # Con ADMIN_PASSWORD definida, el administrador de las variables de entorno es el
        # único activo: si cambias ADMIN_EMAIL, el admin anterior no queda con su clave vieja.
        if env_admin_password:
            conn.execute(
                "UPDATE usuarios SET activo=0 WHERE rol='admin' AND lower(correo)<>?",
                (admin_email,)
            )

    conn.commit()
    conn.close()


def welcome_percent(conn):
    """Porcentaje de descuento de bienvenida configurado por el admin (0-90)."""
    row = conn.execute("SELECT valor FROM configuracion WHERE clave='welcomeDiscount'").fetchone()
    try:
        pct = float(row["valor"]) if row else 10.0
    except (TypeError, ValueError):
        pct = 0.0
    return max(0.0, min(90.0, pct))


def discount_info(conn, usuario_id):
    """Estado del descuento de bienvenida para un usuario cliente."""
    pct = welcome_percent(conn)
    if not usuario_id:
        return {"porcentaje": pct, "disponible": False}
    u = conn.execute("SELECT rol,descuento_usado FROM usuarios WHERE id=?", (usuario_id,)).fetchone()
    disponible = bool(u and u["rol"] == "cliente" and not u["descuento_usado"] and pct > 0)
    return {"porcentaje": pct, "disponible": disponible}


def admin_required():
    """El rol de la cookie firmada NO basta: se confirma en la base de datos en cada
    petición. Así una cuenta desactivada, borrada o una cookie vieja (p. ej. tras
    reiniciarse un disco efímero) no conserva acceso de administrador."""
    if session.get("usuario_rol") != "admin" or not session.get("usuario_id"):
        return False
    conn = get_db()
    try:
        u = conn.execute("SELECT rol,activo FROM usuarios WHERE id=?", (session["usuario_id"],)).fetchone()
    finally:
        conn.close()
    if not u or u["rol"] != "admin" or not u["activo"]:
        session.clear()
        return False
    return True


def admin_api_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not admin_required():
            return jsonify({"error": "Acceso de administrador requerido"}), 403
        return fn(*args, **kwargs)
    return wrapper


def json_error(message, status=400):
    return jsonify({"error": message}), status


def _client_ip():
    # En producción ProxyFix ya dejó aquí la IP real del visitante.
    return request.remote_addr or "unknown"


def _rate_limited(bucket, limit):
    now = datetime.now().timestamp()
    q = bucket[_client_ip()]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' data: blob: https:; "
        "connect-src 'self'; "
        "frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
    )
    # Las respuestas de la API nunca deben quedar cacheadas con datos de sesión.
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if IS_PRODUCTION:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# ============================================================
# PÁGINAS
# ============================================================
@app.route("/")
def pagina_inicio():
    return redirect("/user/")


# Dirección pública del sitio (ej. https://ssstreetwear.com). Sirve para canonical,
# imágenes al compartir en redes y sitemap. Si no se define, usa la del visitante.
SITE_URL = os.getenv("SITE_URL", "").strip().rstrip("/")


def _site_url():
    return SITE_URL or request.url_root.rstrip("/")


@app.route("/user/")
def pagina_user():
    with open(os.path.join(BASE_DIR, "user", "index.html"), encoding="utf-8") as f:
        html = f.read().replace("__SITE_URL__", _site_url())
    resp = Response(html, mimetype="text/html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/admin/")
def pagina_admin():
    if not admin_required():
        return redirect("/user/?login=admin")
    resp = _static_response("admin", "index.html")
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _static_response(folder, filename):
    """Imágenes con caché de 7 días; HTML/JS/CSS siempre revalidados (ETag),
    así un despliegue nuevo se ve al instante y no queda una versión vieja."""
    resp = send_from_directory(os.path.join(BASE_DIR, folder), filename, max_age=0)
    if filename.lower().endswith((".webp", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff2")):
        resp.headers["Cache-Control"] = "public, max-age=604800"
    else:
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/user/<path:filename>")
def user_files(filename):
    return _static_response("user", filename)


@app.route("/admin/<path:filename>")
def admin_files(filename):
    if filename == "index.html" and not admin_required():
        return redirect("/user/?login=admin")
    return _static_response("admin", filename)


@app.route("/shared/<path:filename>")
def shared_files(filename):
    return _static_response("shared", filename)


@app.route("/favicon.ico")
def favicon():
    """Algunos navegadores piden /favicon.ico aunque la página declare otro icono."""
    return _static_response("shared", "favicon.svg")


@app.route("/robots.txt")
def robots():
    return (
        f"User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: {_site_url()}/sitemap.xml\n",
        200,
        {"Content-Type": "text/plain; charset=utf-8"},
    )


@app.route("/sitemap.xml")
def sitemap():
    base = _site_url()
    body = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">
  <url><loc>{base}/user/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>{base}/user/informacion.html</loc></url>
</urlset>"""
    return body, 200, {"Content-Type": "application/xml; charset=utf-8"}


# ============================================================
# SALUD / SESIÓN
# ============================================================
@app.route("/health")
def health():
    # Con PostgreSQL externo, Render consulta /health cada pocos segundos. Para no mantener
    # despierta la base (y gastar su cuota gratuita), solo se toca la BD con /health?db=1.
    if USE_PG and request.args.get("db") != "1":
        return jsonify({"ok": True, "service": "S&S STREETWEAR", "db": "postgresql"})
    try:
        conn = get_db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return jsonify({"ok": True, "service": "S&S STREETWEAR", "db": "postgresql" if USE_PG else "sqlite"})
    except Exception:
        return jsonify({"ok": False}), 503


@app.route("/api/status")
def api_status():
    return jsonify({
        "funcionando": True,
        "usuario": session.get("usuario_correo"),
        "rol": session.get("usuario_rol")
    })


@app.route("/api/me")
def me():
    conn = get_db()
    try:
        if not session.get("usuario_id"):
            return jsonify({"autenticado": False, "descuento": discount_info(conn, None)})
        return jsonify({
            "autenticado": True,
            "usuario": {
                "id": session["usuario_id"],
                "nombre": session["usuario_nombre"],
                "correo": session["usuario_correo"],
                "rol": session["usuario_rol"]
            },
            "descuento": discount_info(conn, session["usuario_id"])
        })
    finally:
        conn.close()


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"mensaje": "Sesión cerrada correctamente"})


# ============================================================
# CUENTAS: cualquier usuario puede registrarse como cliente.
# Solo una cuenta marcada en servidor como admin puede abrir /admin.
# ============================================================
@app.route("/api/usuarios", methods=["POST"])
def registrar_usuario():
    if _rate_limited(_register_attempts, 8):
        return json_error("Demasiados intentos. Espera un minuto y vuelve a intentarlo.", 429)
    datos = request.get_json(silent=True) or {}
    nombre = " ".join(str(datos.get("nombre") or "").strip().split())
    correo = str(datos.get("correo") or "").strip().lower()
    password = str(datos.get("password") or "")

    if not nombre or len(nombre) < 2 or len(nombre) > 100:
        return json_error("Escribe un nombre válido.", 400)
    if not EMAIL_RE.match(correo) or len(correo) > 150:
        return json_error("Escribe un correo válido.", 400)
    if len(password) < 8:
        return json_error("La contraseña debe tener al menos 8 caracteres.", 400)
    if len(password) > 128:
        return json_error("La contraseña no puede superar 128 caracteres.", 400)

    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO usuarios(nombre,correo,password_hash,rol,activo,fecha_registro)
               VALUES(?,?,?,?,1,?)""",
            (nombre, correo, generate_password_hash(password), "cliente", ahora())
        )
        conn.commit()
        uid = cur.lastrowid
    except DBIntegrityError:
        conn.close()
        return json_error("Ese correo ya está registrado.", 409)
    finally:
        try:
            conn.close()
        except Exception:
            pass

    conn = get_db()
    pct = welcome_percent(conn)
    conn.close()
    return jsonify({
        "mensaje": "Cuenta creada correctamente.",
        "usuario": {"id": uid, "nombre": nombre, "correo": correo, "rol": "cliente"},
        "descuento": {"porcentaje": pct, "disponible": pct > 0}
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    if _rate_limited(_login_attempts, 10):
        return json_error("Demasiados intentos de inicio de sesión. Espera un minuto.", 429)
    datos = request.get_json(silent=True) or {}
    correo = str(datos.get("correo") or "").strip().lower()
    password = str(datos.get("password") or "")

    if not (EMAIL_RE.match(correo) or USUARIO_RE.match(correo)) or not password:
        return json_error("Usuario o contraseña incorrectos.", 401)

    conn = get_db()
    u = conn.execute(
        "SELECT * FROM usuarios WHERE lower(correo)=? AND activo=1",
        (correo,)
    ).fetchone()
    conn.close()

    if not u or not check_password_hash(u["password_hash"], password):
        return json_error("Usuario o contraseña incorrectos.", 401)

    session.clear()
    session.permanent = True
    session["usuario_id"] = u["id"]
    session["usuario_correo"] = u["correo"]
    session["usuario_nombre"] = u["nombre"]
    session["usuario_rol"] = u["rol"]

    return jsonify({
        "mensaje": "Inicio de sesión correcto",
        "usuario": {
            "id": u["id"],
            "nombre": u["nombre"],
            "correo": u["correo"],
            "rol": u["rol"]
        }
    })


@app.route("/api/usuarios", methods=["GET"])
@admin_api_required
def listar_usuarios():
    conn = get_db()
    rows = conn.execute(
        """SELECT id,nombre,correo,rol,activo,fecha_registro
           FROM usuarios ORDER BY id DESC"""
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ============================================================
# PRODUCTOS
# ============================================================
def _data_uri_bytes(value):
    """Decodifica un data:image/...;base64,... y devuelve (bytes, mimetype) o None."""
    m = re.match(r"^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", value or "", re.S)
    if not m:
        return None
    try:
        return base64.b64decode(m.group(2), validate=False), m.group(1)
    except Exception:
        return None


def _media_url(value, path):
    """Las imágenes guardadas como base64 se sirven por una URL cacheable en
    lugar de viajar dentro del JSON (el catálogo pasa de ~1 MB a pocos KB)."""
    if isinstance(value, str) and value.startswith("data:image/"):
        return f"{path}?v={hashlib.sha1(value.encode()).hexdigest()[:10]}"
    return value


def _image_response(value):
    decoded = _data_uri_bytes(value)
    if not decoded:
        return "Imagen no encontrada.", 404
    data, mime = decoded
    return Response(data, mimetype=mime, headers={
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    })


def _load_gallery(raw):
    try:
        g = json.loads(raw or "[]")
        return g if isinstance(g, list) else []
    except Exception:
        return []


def product_row(row):
    d = dict(row)
    galeria = _load_gallery(d.get("galeria"))
    pid = d["id"]
    d["imagen"] = _media_url(d.get("imagen"), f"/media/producto/{pid}")
    d["galeria"] = [_media_url(g, f"/media/producto/{pid}/{i}") for i, g in enumerate(galeria)]
    return d


@app.route("/media/producto/<int:pid>")
def media_producto(pid):
    conn = get_db()
    row = conn.execute("SELECT imagen FROM productos WHERE id=?", (pid,)).fetchone()
    conn.close()
    return _image_response(row["imagen"]) if row else ("Imagen no encontrada.", 404)


@app.route("/media/producto/<int:pid>/<int:n>")
def media_producto_galeria(pid, n):
    conn = get_db()
    row = conn.execute("SELECT galeria FROM productos WHERE id=?", (pid,)).fetchone()
    conn.close()
    if not row:
        return "Imagen no encontrada.", 404
    galeria = _load_gallery(row["galeria"])
    return _image_response(galeria[n]) if 0 <= n < len(galeria) else ("Imagen no encontrada.", 404)


@app.route("/media/tienda/<clave>")
def media_tienda(clave):
    conn = get_db()
    row = conn.execute("SELECT valor FROM medios_tienda WHERE clave=?", (clave,)).fetchone()
    conn.close()
    return _image_response(row["valor"]) if row else ("Imagen no encontrada.", 404)


def _valid_image_ref(value, allow_media=False):
    value = str(value or "").strip()
    if not value:
        return ""
    if value.startswith("data:image/"):
        if len(value) > MAX_IMAGE_CHARS or not _data_uri_bytes(value):
            raise ValueError("La imagen es demasiado pesada o su formato no es válido (máx. ~1 MB, JPG/PNG/WebP).")
        return value
    prefixes = ["https://", "http://", "/user/assets/"]
    if allow_media:
        prefixes.append("/media/producto/")
    if value.startswith(tuple(prefixes)) and len(value) <= 600:
        return value
    raise ValueError("La imagen no tiene un formato válido.")


@app.route("/api/productos", methods=["GET"])
def obtener_productos():
    show_all = request.args.get("all") == "1"
    conn = get_db()
    if show_all and admin_required():
        rows = conn.execute(
            "SELECT * FROM productos ORDER BY prioridad DESC, id DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM productos
               WHERE activo=1
               ORDER BY destacado DESC, prioridad DESC, id DESC"""
        ).fetchall()
    conn.close()
    return jsonify([product_row(r) for r in rows])


def validate_product(datos):
    nombre = " ".join(str(datos.get("nombre") or "").strip().split())
    categoria = str(datos.get("categoria") or "").strip().lower()
    try:
        precio = float(datos.get("precio", 0))
        stock = int(datos.get("stock", 0))
        prioridad = int(datos.get("prioridad", 0) or 0)
    except (TypeError, ValueError):
        raise ValueError("Precio, stock y prioridad deben ser numéricos.")

    if not nombre or len(nombre) > 160:
        raise ValueError("El nombre del producto es obligatorio.")
    if not categoria or len(categoria) > 60:
        raise ValueError("La categoría es obligatoria.")
    if precio < 0 or stock < 0 or prioridad < 0:
        raise ValueError("Precio, stock y prioridad no pueden ser negativos.")

    galeria = datos.get("galeria") or []
    if isinstance(galeria, str):
        try:
            galeria = json.loads(galeria)
        except Exception:
            galeria = []
    if not isinstance(galeria, list):
        galeria = []
    galeria = [_valid_image_ref(x, allow_media=True) for x in galeria[:12] if str(x or "").strip()]

    imagen = _valid_image_ref(datos.get("imagen"), allow_media=True)

    return {
        "nombre": nombre,
        "descripcion": str(datos.get("descripcion") or "").strip()[:2000],
        "precio": precio,
        "categoria": categoria,
        "talla": str(datos.get("talla") or "").strip()[:500],
        "color": str(datos.get("color") or "").strip()[:500],
        "stock": stock,
        "imagen": imagen,
        "destacado": 1 if datos.get("destacado") in (1, True, "1", "true", "True") else 0,
        "sku": str(datos.get("sku") or "").strip()[:80],
        "etiqueta": str(datos.get("etiqueta") or "").strip()[:50],
        "activo": 1 if datos.get("activo", True) in (1, True, "1", "true", "True") else 0,
        "prioridad": prioridad,
        "material": str(datos.get("material") or "").strip()[:120],
        "fit": str(datos.get("fit") or "").strip()[:120],
        "galeria": json.dumps(galeria, ensure_ascii=False),
    }


def resolve_media_refs(p, existente=None):
    """El panel devuelve /media/producto/... para las fotos que ya existen:
    se traducen a la imagen guardada (o se descartan en un producto nuevo)."""
    old_gallery = _load_gallery(existente["galeria"]) if existente else []
    if p["imagen"].startswith("/media/producto/"):
        p["imagen"] = existente["imagen"] if existente else ""
    resolved = []
    for g in _load_gallery(p["galeria"]):
        if g.startswith("/media/producto/"):
            m = re.match(r"^/media/producto/\d+/(\d+)", g)
            idx = int(m.group(1)) if m else -1
            if 0 <= idx < len(old_gallery):
                resolved.append(old_gallery[idx])
        else:
            resolved.append(g)
    p["galeria"] = json.dumps(resolved, ensure_ascii=False)
    return p


@app.route("/api/productos", methods=["POST"])
@admin_api_required
def agregar_producto():
    datos = request.get_json(silent=True) or {}
    try:
        p = validate_product(datos)
    except ValueError as e:
        return json_error(str(e), 400)

    p = resolve_media_refs(p)
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO productos
            (nombre,descripcion,precio,categoria,talla,color,stock,imagen,destacado,
             sku,etiqueta,activo,prioridad,material,fit,galeria)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            tuple(p.values())
        )
        conn.commit()
        pid = cur.lastrowid
    except Exception as e:
        conn.rollback()
        return json_error(f"No se pudo guardar el producto: {e}", 400)
    finally:
        conn.close()

    return jsonify({"mensaje": "Producto agregado correctamente", "id": pid}), 201


@app.route("/api/productos/<int:id>", methods=["PUT"])
@admin_api_required
def editar_producto(id):
    datos = request.get_json(silent=True) or {}
    try:
        p = validate_product(datos)
    except ValueError as e:
        return json_error(str(e), 400)

    conn = get_db()
    try:
        existente = conn.execute("SELECT imagen,galeria FROM productos WHERE id=?", (id,)).fetchone()
        if not existente:
            conn.close()
            return json_error("Producto no encontrado.", 404)
        p = resolve_media_refs(p, existente)
        cur = conn.execute(
            """UPDATE productos SET
               nombre=?,descripcion=?,precio=?,categoria=?,talla=?,color=?,stock=?,imagen=?,
               destacado=?,sku=?,etiqueta=?,activo=?,prioridad=?,material=?,fit=?,galeria=?
               WHERE id=?""",
            (*p.values(), id)
        )
        conn.commit()
        if cur.rowcount == 0:
            return json_error("Producto no encontrado.", 404)
    except Exception as e:
        conn.rollback()
        return json_error(f"No se pudo actualizar el producto: {e}", 400)
    finally:
        conn.close()

    return jsonify({"mensaje": "Producto actualizado correctamente"})


@app.route("/api/productos/<int:id>", methods=["DELETE"])
@admin_api_required
def eliminar_producto(id):
    conn = get_db()
    try:
        # No permitimos borrar un producto que ya forma parte de un pedido.
        usado = conn.execute(
            "SELECT 1 FROM detalle_pedido WHERE producto_id=? LIMIT 1", (id,)
        ).fetchone()
        if usado:
            conn.close()
            return json_error(
                "Este producto tiene pedidos asociados. Ocúltalo en lugar de eliminarlo.",
                409
            )
        cur = conn.execute("DELETE FROM productos WHERE id=?", (id,))
        conn.commit()
        if cur.rowcount == 0:
            return json_error("Producto no encontrado.", 404)
    except Exception as e:
        conn.rollback()
        return json_error(str(e), 400)
    finally:
        conn.close()
    return jsonify({"mensaje": "Producto eliminado correctamente"})


# ============================================================
# CONFIGURACIÓN DE TIENDA
# ============================================================
@app.route("/api/config", methods=["GET"])
def obtener_config():
    conn = get_db()
    rows = conn.execute("SELECT clave,valor FROM configuracion").fetchall()
    conn.close()
    return jsonify({r["clave"]: r["valor"] for r in rows})


@app.route("/api/config", methods=["PUT"])
@admin_api_required
def actualizar_config():
    datos = request.get_json(silent=True) or {}
    allowed = {"storeName", "subtitle", "whatsapp", "currency", "shipping", "instagram", "tiktok", "email", "welcomeDiscount"}
    conn = get_db()
    for key in allowed:
        if key in datos:
            value = str(datos.get(key) or "").strip()[:500]
            if key == "welcomeDiscount":
                try:
                    value = str(max(0, min(90, int(float(value or 0)))))
                except ValueError:
                    return json_error("El descuento debe ser un número entre 0 y 90.", 400)
            conn.execute(
                "INSERT INTO configuracion(clave,valor) VALUES(?,?) "
                "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                (key, value)
            )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Configuración guardada"})


# ============================================================
# IMÁGENES DE LA TIENDA (portada, categorías, galería)
# Se guardan en el servidor para que TODOS los visitantes las vean.
# ============================================================
@app.route("/api/medios", methods=["GET"])
def obtener_medios():
    conn = get_db()
    rows = conn.execute("SELECT clave,valor FROM medios_tienda").fetchall()
    conn.close()
    return jsonify({r["clave"]: _media_url(r["valor"], f"/media/tienda/{r['clave']}") for r in rows if r["valor"]})


@app.route("/api/medios/<clave>", methods=["PUT"])
@admin_api_required
def guardar_medio(clave):
    if clave not in MEDIA_SLOTS:
        return json_error("Espacio de imagen no válido.", 404)
    datos = request.get_json(silent=True) or {}
    try:
        valor = _valid_image_ref(datos.get("imagen"))
    except ValueError as e:
        return json_error(str(e), 400)
    conn = get_db()
    if valor:
        conn.execute(
            "INSERT INTO medios_tienda(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
            (clave, valor)
        )
    else:
        conn.execute("DELETE FROM medios_tienda WHERE clave=?", (clave,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Imagen de la tienda guardada"})


# ============================================================
# CLIENTES Y PEDIDOS
# ============================================================
@app.route("/api/clientes", methods=["GET"])
@admin_api_required
def obtener_clientes():
    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, COUNT(p.id) AS cantidad_pedidos,
               COALESCE(SUM(CASE WHEN p.estado != 'Cancelado' THEN p.total ELSE 0 END),0) AS total_compras
        FROM clientes c
        LEFT JOIN pedidos p ON p.cliente_id=c.id
        GROUP BY c.id
        ORDER BY c.id DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/pedidos", methods=["GET"])
@admin_api_required
def obtener_pedidos():
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, c.nombre AS cliente_nombre,
               c.telefono AS cliente_telefono,
               c.correo AS cliente_correo,
               c.direccion AS cliente_direccion
        FROM pedidos p
        JOIN clientes c ON c.id=p.cliente_id
        ORDER BY p.id DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/pedidos/<int:id>/estado", methods=["PUT"])
@admin_api_required
def cambiar_estado_pedido(id):
    datos = request.get_json(silent=True) or {}
    estado = str(datos.get("estado") or "").strip()
    if estado not in ALLOWED_ORDER_STATES:
        return json_error("Estado de pedido no válido.", 400)

    conn = get_db()
    try:
        previo = conn.execute("SELECT estado,usuario_id,descuento FROM pedidos WHERE id=?", (id,)).fetchone()
        if not previo:
            return json_error("Pedido no encontrado.", 404)
        if previo["estado"] == "Cancelado" and estado != "Cancelado":
            return json_error("Un pedido cancelado no se puede reactivar. Crea un pedido nuevo.", 409)
        conn.execute("UPDATE pedidos SET estado=? WHERE id=?", (estado, id))
        if estado == "Cancelado" and previo["estado"] != "Cancelado":
            # El stock reservado vuelve al inventario...
            conn.execute(
                """UPDATE productos SET stock=stock+COALESCE(
                       (SELECT SUM(cantidad) FROM detalle_pedido WHERE pedido_id=? AND producto_id=productos.id),0)
                   WHERE id IN (SELECT producto_id FROM detalle_pedido WHERE pedido_id=?)""",
                (id, id)
            )
            # ...y la cuenta recupera el descuento de bienvenida si lo había usado.
            if previo["usuario_id"] and (previo["descuento"] or 0) > 0:
                conn.execute("UPDATE usuarios SET descuento_usado=0 WHERE id=?", (previo["usuario_id"],))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"mensaje": "Estado actualizado"})


@app.route("/api/pedidos", methods=["POST"])
def crear_pedido():
    if _rate_limited(_order_attempts, 20):
        return json_error("Demasiados pedidos enviados. Espera un minuto e inténtalo de nuevo.", 429)
    datos = request.get_json(silent=True) or {}
    cliente = datos.get("cliente") or {}
    items = datos.get("items") or []

    nombre = " ".join(str(cliente.get("nombre") or "").strip().split())
    correo = str(cliente.get("correo") or "").strip().lower()
    telefono = str(cliente.get("telefono") or "").strip()
    direccion = str(cliente.get("direccion") or "").strip()

    if not nombre or len(nombre) > 100:
        return json_error("Nombre no válido.", 400)
    if not EMAIL_RE.match(correo) or len(correo) > 150:
        return json_error("Correo no válido.", 400)
    if not telefono or len(telefono) > 30:
        return json_error("Teléfono no válido.", 400)
    if len(direccion) > 200:
        return json_error("Dirección demasiado larga.", 400)
    if not isinstance(items, list) or not items or len(items) > 30:
        return json_error("El pedido no contiene productos válidos.", 400)

    conn = get_db()
    try:
        usuario_id = session.get("usuario_id")
        existente = conn.execute(
            "SELECT id,usuario_id FROM clientes WHERE lower(correo)=? ORDER BY id DESC LIMIT 1",
            (correo,)
        ).fetchone()

        if existente and (existente["usuario_id"] is None or existente["usuario_id"] == usuario_id):
            cliente_id = existente["id"]
            conn.execute(
                """UPDATE clientes SET usuario_id=COALESCE(?,usuario_id),
                   nombre=?,telefono=?,direccion=? WHERE id=?""",
                (usuario_id, nombre, telefono, direccion, cliente_id)
            )
        else:
            cur = conn.execute(
                """INSERT INTO clientes(usuario_id,nombre,correo,telefono,direccion,fecha_registro)
                   VALUES(?,?,?,?,?,?)""",
                (usuario_id, nombre, correo, telefono, direccion, ahora())
            )
            cliente_id = cur.lastrowid

        total = 0.0
        detalle = []
        productos = {}      # producto ya consultado
        pedidas = {}        # unidades pedidas por producto (suma de TODAS sus líneas)

        for item in items:
            if not isinstance(item, dict):
                raise ValueError("Producto o cantidad inválidos.")
            try:
                pid = int(item.get("producto_id") or item.get("id"))
                qty = int(item.get("cantidad") or item.get("qty") or 1)
            except (TypeError, ValueError):
                raise ValueError("Producto o cantidad inválidos.")

            if qty < 1 or qty > 50:
                raise ValueError("Cantidad no válida.")

            # El carrito permite el mismo producto en varias tallas/colores (líneas
            # distintas): cada línea se guarda en el detalle y el stock se suma.
            if pid not in productos:
                prod = conn.execute(
                    "SELECT id,precio,stock,activo FROM productos WHERE id=?",
                    (pid,)
                ).fetchone()
                if not prod or not prod["activo"]:
                    raise ValueError(f"El producto {pid} no está disponible.")
                productos[pid] = prod
            pedidas[pid] = pedidas.get(pid, 0) + qty
            if productos[pid]["stock"] < pedidas[pid]:
                raise ValueError(f"Stock insuficiente para el producto {pid}.")

            precio = float(productos[pid]["precio"])
            total += precio * qty
            detalle.append((
                pid, qty, precio,
                str(item.get("talla") or item.get("size") or "")[:50],
                str(item.get("color") or "")[:50]
            ))

        subtotal = round(total, 2)
        descuento = 0.0
        info = discount_info(conn, usuario_id)
        if info["disponible"]:
            descuento = round(subtotal * info["porcentaje"] / 100.0, 2)
            # Marca el descuento como usado de forma atómica (una sola vez por cuenta).
            usado = conn.execute(
                "UPDATE usuarios SET descuento_usado=1 WHERE id=? AND descuento_usado=0",
                (usuario_id,)
            )
            if usado.rowcount != 1:
                descuento = 0.0
        total = round(subtotal - descuento, 2)

        cur = conn.execute(
            "INSERT INTO pedidos(cliente_id,fecha,total,estado,usuario_id,subtotal,descuento) VALUES(?,?,?,'Pendiente',?,?,?)",
            (cliente_id, ahora(), total, usuario_id, subtotal, descuento)
        )
        pedido_id = cur.lastrowid

        for pid, qty, precio, talla, color in detalle:
            conn.execute(
                """INSERT INTO detalle_pedido
                   (pedido_id,producto_id,cantidad,precio,talla,color)
                   VALUES(?,?,?,?,?,?)""",
                (pedido_id, pid, qty, precio, talla, color)
            )
            # Condición atómica: evita vender stock que ya cambió.
            updated = conn.execute(
                """UPDATE productos SET stock=stock-?
                   WHERE id=? AND activo=1 AND stock>=?""",
                (qty, pid, qty)
            )
            if updated.rowcount != 1:
                raise ValueError("El stock cambió mientras se procesaba el pedido.")

        conn.commit()
    except ValueError as e:
        conn.rollback()
        return json_error(str(e), 400)
    except Exception:
        conn.rollback()
        app.logger.exception("Error inesperado al guardar un pedido")
        return json_error("No se pudo guardar el pedido. Inténtalo de nuevo en unos minutos.", 500)
    finally:
        conn.close()

    return jsonify({
        "mensaje": "Pedido guardado correctamente",
        "pedido_id": pedido_id,
        "subtotal": subtotal,
        "descuento": descuento,
        "total": round(total, 2)
    }), 201


# ============================================================
# COPIA DE SEGURIDAD (solo admin)
# En hostings gratuitos el disco puede borrarse: descarga una copia
# de la base de datos de vez en cuando desde Admin → Configuración.
# ============================================================
@app.route("/api/respaldo", methods=["GET"])
@admin_api_required
def descargar_respaldo():
    if USE_PG:
        conn = get_db()
        try:
            data = pgcompat.volcar_json(conn)
        finally:
            conn.close()
        nombre = f"ss_streetwear_respaldo_{datetime.now().strftime('%Y-%m-%d_%H%M')}.json"
        return Response(data, mimetype="application/json", headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "Cache-Control": "no-store",
        })
    import tempfile
    fd, tmp_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        src = get_db()
        dst = sqlite3.connect(tmp_path)
        src.backup(dst)          # copia consistente aunque haya escrituras
        dst.execute("PRAGMA journal_mode = DELETE")
        dst.close()
        src.close()
        with open(tmp_path, "rb") as fh:
            data = fh.read()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    nombre = f"ss_streetwear_respaldo_{datetime.now().strftime('%Y-%m-%d_%H%M')}.db"
    return Response(data, mimetype="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{nombre}"',
        "Cache-Control": "no-store",
    })


# ============================================================
# CONTACTO / NEWSLETTER
# ============================================================
@app.route("/api/contacto", methods=["POST"])
def guardar_contacto():
    if _rate_limited(_contact_attempts, 15):
        return json_error("Demasiados mensajes enviados. Espera un minuto e inténtalo de nuevo.", 429)
    datos = request.get_json(silent=True) or {}
    nombre = " ".join(str(datos.get("nombre") or "").strip().split())
    correo = str(datos.get("correo") or "").strip().lower()
    asunto = str(datos.get("asunto") or "").strip()
    mensaje = str(datos.get("mensaje") or "").strip()

    if not nombre or len(nombre) > 100:
        return json_error("Nombre no válido.", 400)
    if not EMAIL_RE.match(correo) or len(correo) > 150:
        return json_error("Correo no válido.", 400)
    if not asunto or len(asunto) > 160:
        return json_error("Asunto no válido.", 400)
    if not mensaje or len(mensaje) > 3000:
        return json_error("Mensaje no válido.", 400)

    conn = get_db()
    cur = conn.execute(
        """INSERT INTO mensajes_contacto
           (nombre,correo,asunto,mensaje,estado,fecha)
           VALUES(?,?,?,?, 'Nuevo', ?)""",
        (nombre, correo, asunto, mensaje, ahora())
    )
    conn.commit()
    mid = cur.lastrowid
    conn.close()
    return jsonify({"mensaje": "Mensaje guardado correctamente", "id": mid}), 201


@app.route("/api/contacto", methods=["GET"])
@admin_api_required
def listar_contacto():
    conn = get_db()
    rows = conn.execute("SELECT * FROM mensajes_contacto ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/suscriptores", methods=["POST"])
def suscribir():
    if _rate_limited(_subscribe_attempts, 10):
        return json_error("Demasiados intentos. Espera un minuto e inténtalo de nuevo.", 429)
    datos = request.get_json(silent=True) or {}
    correo = str(datos.get("correo") or "").strip().lower()
    if not EMAIL_RE.match(correo) or len(correo) > 150:
        return json_error("Correo no válido.", 400)

    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO suscriptores(correo,activo,fecha_registro) VALUES(?,1,?)",
            (correo, ahora())
        )
        conn.commit()
        sid = cur.lastrowid
    except DBIntegrityError:
        conn.rollback()  # necesario en PostgreSQL tras un error dentro de la transacción
        conn.execute("UPDATE suscriptores SET activo=1 WHERE correo=?", (correo,))
        conn.commit()
        sid = conn.execute(
            "SELECT id FROM suscriptores WHERE correo=?", (correo,)
        ).fetchone()["id"]
    finally:
        conn.close()

    return jsonify({"mensaje": "Suscripción guardada", "id": sid}), 201


@app.route("/api/suscriptores", methods=["GET"])
@admin_api_required
def listar_suscriptores():
    conn = get_db()
    rows = conn.execute(
        "SELECT id,correo,activo,fecha_registro FROM suscriptores ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ============================================================
# ERRORES
# ============================================================
def _pagina_error(nombre, codigo):
    """Devuelve la página de error con el diseño de la tienda."""
    with open(os.path.join(BASE_DIR, "user", nombre), encoding="utf-8") as f:
        return Response(f.read(), status=codigo, mimetype="text/html")


@app.errorhandler(400)
def bad_request(_):
    if request.path.startswith("/api/"):
        return json_error("Solicitud no válida.", 400)
    return "Solicitud no válida.", 400


@app.errorhandler(405)
def method_not_allowed(_):
    if request.path.startswith("/api/"):
        return json_error("Método no permitido.", 405)
    return "Método no permitido.", 405


@app.errorhandler(413)
def request_too_large(_):
    return json_error("La solicitud es demasiado grande.", 413)


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return json_error("Recurso no encontrado.", 404)
    return _pagina_error("404.html", 404)


@app.errorhandler(500)
def server_error(_):
    if request.path.startswith("/api/"):
        return json_error("Error interno del servidor.", 500)
    return _pagina_error("500.html", 500)


init_db()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
