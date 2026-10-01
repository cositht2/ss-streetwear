# S&S STREETWEAR — Tienda online (Flask + SQLite)

Tienda urbana con catálogo, cuentas de cliente con descuento de bienvenida, pedidos por WhatsApp y panel de administración. Todo en español.

## Probar en tu PC (Windows)
1. Instala Python 3.11 o superior.
2. Doble clic en `INICIAR_S_S.bat` y abre http://127.0.0.1:5000/
3. Panel admin: inicia sesión arriba con usuario `admin123` y contraseña `12345678admin` (solo en local).

> No abras `user/index.html` con doble clic: la tienda necesita Flask.

## Antes de publicar (importante)
1. **Cambia el número de WhatsApp**: Admin → Configuración → WhatsApp (formato `591` + tu número, sin `+`). Hoy está el número de ejemplo `59170000000` y los pedidos irían a un número que no es tuyo.
2. Elige tu descuento de bienvenida (Admin → Configuración).
3. Sube tus fotos reales: Admin → Productos e Imágenes de la tienda. Se guardan en el servidor y las ven todos los visitantes.

## Publicar gratis en Render
1. Sube esta carpeta a un repositorio de GitHub (`render.yaml` debe quedar en la raíz).
2. En Render: New → Blueprint → elige el repositorio.
3. Render te pedirá `ADMIN_PASSWORD` (mínimo 10 caracteres): es tu contraseña del panel. El usuario es `admin123` (variable `ADMIN_EMAIL`). Si quieres la misma clave de local, escribe `12345678admin`; para una tienda pública conviene una más larga y única. `SECRET_KEY` se genera sola.
4. Cuando termine, abre `https://TU-SERVICIO.onrender.com/health` (debe decir `ok: true`).
5. Variable `SITE_URL`: en Render → Environment escribe tu dominio final, por ejemplo `https://ssstreetwear.com` (sin barra al final). Así Google y las redes sociales ven la dirección y la foto correctas.
6. Dominio propio: Render → Settings → Custom Domains y configura los DNS que te indique. El `.com` se compra aparte.

Sin `ADMIN_PASSWORD` la app **no arranca en producción**: es a propósito, para que nunca quede una contraseña conocida.

## Tus datos y las copias de seguridad
En el plan gratis de Render el disco se borra en cada reinicio o despliegue: se pierden cuentas nuevas, pedidos y cambios hechos en el panel. Para no perder nada:
- Descarga una copia en **Admin → Configuración → Descargar copia de seguridad** cada semana y antes de actualizar.
- Para conservar los cambios, reemplaza `database/ss_streetwear.db` del repositorio por esa copia y súbelo.
- Para datos permanentes de verdad: disco persistente de pago (ver `render.yaml`) o migrar a PostgreSQL.

Los pedidos llegan también a tu WhatsApp, así que el mensaje del cliente queda guardado ahí aunque el servidor se reinicie.

## Qué incluye
- Catálogo con búsqueda, filtros por categoría, favoritos, carrito y ficha de producto con galería.
- Registro e inicio de sesión reales; solo las cuentas marcadas como admin abren `/admin/`.
- Descuento de bienvenida de una sola vez por cuenta (si cancelas ese pedido, la cuenta lo recupera).
- Pedido guardado en la base de datos y enviado por WhatsApp; el stock baja al comprar y vuelve al cancelar.
- Panel: productos, inventario, pedidos y estados, clientes, mensajes, configuración e imágenes de la tienda.
- Seguridad: contraseñas con hash, roles verificados en el servidor, límite de intentos por IP real, cabeceras CSP/HSTS, validación de imágenes.
- Rápido: imágenes en WebP y catálogo liviano con imágenes cacheables. Funciona sin conexión gracias al service worker.

## Pruebas
```
pip install -r requirements.txt
python tests/smoke_test.py
```
Comprueba 58 casos: roles, pedidos, descuento, stock, imágenes, copias de seguridad y arranque en producción.

## Estructura
```
admin/     panel de administración
backend/   app.py (Flask)
database/  ss_streetwear.db (productos y cuenta admin; sin clientes ni pedidos de prueba)
shared/    configuración por defecto y favicon
user/      tienda pública (HTML, CSS, JS, imágenes)
tests/     pruebas automáticas
```
