"""Terminal panes storage - CRUD operations.

Panes contain 1-2 sessions (ad-hoc: 1 shell, project: shell + claude).
"""

from __future__ import annotations

from typing import Any, Literal

import psycopg.sql

from .connection import get_connection
from .pane_db_helpers import (
    PANE_FIELDS,
    PaneId,
    execute_pane_query,
    normalize_pane_id,
    row_to_pane_dict,
)
from .pane_sessions import fetch_all_sessions_by_pane, fetch_sessions_for_pane
from .pane_validation import validate_pane_type_and_project


def list_panes() -> list[dict[str, Any]]:
    """List all panes ordered by pane_order."""
    query = f"SELECT {PANE_FIELDS} FROM terminal_panes ORDER BY pane_order"
    return execute_pane_query(query, (), fetch_mode="all")


def get_pane(pane_id: PaneId) -> dict[str, Any] | None:
    """Get a pane by ID."""
    query = f"SELECT {PANE_FIELDS} FROM terminal_panes WHERE id = %s"
    return execute_pane_query(query, (normalize_pane_id(pane_id),))


def get_pane_with_sessions(pane_id: PaneId) -> dict[str, Any] | None:
    """Get a pane with its sessions."""
    pane = get_pane(pane_id)
    if not pane:
        return None
    pane["sessions"] = fetch_sessions_for_pane(pane_id)
    return pane


def list_panes_with_sessions() -> list[dict[str, Any]]:
    """List all panes with their sessions."""
    panes = list_panes()
    if not panes:
        return []
    sessions_by_pane = fetch_all_sessions_by_pane()
    for pane in panes:
        pane["sessions"] = sessions_by_pane.get(pane["id"], [])
    return panes


def _get_next_pane_order(cur: Any) -> int:
    """Get the next available pane order."""
    cur.execute("SELECT COALESCE(MAX(pane_order), -1) + 1 FROM terminal_panes")
    row = cur.fetchone()
    return row[0] if row else 0


def _compute_session_number(cur: Any, project_id: str | None) -> int:
    """Compute the next session number for a project."""
    if not project_id:
        return 1
    cur.execute(
        "SELECT COALESCE(MAX(session_number), 0) + 1 FROM terminal_sessions WHERE project_id = %s AND is_alive = true",
        (project_id,),
    )
    row = cur.fetchone()
    return row[0] if row else 1


def _insert_session(
    cur: Any,
    name: str,
    project_id: str | None,
    working_dir: str | None,
    mode: Literal["shell", "claude"],
    session_number: int,
    pane_id: str,
) -> dict[str, Any]:
    """Insert a session and return its dict."""
    cur.execute(
        "INSERT INTO terminal_sessions (name, project_id, working_dir, mode, session_number, pane_id) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, name, mode, session_number, is_alive, working_dir",
        (name, project_id, working_dir, mode, session_number, pane_id),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Failed to create {mode} session")
    return {
        "id": str(row[0]),
        "name": row[1],
        "mode": row[2],
        "session_number": row[3],
        "is_alive": row[4],
        "working_dir": row[5],
    }


def create_pane(
    pane_type: Literal["project", "adhoc"],
    pane_name: str,
    project_id: str | None = None,
    pane_order: int | None = None,
) -> dict[str, Any]:
    """Create a new pane (without sessions)."""
    validate_pane_type_and_project(pane_type, project_id)
    with get_connection() as conn, conn.cursor() as cur:
        if pane_order is None:
            pane_order = _get_next_pane_order(cur)
        cur.execute(
            f"INSERT INTO terminal_panes (pane_type, project_id, pane_order, pane_name) VALUES (%s, %s, %s, %s) RETURNING {PANE_FIELDS}",
            (pane_type, project_id, pane_order, pane_name),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            raise ValueError("Failed to create pane")
        return row_to_pane_dict(row)


def create_pane_with_sessions(
    pane_type: Literal["project", "adhoc"],
    pane_name: str,
    project_id: str | None = None,
    working_dir: str | None = None,
    pane_order: int | None = None,
) -> dict[str, Any]:
    """Atomically create a pane with its sessions."""
    validate_pane_type_and_project(pane_type, project_id)
    with get_connection() as conn, conn.cursor() as cur:
        if pane_order is None:
            pane_order = _get_next_pane_order(cur)
        default_mode = "claude" if pane_type == "project" else "shell"
        cur.execute(
            f"INSERT INTO terminal_panes (pane_type, project_id, pane_order, pane_name, active_mode) VALUES (%s, %s, %s, %s, %s) RETURNING {PANE_FIELDS}",
            (pane_type, project_id, pane_order, pane_name, default_mode),
        )
        pane_row = cur.fetchone()
        if not pane_row:
            raise ValueError("Failed to create pane")
        pane = row_to_pane_dict(pane_row)
        session_number = _compute_session_number(cur, project_id)
        session_name = f"Project: {project_id}" if project_id else pane_name
        sessions = [
            _insert_session(
                cur, session_name, project_id, working_dir, "shell", session_number, pane["id"]
            )
        ]
        if pane_type == "project":
            sessions.append(
                _insert_session(
                    cur, session_name, project_id, working_dir, "claude", session_number, pane["id"]
                )
            )
        conn.commit()
        pane["sessions"] = sessions
        return pane


def update_pane(pane_id: PaneId, **fields: Any) -> dict[str, Any] | None:
    """Update pane metadata."""
    allowed = {
        "pane_name",
        "pane_order",
        "active_mode",
        "width_percent",
        "height_percent",
        "grid_row",
        "grid_col",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_pane(pane_id)
    set_clauses = [psycopg.sql.SQL("{} = %s").format(psycopg.sql.Identifier(f)) for f in updates]
    values = [*updates.values(), normalize_pane_id(pane_id)]
    query = psycopg.sql.SQL(
        f"UPDATE terminal_panes SET {{}} WHERE id = %s RETURNING {PANE_FIELDS}"
    ).format(psycopg.sql.SQL(", ").join(set_clauses))
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()
    return row_to_pane_dict(row) if row else None


def delete_pane(pane_id: PaneId) -> bool:
    """Delete a pane and all its sessions (cascading delete)."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM terminal_panes WHERE id = %s RETURNING id", (normalize_pane_id(pane_id),)
        )
        result = cur.fetchone()
        conn.commit()
    return result is not None


def update_pane_order(pane_orders: list[tuple[str, int]]) -> None:
    """Batch update pane ordering."""
    if not pane_orders:
        return
    with get_connection() as conn, conn.cursor() as cur:
        for pane_id, order in pane_orders:
            cur.execute("UPDATE terminal_panes SET pane_order = %s WHERE id = %s", (order, pane_id))
        conn.commit()


def swap_pane_positions(pane_id_a: PaneId, pane_id_b: PaneId) -> bool:
    """Swap positions of two panes."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, pane_order FROM terminal_panes WHERE id IN (%s, %s)",
            (normalize_pane_id(pane_id_a), normalize_pane_id(pane_id_b)),
        )
        rows = cur.fetchall()
        if len(rows) != 2:
            return False
        orders = {str(row[0]): row[1] for row in rows}
        id_a, id_b = normalize_pane_id(pane_id_a), normalize_pane_id(pane_id_b)
        cur.execute("UPDATE terminal_panes SET pane_order = %s WHERE id = %s", (orders[id_b], id_a))
        cur.execute("UPDATE terminal_panes SET pane_order = %s WHERE id = %s", (orders[id_a], id_b))
        conn.commit()
    return True


def count_panes() -> int:
    """Count total number of panes."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM terminal_panes")
        row = cur.fetchone()
    return row[0] if row else 0


def get_next_pane_number(project_id: str | None) -> int:
    """Get the next pane number for naming (e.g., 'Project [2]')."""
    with get_connection() as conn, conn.cursor() as cur:
        if project_id:
            cur.execute(
                "SELECT COUNT(*) + 1 FROM terminal_panes WHERE project_id = %s", (project_id,)
            )
        else:
            cur.execute("SELECT COUNT(*) + 1 FROM terminal_panes WHERE pane_type = 'adhoc'")
        row = cur.fetchone()
    return row[0] if row else 1


def update_pane_layouts(layouts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Batch update pane layout positions and sizes."""
    if not layouts:
        return []
    updated_panes = []
    with get_connection() as conn, conn.cursor() as cur:
        for layout in layouts:
            pane_id = layout.get("pane_id")
            if not pane_id:
                continue
            cur.execute(
                f"UPDATE terminal_panes SET width_percent = COALESCE(%s, width_percent), height_percent = COALESCE(%s, height_percent), grid_row = COALESCE(%s, grid_row), grid_col = COALESCE(%s, grid_col) WHERE id = %s RETURNING {PANE_FIELDS}",
                (
                    layout.get("width_percent"),
                    layout.get("height_percent"),
                    layout.get("grid_row"),
                    layout.get("grid_col"),
                    normalize_pane_id(pane_id),
                ),
            )
            row = cur.fetchone()
            if row:
                updated_panes.append(row_to_pane_dict(row))
        conn.commit()
    return updated_panes


__all__ = [
    "PANE_FIELDS",
    "PaneId",
    "count_panes",
    "create_pane",
    "create_pane_with_sessions",
    "delete_pane",
    "get_next_pane_number",
    "get_pane",
    "get_pane_with_sessions",
    "list_panes",
    "list_panes_with_sessions",
    "swap_pane_positions",
    "update_pane",
    "update_pane_layouts",
    "update_pane_order",
]
