from flask import Flask, jsonify, request, session, send_from_directory, redirect
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import re
from datetime import datetime, timedelta
from collections import defaultdict, deque
from functools import wraps

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
    MAX_CONTENT_LENGTH=32 * 1024 * 1024,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# En local se usa la base incluida en el proyecto. En un hosting con disco
# persistente puedes definir SQLITE_DB_PATH=/var/data/ss_streetwear.db.
DATABASE = os.getenv("SQLITE_DB_PATH") or os.path.join(BASE_DIR, "database", "ss_streetwear.db")
os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ALLOWED_ORDER_STATES = {"Pendiente", "Confirmado", "Enviado", "Entregado", "Cancelado"}
RATE_WINDOW = 60
_login_attempts = defaultdict(deque)
_register_attempts = defaultdict(deque)


def ahora():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_db():
    conn = sqlite3.connect(DATABASE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def ensure_column(conn, table, column, definition):
    columns = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    conn = get_db()
    conn.executescript("""
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

    CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
    CREATE INDEX IF NOT EXISTS idx_clientes_correo ON clientes(correo);
    CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_mensajes_estado ON mensajes_contacto(estado);
    """)

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
    }
    for key, value in defaults.items():
        conn.execute("INSERT OR IGNORE INTO configuracion(clave,valor) VALUES(?,?)", (key, value))

    # Administrador inicial. En producción se toma de variables de entorno.
    admin_email = os.getenv("ADMIN_EMAIL", "admin@ssstreetwear.com").strip().lower()
    env_admin_password = os.getenv("ADMIN_PASSWORD")
    admin_password = env_admin_password or "Admin123!"
    admin_name = os.getenv("ADMIN_NAME", "Administrador S&S").strip() or "Administrador S&S"

    if EMAIL_RE.match(admin_email) and len(admin_password) >= 8:
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

    conn.commit()
    conn.close()


def admin_required():
    return session.get("usuario_rol") == "admin"


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
    # No confiamos en X-Forwarded-For por defecto: el límite funciona igual
    # detrás de un proxy y evita que el cliente pueda falsear su identidad.
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
    if IS_PRODUCTION:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# ============================================================
# PÁGINAS
# ============================================================
@app.route("/")
def pagina_inicio():
    return redirect("/user/")


@app.route("/user/")
def pagina_user():
    return send_from_directory(os.path.join(BASE_DIR, "user"), "index.html", max_age=300)


@app.route("/admin/")
def pagina_admin():
    if not admin_required():
        return redirect("/user/?login=admin")
    return send_from_directory(os.path.join(BASE_DIR, "admin"), "index.html", max_age=300)


@app.route("/user/<path:filename>")
def user_files(filename):
    return send_from_directory(os.path.join(BASE_DIR, "user"), filename, max_age=86400)


@app.route("/admin/<path:filename>")
def admin_files(filename):
    if filename == "index.html" and not admin_required():
        return redirect("/user/?login=admin")
    return send_from_directory(os.path.join(BASE_DIR, "admin"), filename, max_age=86400)


@app.route("/shared/<path:filename>")
def shared_files(filename):
    return send_from_directory(os.path.join(BASE_DIR, "shared"), filename, max_age=86400)


@app.route("/robots.txt")
def robots():
    return (
        "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n",
        200,
        {"Content-Type": "text/plain; charset=utf-8"},
    )


@app.route("/sitemap.xml")
def sitemap():
    base = request.url_root.rstrip("/")
    body = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">
  <url><loc>{base}/user/</loc></url>
</urlset>"""
    return body, 200, {"Content-Type": "application/xml; charset=utf-8"}


# ============================================================
# SALUD / SESIÓN
# ============================================================
@app.route("/health")
def health():
    try:
        conn = get_db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return jsonify({"ok": True, "service": "S&S STREETWEAR"})
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
    if not session.get("usuario_id"):
        return jsonify({"autenticado": False})
    return jsonify({
        "autenticado": True,
        "usuario": {
            "id": session["usuario_id"],
            "nombre": session["usuario_nombre"],
            "correo": session["usuario_correo"],
            "rol": session["usuario_rol"]
        }
    })


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
    except sqlite3.IntegrityError:
        conn.close()
        return json_error("Ese correo ya está registrado.", 409)
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return jsonify({
        "mensaje": "Cuenta creada correctamente.",
        "usuario": {"id": uid, "nombre": nombre, "correo": correo, "rol": "cliente"}
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    if _rate_limited(_login_attempts, 10):
        return json_error("Demasiados intentos de inicio de sesión. Espera un minuto.", 429)
    datos = request.get_json(silent=True) or {}
    correo = str(datos.get("correo") or "").strip().lower()
    password = str(datos.get("password") or "")

    if not EMAIL_RE.match(correo) or not password:
        return json_error("Correo o contraseña incorrectos.", 401)

    conn = get_db()
    u = conn.execute(
        "SELECT * FROM usuarios WHERE lower(correo)=? AND activo=1",
        (correo,)
    ).fetchone()
    conn.close()

    if not u or not check_password_hash(u["password_hash"], password):
        return json_error("Correo o contraseña incorrectos.", 401)

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
def product_row(row):
    d = dict(row)
    import json
    try:
        d["galeria"] = json.loads(d.get("galeria") or "[]")
        if not isinstance(d["galeria"], list):
            d["galeria"] = []
    except Exception:
        d["galeria"] = []
    return d


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

    import json
    galeria = datos.get("galeria") or []
    if isinstance(galeria, str):
        try:
            galeria = json.loads(galeria)
        except Exception:
            galeria = []
    if not isinstance(galeria, list):
        galeria = []
    galeria = [str(x) for x in galeria if str(x).startswith(("data:image/", "http://", "https://"))][:12]

    imagen = str(datos.get("imagen") or "").strip()
    if imagen and not imagen.startswith(("data:image/", "http://", "https://")):
        raise ValueError("La imagen no tiene un formato válido.")

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


@app.route("/api/productos", methods=["POST"])
@admin_api_required
def agregar_producto():
    datos = request.get_json(silent=True) or {}
    try:
        p = validate_product(datos)
    except ValueError as e:
        return json_error(str(e), 400)

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
    allowed = {"storeName", "subtitle", "whatsapp", "currency", "shipping", "instagram", "tiktok", "email"}
    conn = get_db()
    for key in allowed:
        if key in datos:
            value = str(datos.get(key) or "").strip()[:500]
            conn.execute(
                "INSERT INTO configuracion(clave,valor) VALUES(?,?) "
                "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                (key, value)
            )
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Configuración guardada"})


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
    cur = conn.execute("UPDATE pedidos SET estado=? WHERE id=?", (estado, id))
    conn.commit()
    conn.close()
    if not cur.rowcount:
        return json_error("Pedido no encontrado.", 404)
    return jsonify({"mensaje": "Estado actualizado"})


@app.route("/api/pedidos", methods=["POST"])
def crear_pedido():
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
            "SELECT id FROM clientes WHERE lower(correo)=? ORDER BY id DESC LIMIT 1",
            (correo,)
        ).fetchone()

        if existente:
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
        seen = set()

        for item in items:
            try:
                pid = int(item.get("producto_id") or item.get("id"))
                qty = int(item.get("cantidad") or item.get("qty") or 1)
            except (TypeError, ValueError):
                raise ValueError("Producto o cantidad inválidos.")

            if pid in seen:
                raise ValueError("El pedido contiene un producto repetido.")
            seen.add(pid)

            if qty < 1 or qty > 50:
                raise ValueError("Cantidad no válida.")

            prod = conn.execute(
                "SELECT id,precio,stock,activo FROM productos WHERE id=?",
                (pid,)
            ).fetchone()
            if not prod or not prod["activo"]:
                raise ValueError(f"El producto {pid} no está disponible.")
            if prod["stock"] < qty:
                raise ValueError(f"Stock insuficiente para el producto {pid}.")

            precio = float(prod["precio"])
            total += precio * qty
            detalle.append((
                pid, qty, precio,
                str(item.get("talla") or item.get("size") or "")[:50],
                str(item.get("color") or "")[:50]
            ))

        cur = conn.execute(
            "INSERT INTO pedidos(cliente_id,fecha,total,estado) VALUES(?,?,?,'Pendiente')",
            (cliente_id, ahora(), round(total, 2))
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
    except Exception as e:
        conn.rollback()
        return json_error(str(e), 400)
    finally:
        conn.close()

    return jsonify({
        "mensaje": "Pedido guardado correctamente",
        "pedido_id": pedido_id,
        "total": round(total, 2)
    }), 201


# ============================================================
# CONTACTO / NEWSLETTER
# ============================================================
@app.route("/api/contacto", methods=["POST"])
def guardar_contacto():
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
    except sqlite3.IntegrityError:
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
@app.errorhandler(413)
def request_too_large(_):
    return json_error("La solicitud es demasiado grande.", 413)


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Recurso no encontrado."}), 404


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Error interno del servidor."}), 500


init_db()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
