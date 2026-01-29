"""Database helpers for pane storage operations."""

from __future__ import annotations

from typing import Any, Literal, overload
from uuid import UUID

from .connection import get_connection

# Type alias for pane ID (accepts both str and UUID)
PaneId = str | UUID

# Standard SELECT field list for terminal_panes queries
PANE_FIELDS = """id, pane_type, project_id, pane_order, pane_name, active_mode, created_at,
       width_percent, height_percent, grid_row, grid_col"""


def normalize_pane_id(pane_id: PaneId) -> str:
    """Normalize pane ID to string for SQL queries."""
    return str(pane_id)


def row_to_pane_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    """Convert a database row to a pane dict."""
    return {
        "id": str(row[0]),
        "pane_type": row[1],
        "project_id": row[2],
        "pane_order": row[3],
        "pane_name": row[4],
        "active_mode": row[5],
        "created_at": row[6],
        "width_percent": row[7],
        "height_percent": row[8],
        "grid_row": row[9],
        "grid_col": row[10],
    }


@overload
def execute_pane_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["one"] = "one"
) -> dict[str, Any] | None: ...


@overload
def execute_pane_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["all"]
) -> list[dict[str, Any]]: ...


def execute_pane_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["one", "all"] = "one"
) -> dict[str, Any] | list[dict[str, Any]] | None:
    """Execute a pane query and return converted result(s)."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        if fetch_mode == "one":
            row = cur.fetchone()
            return row_to_pane_dict(row) if row else None
        else:
            rows = cur.fetchall()
            return [row_to_pane_dict(row) for row in rows]


def session_row_to_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    """Convert a session database row to dict."""
    return {
        "id": str(row[0]),
        "name": row[1],
        "mode": row[2],
        "session_number": row[3],
        "is_alive": row[4],
        "working_dir": row[5],
    }


__all__ = [
    "PANE_FIELDS",
    "PaneId",
    "execute_pane_query",
    "normalize_pane_id",
    "row_to_pane_dict",
    "session_row_to_dict",
]
