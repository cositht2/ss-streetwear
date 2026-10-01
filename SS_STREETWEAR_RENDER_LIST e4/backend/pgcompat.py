"""Compatibilidad con PostgreSQL para S&S STREETWEAR.

app.py fue escrito para SQLite. Este módulo permite usar PostgreSQL (por ejemplo la
base gratuita de Neon) SIN reescribir cada consulta: traduce las pocas diferencias de
SQL y ofrece una conexión con la misma forma que la de sqlite3.

Solo se importa cuando existe la variable DATABASE_URL. Sin ella, la tienda usa
SQLite y este archivo no se ejecuta.
"""
import json
import os
import re
import sqlite3
from datetime import datetime

import psycopg

IntegrityError = psycopg.IntegrityError

# Tablas con columna "id" autoincremental: se les añade RETURNING id para poder
# devolver cursor.lastrowid como hace SQLite.
TABLAS_CON_ID = {
    "productos", "usuarios", "clientes", "pedidos", "detalle_pedido",
    "mensajes_contacto", "suscriptores", "pagos",
}
TABLAS_RESPALDO = [
    "productos", "usuarios", "clientes", "pedidos", "detalle_pedido",
    "mensajes_contacto", "suscriptores", "pagos", "medios_tienda", "configuracion",
]

_RE_INSERT = re.compile(r"^\s*INSERT\s+(OR\s+IGNORE\s+)?INTO\s+(\w+)", re.I)


class Fila(dict):
    """Fila que se lee por nombre (fila["id"]) o por posición (fila[0]), como sqlite3.Row."""

    def __getitem__(self, clave):
        if isinstance(clave, int):
            return list(self.values())[clave]
        return super().__getitem__(clave)


def _fabrica_filas(cursor):
    nombres = [c.name for c in (cursor.description or [])]
    return lambda valores: Fila(zip(nombres, valores))


def traducir(sql, con_parametros=True):
    """SQL de SQLite -> PostgreSQL. Devuelve (sql, necesita_returning)."""
    s = sql.strip().rstrip(";")
    returning = False
    m = _RE_INSERT.match(s)
    if m:
        if m.group(1):  # INSERT OR IGNORE INTO t ... -> INSERT INTO t ... ON CONFLICT DO NOTHING
            s = re.sub(r"^(\s*INSERT)\s+OR\s+IGNORE\s+(INTO)", r"\1 \2", s, count=1, flags=re.I)
            s += " ON CONFLICT DO NOTHING"
        elif m.group(2).lower() in TABLAS_CON_ID and "RETURNING" not in s.upper():
            s += " RETURNING id"
            returning = True
    if con_parametros:
        s = s.replace("%", "%%").replace("?", "%s")
    return s, returning


def traducir_ddl(script):
    """Script CREATE TABLE de SQLite -> lista de sentencias PostgreSQL."""
    s = script.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    s = re.sub(r"\bREAL\b", "DOUBLE PRECISION", s)
    return [x.strip() for x in s.split(";") if x.strip()]


class _CursorVacio:
    lastrowid = None
    rowcount = 0

    def fetchone(self):
        return None

    def fetchall(self):
        return []


class Cursor:
    def __init__(self, cur, lastrowid=None):
        self._cur = cur
        self.lastrowid = lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


class Conexion:
    """Misma interfaz que usa app.py de sqlite3.Connection."""

    def __init__(self, url):
        # prepare_threshold=None: compatible con el pooler (PgBouncer) de Neon/Supabase.
        self._c = psycopg.connect(url, row_factory=_fabrica_filas,
                                  prepare_threshold=None, connect_timeout=10)

    def execute(self, sql, params=None):
        if sql.lstrip().upper().startswith("PRAGMA"):
            return _CursorVacio()  # los PRAGMA son cosa de SQLite
        con_params = params is not None
        s, returning = traducir(sql, con_params)
        cur = self._c.cursor()
        cur.execute(s, tuple(params) if con_params else None)
        lastrowid = None
        if returning:
            fila = cur.fetchone()
            lastrowid = fila["id"] if fila else None
        return Cursor(cur, lastrowid)

    def ejecutar_script(self, script):
        for sentencia in traducir_ddl(script):
            self._c.execute(sentencia)

    def agregar_columna(self, tabla, columna, definicion):
        definicion = re.sub(r"\bREAL\b", "DOUBLE PRECISION", definicion)
        self._c.execute(f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS {columna} {definicion}")

    def commit(self):
        self._c.commit()

    def rollback(self):
        self._c.rollback()

    def close(self):
        self._c.close()


def conectar(url):
    return Conexion(url)


def sembrar_desde_sqlite(conn, ruta):
    """Solo la primera vez: copia el catálogo y los ajustes del .db incluido en el proyecto.
    (Los usuarios no se copian: el administrador se crea con ADMIN_EMAIL / ADMIN_PASSWORD.)
    Queda una marca en la tabla 'meta' para no repetirlo aunque luego borres todos los productos."""
    conn.execute("CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')")
    if conn.execute("SELECT 1 FROM meta WHERE clave='semilla_sqlite'").fetchone():
        conn.commit()
        return False
    vacia = conn.execute("SELECT COUNT(*) AS n FROM productos").fetchone()["n"] == 0
    if vacia and os.path.isfile(ruta):
        columnas_pg = {r["column_name"] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name='productos'").fetchall()}
        origen = sqlite3.connect(f"file:{ruta}?mode=ro&immutable=1", uri=True)
        origen.row_factory = sqlite3.Row
        try:
            for fila in origen.execute("SELECT * FROM productos ORDER BY id"):
                d = {k: v for k, v in dict(fila).items() if k in columnas_pg}
                conn.execute(
                    f"INSERT INTO productos({','.join(d)}) VALUES({','.join('?' for _ in d)})",
                    tuple(d.values()))
            conn.execute(
                "SELECT setval(pg_get_serial_sequence('productos','id'), "
                "(SELECT COALESCE(MAX(id),1) FROM productos), (SELECT COUNT(*) > 0 FROM productos))")
            for tabla in ("configuracion", "medios_tienda"):
                for fila in origen.execute(f"SELECT clave,valor FROM {tabla}"):
                    conn.execute(
                        f"INSERT INTO {tabla}(clave,valor) VALUES(?,?) "
                        "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                        (fila["clave"], fila["valor"]))
        finally:
            origen.close()
    conn.execute("INSERT INTO meta(clave,valor) VALUES('semilla_sqlite','1') ON CONFLICT DO NOTHING")
    conn.commit()
    return vacia


def volcar_json(conn):
    """Copia de seguridad completa en JSON (para el botón del panel con PostgreSQL)."""
    datos = {"generado": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "motor": "postgresql", "tablas": {}}
    for tabla in TABLAS_RESPALDO:
        datos["tablas"][tabla] = [dict(r) for r in conn.execute(f"SELECT * FROM {tabla}").fetchall()]
    return json.dumps(datos, ensure_ascii=False, default=str)
