# S&S STREETWEAR

Tienda urbana premium con frontend responsive, API Flask, cuentas, panel de administración, catálogo, pedidos, clientes, contacto y SQLite.

## Inicio local

```bash
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python backend/app.py
```

Abre `http://127.0.0.1:5000/`. No abras `user/index.html` con doble clic: la app debe ejecutarse desde Flask para que funcionen API, sesión y base de datos.

## Administrador local

Correo: `admin@ssstreetwear.com`
Contraseña inicial: `Admin123!`

En producción configura `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `SECRET_KEY`.

## Publicación

`render.yaml` está preparado para un servicio Gunicorn. La aplicación conserva SQLite como opción local y admite una ruta `SQLITE_DB_PATH` cuando tu hosting tenga almacenamiento persistente.

Consulta `README_INTERNET.txt` y `README_BASE_DATOS.txt` antes de publicar.
