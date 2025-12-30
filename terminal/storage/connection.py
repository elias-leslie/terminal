"""Database connection management for Terminal Service."""

from collections.abc import Generator
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from ..config import DATABASE_URL

# Module-level pool
_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    """Lazily initialize and return the connection pool."""
    global _pool
    if _pool is None:
        assert DATABASE_URL, "DATABASE_URL must be set"
        _pool = ConnectionPool(
            conninfo=DATABASE_URL,
            min_size=2,
            max_size=10,
            open=True,
        )
    return _pool


@contextmanager
def get_connection() -> Generator[psycopg.Connection, None, None]:
    """Get a database connection from the pool.

    Usage:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    pool = _get_pool()
    with pool.connection() as conn:
        yield conn


def close_pool() -> None:
    """Close the connection pool (for graceful shutdown)."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
