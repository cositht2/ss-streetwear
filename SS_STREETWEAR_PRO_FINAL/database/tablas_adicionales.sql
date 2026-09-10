-- S&S STREETWEAR: tablas adicionales
-- Pega este script en DB Browser > Ejecutar SQL si necesitas reconstruir las tablas.

CREATE TABLE IF NOT EXISTS usuarios (
 id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'cliente', activo INTEGER NOT NULL DEFAULT 1, fecha_registro TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mensajes_contacto (
 id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, correo TEXT NOT NULL, asunto TEXT NOT NULL,
 mensaje TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'Nuevo', fecha TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suscriptores (
 id INTEGER PRIMARY KEY AUTOINCREMENT, correo TEXT NOT NULL UNIQUE, activo INTEGER NOT NULL DEFAULT 1, fecha_registro TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pagos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, metodo TEXT NOT NULL, monto REAL NOT NULL,
 estado TEXT NOT NULL DEFAULT 'Pendiente', referencia TEXT, fecha TEXT NOT NULL,
 FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);
