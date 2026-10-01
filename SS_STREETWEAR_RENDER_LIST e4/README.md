# S&S STREETWEAR — Tienda online (Flask + SQLite/PostgreSQL)

Tienda urbana con catálogo, cuentas de cliente con descuento de bienvenida, pedidos por WhatsApp y panel de administración. Todo en español.

## Estructura (la raíz del repositorio es esta carpeta)
```
render.yaml          configuración de Render (opcional, "Blueprint")
requirements.txt     dependencias: Flask, Werkzeug, gunicorn, psycopg
.python-version      Python 3.12 (evita el 3.14 que Render usa por defecto)
.env.example         variables de ejemplo (sin secretos)
admin/               panel de administración
backend/             app.py (Flask) y pgcompat.py (solo se usa con PostgreSQL)
database/            ss_streetwear.db (catálogo inicial; sin clientes ni pedidos)
shared/              configuración por defecto, favicon, tema, animaciones
user/                tienda pública (HTML, CSS, JS, imágenes)
tests/               pruebas automáticas
```

## Probar en tu PC (Windows)
1. Instala Python 3.12 (o 3.11 / 3.13).
2. Doble clic en `INICIAR_S_S.bat` y abre http://127.0.0.1:5000/
3. Panel admin: inicia sesión arriba con usuario `admin123` y contraseña `12345678admin` (**solo en local**).

> No abras `user/index.html` con doble clic: la tienda necesita Flask.
> Si probaste pedidos en tu PC, restaura `database/ss_streetwear.db` desde el ZIP original antes de subir a GitHub, para no publicar clientes de prueba. Mejor aún: usa un repositorio **privado**.

## 1) Subir a GitHub
Desde la carpeta que contiene `render.yaml` y `backend/` (abre ahí una terminal):
```
git init
git add .
git commit -m "S&S Streetwear listo para Render"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main --force
```
- `--force` reemplaza lo que haya en el repositorio (úsalo para corregir una subida anterior con la estructura equivocada).
- Comprueba en GitHub que en la **primera pantalla** del repositorio se vean `render.yaml`, `requirements.txt`, `backend`, `user`, `admin`… y **no** una carpeta que los contenga.
- Sin Git: en GitHub → *Add file → Upload files* y arrastra el **contenido** de la carpeta (no la carpeta), incluidos `.python-version` y `.gitignore`.

## 2) Desplegar en Render (paso a paso)
**Render → New + → Web Service → conecta tu repositorio** y completa:

| Campo | Valor exacto |
|---|---|
| Language | Python 3 |
| Branch | `main` |
| **Root Directory** | **(déjalo vacío)** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120` |
| Instance Type | Free |
| Health Check Path (Advanced) | `/health` |

**Variables de entorno (Environment):**

| Variable | Valor | ¿Obligatoria? |
|---|---|---|
| `SECRET_KEY` | una cadena larga y aleatoria (32+ caracteres) | **Sí** |
| `ADMIN_PASSWORD` | tu contraseña de administrador (mínimo 10 caracteres) | **Sí** |
| `ADMIN_EMAIL` | `admin123` (es el *usuario* con el que entras; puedes cambiarlo) | No |
| `DATABASE_URL` | cadena de PostgreSQL (ver sección 3) | Recomendada |
| `SITE_URL` | `https://tu-dominio.com` (sin `/` final), cuando conectes tu .com | No |

- Si Render tiene una variable `PYTHON_VERSION`, bórrala (tiene prioridad sobre `.python-version`).
- Sin `SECRET_KEY` o sin `ADMIN_PASSWORD` la app **no arranca en Render**: es a propósito, para que nunca quede una clave conocida.
- Con Blueprint (*New + → Blueprint*) Render lee `render.yaml`, genera `SECRET_KEY` solo y te pide `ADMIN_PASSWORD`.

**Cuando termine:** la URL aparece arriba en tu servicio, con la forma `https://ss-streetwear.onrender.com` (si el nombre estaba ocupado, Render añade un sufijo). Comprueba:
- `https://TU-SERVICIO.onrender.com/health` → `{"ok": true, ...}`
- `https://TU-SERVICIO.onrender.com/health?db=1` → comprueba también la base de datos.
- `https://TU-SERVICIO.onrender.com/` → abre la tienda. Panel admin: inicia sesión arriba con `admin123` y tu `ADMIN_PASSWORD`.

> El plan gratis se duerme tras 15 min sin visitas: la primera carga después puede tardar ~1 minuto.

## 3) ⚠️ Persistencia de datos (léelo)
En el plan **gratis** de Render el disco es **efímero**: con cada reinicio, despliegue o suspensión, `database/ss_streetwear.db` vuelve a ser la copia del repositorio. Se pierden **cuentas, pedidos y cambios hechos en el panel** (productos, stock, ajustes). Los discos persistentes solo existen en planes de pago. La base PostgreSQL gratuita *de Render* caduca a los 30 días.

**Opción recomendada (gratis): PostgreSQL externo en Neon**
1. Crea una cuenta en https://neon.com y un proyecto nuevo (región cercana, p. ej. São Paulo si aparece).
2. Copia la cadena de conexión (*Connection string*, la versión *pooled*): empieza con `postgresql://` y termina con `?sslmode=require`.
3. En Render → Environment añade `DATABASE_URL` con esa cadena y guarda (se vuelve a desplegar solo).
4. Abre `/health?db=1`: debe decir `"db": "postgresql"` y `"ok": true`.
5. Al primer arranque se crean las tablas y se copian los productos y ajustes de `database/ss_streetwear.db`; el administrador se crea con `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Después los datos ya no se pierden.

Si algo falla con PostgreSQL, borra `DATABASE_URL` y la tienda vuelve a SQLite (sin persistencia) mientras lo revisas en *Logs*.

**Opción de pago:** instancia de pago + *Disk* montado en `/var/data` + variable `SQLITE_DB_PATH=/var/data/ss_streetwear.db`. En el primer arranque se copia el catálogo incluido.

**Copias de seguridad:** Admin → Configuración → *Descargar copia de seguridad* (archivo `.db` con SQLite, `.json` con PostgreSQL).

## 4) Dominio propio (.com)
Render → tu servicio → *Settings → Custom Domains → Add* → escribe `tudominio.com` y `www.tudominio.com`, crea en tu registrador los registros DNS que Render te indique y espera la verificación (el HTTPS es automático). Luego pon `SITE_URL=https://tudominio.com`.

## Antes de publicar
1. **Cambia el número de WhatsApp**: Admin → Configuración → WhatsApp (formato `591` + número, sin `+`). Hoy está el ejemplo `59170000000` y los pedidos irían a un número que no es tuyo.
2. Elige tu descuento de bienvenida (Admin → Configuración).
3. Sube tus fotos reales: Admin → Productos e Imágenes de la tienda (se guardan en la base de datos, así que sin PostgreSQL/disco persistente se pierden al reiniciar).

## Cómo está conectado todo
- La tienda, el panel y la API (`/api/...`) los sirve la **misma** app Flask, así que el JavaScript usa rutas relativas (`/api/productos`…) y funciona igual en local, en Render y en tu dominio. No hay URL que configurar y **no hace falta CORS**.
- Roles verificados en el servidor en cada petición de administrador; contraseñas con hash; cookies de sesión `HttpOnly`, `Secure` y `SameSite`; límite de intentos por IP; cabeceras CSP/HSTS.
- Pedido guardado en la base de datos y enviado por WhatsApp; el stock baja al comprar y vuelve al cancelar. El mismo producto en varias tallas es un pedido válido.

## Pruebas
```
pip install -r requirements.txt
python tests/smoke_test.py       # backend completo con SQLite
python tests/test_pg_compat.py   # traducción SQLite → PostgreSQL
```
