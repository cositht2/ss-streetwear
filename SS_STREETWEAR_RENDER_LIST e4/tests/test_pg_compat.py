"""Pruebas de la traducción SQLite -> PostgreSQL (no necesitan un servidor PostgreSQL).

    python tests/test_pg_compat.py
"""
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

try:
    import psycopg  # noqa: F401
except ImportError:  # solo para poder probar la traducción sin psycopg instalado
    stub = types.ModuleType("psycopg")
    stub.IntegrityError = type("IntegrityError", (Exception,), {})
    sys.modules["psycopg"] = stub

from backend import pgcompat as pg

n = 0


def check(cond, msg):
    global n
    assert cond, msg
    n += 1


sql, ret = pg.traducir("SELECT * FROM productos WHERE id=? AND activo=?")
check(sql == "SELECT * FROM productos WHERE id=%s AND activo=%s" and not ret, "placeholders ? -> %s")

sql, ret = pg.traducir("""INSERT INTO productos
            (nombre,precio) VALUES (?,?)""")
check(sql.endswith("RETURNING id") and ret, "INSERT con id devuelve RETURNING id (también en varias líneas)")

sql, ret = pg.traducir("INSERT OR IGNORE INTO configuracion(clave,valor) VALUES(?,?)")
check(sql == "INSERT INTO configuracion(clave,valor) VALUES(%s,%s) ON CONFLICT DO NOTHING" and not ret,
      "INSERT OR IGNORE -> ON CONFLICT DO NOTHING")

sql, ret = pg.traducir("INSERT INTO configuracion(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor")
check("RETURNING" not in sql and "ON CONFLICT(clave) DO UPDATE" in sql and not ret, "UPSERT sin RETURNING")

sql, _ = pg.traducir("SELECT 1 WHERE 'a'='%'", con_parametros=False)
check("%%" not in sql, "sin parámetros no se duplica el %")

import re
app_src = open(os.path.join(ROOT, "backend", "app.py"), encoding="utf-8").read()
script = re.search(r'script_tablas = """(.*?)"""', app_src, re.S).group(1)
sentencias = pg.traducir_ddl(script)
unido = "\n".join(sentencias)
check(len(sentencias) >= 15, f"se traducen todas las sentencias del esquema ({len(sentencias)})")
check("AUTOINCREMENT" not in unido and not re.search(r"\bREAL\b", unido), "el esquema no conserva sintaxis de SQLite")
check(unido.count("SERIAL PRIMARY KEY") == 8, "las 8 tablas con id usan SERIAL")

f = pg.Fila([("id", 7), ("nombre", "x")])
check(f["id"] == 7 and f[0] == 7 and f[1] == "x" and dict(f) == {"id": 7, "nombre": "x"}, "Fila se lee por nombre y por posición")

# Todas las consultas de app.py que llevan ? deben traducirse sin dejar ningún ?
consultas = re.findall(r'conn\.execute\(\s*(?:f)?"""(.*?)"""|conn\.execute\(\s*(?:f)?"((?:[^"\\]|\\.)*)"', app_src, re.S)
total = 0
for a, b in consultas:
    q = (a or b)
    if "?" in q and "{" not in q:
        out, _ = pg.traducir(q)
        check("?" not in out, f"consulta sin traducir: {q[:60]}")
        total += 1
check(total > 20, f"se revisaron {total} consultas de app.py")

print(f"TODO OK — {n} comprobaciones de traducción PostgreSQL.")
