S&S STREETWEAR - BASE DE DATOS COMPLETA

La base SQLite incluye:
- productos: catalogo e inventario
- usuarios: cuentas y roles
- clientes: nombre, correo, telefono, direccion, fecha y usuario_id
- pedidos: pedido asociado a cliente, total, fecha y estado
- detalle_pedido: productos, cantidades, precios, talla y color
- pagos: metodo, monto, estado y referencia
- mensajes_contacto: formulario de contacto
- suscriptores: newsletter

FLUJO DE COMPRA:
1. El cliente agrega productos al carrito.
2. Pulsa Comprar por WhatsApp.
3. Aparece el formulario de datos del cliente.
4. Nombre + correo + telefono son obligatorios.
5. Flask guarda/actualiza el cliente en clientes.
6. Flask crea el pedido y sus detalles en SQLite.
7. Se descuenta el stock.
8. Luego se abre WhatsApp con el resumen del pedido.

DB BROWSER:
- Abrir database/ss_streetwear.db
- Ir a Browse Data para ver clientes, pedidos y detalle_pedido.
- Si quieres datos de prueba, Ejecutar SQL y abrir database/clientes_demo.sql.

SERVIDOR:
python backend/app.py
API: http://127.0.0.1:5000
