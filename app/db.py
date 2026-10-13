"""
Database connection pool and row helpers.
"""

import json
from decimal import Decimal
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from .config import DATABASE_URL

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(2, 20, DATABASE_URL)
    return _pool


@contextmanager
def get_db():
    pool = get_pool()
    conn = pool.getconn()
    try:
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        pool.putconn(conn)


def _row_to_dict(row):
    """Convert a RealDictRow to a plain dict with JSON-safe types."""
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        elif isinstance(v, memoryview):
            d[k] = bytes(v).decode('utf-8', errors='replace')
        elif isinstance(v, Decimal):
            d[k] = float(v)
        elif k == 'items' and isinstance(v, (list, dict)):
            d[k] = json.dumps(v, ensure_ascii=False)
    return d


def _rows_to_list(rows):
    return [_row_to_dict(r) for r in (rows or [])]
