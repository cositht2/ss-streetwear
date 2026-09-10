-- S&S STREETWEAR - CLIENTES DE DEMOSTRACION
-- Estos datos son FICTICIOS y sirven solamente para probar DB Browser y el panel Admin.

INSERT INTO clientes (nombre, correo, telefono, direccion, fecha_registro)
SELECT 'Carlos Mendoza', 'carlos.mendoza@example.com', '70000001', 'Cochabamba', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE correo='carlos.mendoza@example.com');

INSERT INTO clientes (nombre, correo, telefono, direccion, fecha_registro)
SELECT 'Maria Lopez', 'maria.lopez@example.com', '70000002', 'Quillacollo', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE correo='maria.lopez@example.com');

INSERT INTO clientes (nombre, correo, telefono, direccion, fecha_registro)
SELECT 'Diego Fernandez', 'diego.fernandez@example.com', '70000003', 'Sacaba', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE correo='diego.fernandez@example.com');

INSERT INTO clientes (nombre, correo, telefono, direccion, fecha_registro)
SELECT 'Ana Rodriguez', 'ana.rodriguez@example.com', '70000004', 'Cercado', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE correo='ana.rodriguez@example.com');

INSERT INTO clientes (nombre, correo, telefono, direccion, fecha_registro)
SELECT 'Luis Vargas', 'luis.vargas@example.com', '70000005', 'Tiquipaya', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE correo='luis.vargas@example.com');
