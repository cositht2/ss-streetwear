"""Pruebas de S&S STREETWEAR (backend, sesiones, roles, pedidos, descuento, stock, imágenes).

Ejecutar desde la raíz del proyecto:
    python tests/smoke_test.py

Usa una base temporal: no toca database/ss_streetwear.db.
"""
import base64
import io
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# 1 px PNG válido, para probar la subida de imágenes.
PNG = "data:image/png;base64," + base64.b64encode(base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)).decode()

ok_count = 0


def check(cond, msg):
    global ok_count
    assert cond, msg
    ok_count += 1


with tempfile.TemporaryDirectory() as tmp:
    os.environ["SQLITE_DB_PATH"] = os.path.join(tmp, "smoke.db")
    os.environ["SECRET_KEY"] = "smoke-test-secret"
    os.environ["ADMIN_PASSWORD"] = "SmokeAdmin123!"

    from backend.app import app

    anon = app.test_client()
    admin = app.test_client()
    cliente = app.test_client()

    # ---- páginas y salud
    for path, expected in [("/", 302), ("/user/", 200), ("/health", 200), ("/api/status", 200),
                           ("/api/config", 200), ("/api/productos", 200), ("/api/medios", 200),
                           ("/admin/", 302), ("/robots.txt", 200), ("/sitemap.xml", 200),
                           ("/user/assets/visuals/hero.webp", 200), ("/user/sw.js", 200)]:
        r = anon.get(path)
        check(r.status_code == expected, f"{path}: esperado {expected}, recibido {r.status_code}")
    check("no-cache" in anon.get("/user/app.js").headers["Cache-Control"], "JS debe revalidarse")
    check("max-age=604800" in anon.get("/user/assets/visuals/hero.webp").headers["Cache-Control"], "imágenes con caché")

    # ---- rutas de admin cerradas para anónimos y clientes
    for method, path in [("get", "/api/clientes"), ("get", "/api/pedidos"), ("get", "/api/usuarios"),
                         ("post", "/api/productos"), ("put", "/api/config"), ("put", "/api/medios/hero")]:
        r = getattr(anon, method)(path, json={})
        check(r.status_code == 403, f"{method} {path} debe ser 403 para anónimos")

    # ---- login admin
    r = admin.post("/api/login", json={"correo": "admin123", "password": "SmokeAdmin123!"})
    check(r.status_code == 200 and r.json["usuario"]["rol"] == "admin", "login admin")
    check(admin.get("/admin/").status_code == 200, "admin abre /admin/")
    check(anon.post("/api/login", json={"correo": "admin123", "password": "mala"}).status_code == 401,
          "contraseña incorrecta")

    # ---- producto con imagen base64: el catálogo no debe llevar el base64 dentro del JSON
    r = admin.post("/api/productos", json={"nombre": "Polera Test", "categoria": "poleras", "precio": 100,
                                            "stock": 5, "imagen": PNG, "galeria": [PNG]})
    check(r.status_code == 201, r.get_data(as_text=True))
    pid = r.json["id"]
    prod = [p for p in anon.get("/api/productos").json if p["id"] == pid][0]
    check(prod["imagen"].startswith(f"/media/producto/{pid}?v="), "imagen servida por URL")
    check(anon.get(prod["imagen"]).mimetype == "image/png", "la URL de la imagen funciona")
    check(anon.get(prod["galeria"][0]).status_code == 200, "galería por URL")
    # editar desde el panel devuelve las mismas URLs: no debe perder las fotos
    r = admin.put(f"/api/productos/{pid}", json={"nombre": "Polera Test 2", "categoria": "poleras", "precio": 100,
                                                  "stock": 5, "imagen": prod["imagen"], "galeria": prod["galeria"]})
    check(r.status_code == 200, r.get_data(as_text=True))
    prod = [p for p in anon.get("/api/productos").json if p["id"] == pid][0]
    check(anon.get(prod["imagen"]).status_code == 200 and len(prod["galeria"]) == 1, "fotos conservadas al editar")
    check(admin.post("/api/productos", json={"nombre": "X", "categoria": "a", "precio": 1, "stock": 1,
                                              "imagen": "javascript:alert(1)"}).status_code == 400, "imagen maliciosa")

    # ---- imágenes de la tienda guardadas en el servidor
    check(admin.put("/api/medios/hero", json={"imagen": PNG}).status_code == 200, "guardar imagen hero")
    check(anon.get(anon.get("/api/medios").json["hero"]).status_code == 200, "hero visible para anónimos")
    check(admin.put("/api/medios/inventada", json={"imagen": PNG}).status_code == 404, "slot inválido")
    check(admin.put("/api/medios/hero", json={"imagen": ""}).status_code == 200 and
          "hero" not in anon.get("/api/medios").json, "restablecer hero")

    # ---- registro, descuento y pedido
    r = cliente.post("/api/usuarios", json={"nombre": "Ana Cliente", "correo": "ana@example.com", "password": "Cliente123!"})
    check(r.status_code == 201, "registro")
    check(cliente.post("/api/usuarios", json={"nombre": "Ana", "correo": "ana@example.com", "password": "Cliente123!"}).status_code == 409,
          "correo duplicado")
    check(cliente.post("/api/login", json={"correo": "ana@example.com", "password": "Cliente123!"}).json["usuario"]["rol"] == "cliente",
          "login cliente")
    check(cliente.get("/admin/").status_code == 302, "cliente no entra al admin")
    me = cliente.get("/api/me").json
    check(me["descuento"]["disponible"] and me["descuento"]["porcentaje"] == 10, "descuento de bienvenida disponible")

    pedido = {"cliente": {"nombre": "Ana", "correo": "ana@example.com", "telefono": "70000000", "direccion": "Cochabamba"},
              "items": [{"producto_id": pid, "cantidad": 2, "talla": "M", "color": "Negro"}]}
    r = cliente.post("/api/pedidos", json=pedido)
    check(r.status_code == 201 and r.json["subtotal"] == 200 and r.json["descuento"] == 20 and r.json["total"] == 180,
          f"pedido con 10% de descuento: {r.get_data(as_text=True)}")
    oid = r.json["pedido_id"]
    check(cliente.get("/api/me").json["descuento"]["disponible"] is False, "el descuento se usa una sola vez")
    stock = lambda: [p for p in admin.get("/api/productos?all=1").json if p["id"] == pid][0]["stock"]
    check(stock() == 3, "el stock baja al comprar")

    # segundo pedido: sin descuento, y no permite más stock del que hay
    r = cliente.post("/api/pedidos", json={**pedido, "items": [{"producto_id": pid, "cantidad": 10}]})
    check(r.status_code == 400, "no vende más stock del disponible")

    # ---- cancelar devuelve stock y descuento; un pedido cancelado no se reactiva
    check(admin.put(f"/api/pedidos/{oid}/estado", json={"estado": "Cancelado"}).status_code == 200, "cancelar")
    check(stock() == 5, "cancelar devuelve el stock")
    check(cliente.get("/api/me").json["descuento"]["disponible"] is True, "cancelar devuelve el descuento")
    check(admin.put(f"/api/pedidos/{oid}/estado", json={"estado": "Enviado"}).status_code == 409, "no reactivar cancelados")
    check(admin.put(f"/api/pedidos/{oid}/estado", json={"estado": "Inventado"}).status_code == 400, "estado inválido")
    check(admin.put("/api/pedidos/9999/estado", json={"estado": "Enviado"}).status_code == 404, "pedido inexistente")

    # ---- un invitado no puede sobrescribir los datos de una cuenta ajena con su correo
    anon.post("/api/pedidos", json={"cliente": {"nombre": "Intruso", "correo": "ana@example.com", "telefono": "1", "direccion": "x"},
                                      "items": [{"producto_id": pid, "cantidad": 1}]})
    nombres = {c["nombre"] for c in admin.get("/api/clientes").json if c["correo"] == "ana@example.com"}
    check("Ana" in nombres, "los datos de Ana siguen intactos")

    # ---- contacto, newsletter, configuración
    check(anon.post("/api/contacto", json={"nombre": "Luis", "correo": "l@e.com", "asunto": "Hola", "mensaje": "Consulta"}).status_code == 201, "contacto")
    check(anon.post("/api/suscriptores", json={"correo": "news@example.com"}).status_code == 201, "newsletter")
    check(admin.put("/api/config", json={"whatsapp": "59171234567", "welcomeDiscount": "15"}).status_code == 200, "guardar config")
    check(anon.get("/api/config").json["whatsapp"] == "59171234567", "config pública actualizada")

    # ---- copia de seguridad: solo admin, y es una base SQLite válida
    check(anon.get("/api/respaldo").status_code == 403, "respaldo cerrado para anónimos")
    rb = admin.get("/api/respaldo")
    check(rb.status_code == 200 and rb.data[:15] == b"SQLite format 3", "respaldo válido")

    # ---- límite de intentos de login
    limited = app.test_client()
    codes = [limited.post("/api/login", json={"correo": "x@example.com", "password": "mala1234"}).status_code for _ in range(12)]
    check(429 in codes, "el login se bloquea tras muchos intentos")

# ---- en producción NO se puede arrancar con la contraseña de admin por defecto
env = {**os.environ, "RENDER": "1", "SECRET_KEY": "x" * 32, "SQLITE_DB_PATH": os.path.join(tempfile.gettempdir(), "prod_test.db")}
env.pop("ADMIN_PASSWORD", None)
res = subprocess.run([sys.executable, "-c", "import backend.app"], cwd=ROOT, env=env, capture_output=True, text=True)
check(res.returncode != 0 and "ADMIN_PASSWORD" in res.stderr, "producción exige ADMIN_PASSWORD")

print(f"TODO OK — {ok_count} comprobaciones pasaron (backend, sesiones, roles, pedidos, descuento, stock, imágenes).")
