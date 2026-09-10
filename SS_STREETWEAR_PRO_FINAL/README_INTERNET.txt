S&S STREETWEAR — VERSIÓN PRO / LISTA PARA PUBLICAR

============================================================
1. QUÉ SE MEJORÓ
============================================================
- Cuenta única para clientes y administradores.
- Registro de cuentas desde el botón 👤 de la tienda.
- Login real con sesión Flask.
- Una cuenta normal entra como cliente; una cuenta con rol admin entra automáticamente a /admin/.
- /admin/ está protegido en el servidor, no solo con JavaScript.
- Contraseñas almacenadas con hash seguro de Werkzeug.
- ADMIN_EMAIL / ADMIN_PASSWORD configurables con variables de entorno.
- SECRET_KEY configurable y cookies seguras en producción.
- Productos CRUD conectados realmente a SQLite.
- El administrador puede guardar nombre, SKU, categoría, precio, stock, tallas,
  colores, etiqueta, prioridad, portada, galería, material, fit, destacado y visibilidad.
- Productos ocultos no aparecen en la tienda pública.
- No se puede borrar un producto que ya tiene pedidos: se recomienda ocultarlo.
- Pedidos y clientes protegidos: solo un administrador puede consultarlos.
- Estados de pedido editables desde el panel.
- Validaciones de pedidos y actualización de stock dentro de una transacción.
- Configuración de tienda guardada en SQLite y compartida entre dispositivos.
- /health para comprobar el servidor.
- Se eliminó CORS abierto innecesario porque tienda, API y admin viven en el mismo dominio.
- Se eliminaron dependencias innecesarias.
- Frontend con rutas relativas: funciona en localhost y en el dominio.
- Corrección de categorías del dashboard para coincidir con el catálogo real.
- Protección básica contra HTML/JS inyectado al pintar datos en tablas.

============================================================
2. PROBAR EN WINDOWS
============================================================
Abre CMD dentro de la carpeta del proyecto:

    cd "RUTA\SS_STREETWEAR_APP_FLASK_CORREGIDO_SCROLL - copia\backend"
    py -m venv .venv
    .venv\Scripts\activate
    pip install -r requirements.txt
    python app.py

Después abre:

    http://127.0.0.1:5000/

NO abras user/index.html con doble clic. La página debe abrirse mediante Flask.

============================================================
3. CUENTAS
============================================================
Cuenta de administrador local por defecto:
    Correo: admin@ssstreetwear.com
    Contraseña: Admin123!

IMPORTANTE:
En producción NO uses esa contraseña. En Render configura:
    ADMIN_EMAIL
    ADMIN_PASSWORD
    SECRET_KEY

Las cuentas creadas desde "Crear cuenta" siempre nacen como cliente.
No se permite que una persona se convierta en admin enviando un campo desde el navegador.

============================================================
4. PUBLICAR GRATIS EN RENDER
============================================================
1) Crea una cuenta en GitHub.
2) Crea un repositorio, por ejemplo:
       ss-streetwear
3) Descomprime este proyecto.
4) Sube TODO el contenido del proyecto al repositorio.
   El archivo render.yaml debe quedar en la raíz del repositorio.
5) En Render selecciona:
       New + -> Blueprint
6) Elige el repositorio.
7) Render leerá render.yaml.
8) Cuando solicite ADMIN_PASSWORD, escribe una contraseña fuerte propia.
9) Espera el deploy.
10) Comprueba:
       https://TU-SERVICIO.onrender.com/health
    Debe devolver algo parecido a:
       {"ok":true,"service":"S&S STREETWEAR"}

============================================================
5. PONER TU DOMINIO .COM
============================================================
Un dominio .com se compra aparte; no se puede generar gratis desde este ZIP.

Después de comprar tu dominio en un registrador:
1) En Render abre tu servicio.
2) Ve a Settings -> Custom Domains.
3) Añade:
       www.tudominio.com
       tudominio.com
4) Render mostrará los registros DNS que debes colocar en tu registrador.
5) Guarda los DNS y espera la propagación.
6) Cuando Render marque el dominio como verificado, activa HTTPS.
7) Prueba:
       https://tudominio.com
       https://www.tudominio.com

RECOMENDACIÓN:
Usa www como dominio principal y redirige el dominio raíz según las instrucciones
que Render muestre en ese momento.

============================================================
6. IMPORTANTE: SQLITE Y LA NUBE
============================================================
Este proyecto conserva SQLite porque es excelente para la entrega escolar y para
una instalación pequeña/local.

Pero el almacenamiento local de Render Free puede perderse después de reinicios,
recreaciones o despliegues. Por eso:

- Para DEMO/PROYECTO: SQLite funciona.
- Para TIENDA REAL con clientes/pedidos permanentes: conviene migrar la base a
  PostgreSQL o contratar almacenamiento persistente.

No guardes información importante de clientes en una instancia efímera de Render.

============================================================
7. IMÁGENES
============================================================
Las fotos de producto seleccionadas desde el panel se guardan dentro del registro
del producto como datos de imagen. Esto hace que la portada/galería del producto
pueda verse desde otros dispositivos mientras la base permanezca en el servidor.

La biblioteca visual auxiliar del panel todavía usa almacenamiento del navegador
para sus ranuras de diseño. Para una versión comercial definitiva conviene mover
también esas imágenes a un almacenamiento externo (Cloudinary, S3, etc.).

============================================================
8. ESTRUCTURA
============================================================
admin/
    index.html
    admin.css
    admin.js

backend/
    app.py
    requirements.txt
    iniciar_flask.bat

database/
    ss_streetwear.db
    *.sql

shared/
    data.js

user/
    index.html
    styles.css
    app.js

render.yaml
requirements.txt

============================================================
9. COMPROBACIÓN RÁPIDA ANTES DE ENTREGAR
============================================================
- /health responde 200.
- La tienda carga.
- Productos cargan desde SQLite.
- Crear cuenta funciona.
- Login de cliente funciona.
- Login de admin redirige a /admin/.
- Abrir /admin/ sin sesión redirige a login.
- Un cliente no puede consultar /api/clientes ni /api/pedidos.
- Admin puede crear/editar/ocultar/eliminar productos.
- Los pedidos descuentan stock de forma transaccional.
- Contacto y newsletter guardan información.
- Configuración se guarda en SQLite.
