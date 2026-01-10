"""Terminal panes storage - CRUD operations.

This module handles Create, Read, Update, Delete operations for terminal panes.
Panes contain 1-2 sessions (ad-hoc: 1 shell, project: shell + claude).
"""

from __future__ import annotations

from typing import Any, Literal, overload
from uuid import UUID

import psycopg.sql

from .connection import get_connection

# Type alias for pane ID (accepts both str and UUID)
PaneId = str | UUID

# Standard SELECT field list for terminal_panes queries
PANE_FIELDS = (
    """id, pane_type, project_id, pane_order, pane_name, active_mode, created_at"""
)


def _pane_id_to_str(pane_id: PaneId) -> str:
    """Normalize pane ID to string for SQL queries."""
    return str(pane_id)


@overload
def _execute_pane_query(
    query: str, params: tuple, *, fetch_mode: Literal["one"] = "one"
) -> dict[str, Any] | None: ...


@overload
def _execute_pane_query(
    query: str, params: tuple, *, fetch_mode: Literal["all"]
) -> list[dict[str, Any]]: ...


def _execute_pane_query(
    query: str, params: tuple, *, fetch_mode: Literal["one", "all"] = "one"
) -> dict[str, Any] | list[dict[str, Any]] | None:
    """Execute a pane query and return converted result(s)."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        if fetch_mode == "one":
            row = cur.fetchone()
            return _row_to_pane_dict(row) if row else None
        else:
            rows = cur.fetchall()
            return [_row_to_pane_dict(row) for row in rows]


def _row_to_pane_dict(row: tuple) -> dict[str, Any]:
    """Convert a database row to a pane dict."""
    return {
        "id": str(row[0]),
        "pane_type": row[1],
        "project_id": row[2],
        "pane_order": row[3],
        "pane_name": row[4],
        "active_mode": row[5],
        "created_at": row[6],
    }


def list_panes() -> list[dict[str, Any]]:
    """List all panes ordered by pane_order.

    Returns:
        List of pane dicts
    """
    query = f"""
        SELECT {PANE_FIELDS}
        FROM terminal_panes
        ORDER BY pane_order
    """
    return _execute_pane_query(query, (), fetch_mode="all")


def get_pane(pane_id: PaneId) -> dict[str, Any] | None:
    """Get a pane by ID.

    Args:
        pane_id: Pane UUID (string or UUID)

    Returns:
        Pane dict or None if not found
    """
    query = f"""
        SELECT {PANE_FIELDS}
        FROM terminal_panes
        WHERE id = %s
    """
    return _execute_pane_query(query, (_pane_id_to_str(pane_id),))


def get_pane_with_sessions(pane_id: PaneId) -> dict[str, Any] | None:
    """Get a pane with its sessions.

    Args:
        pane_id: Pane UUID

    Returns:
        Pane dict with 'sessions' list, or None if not found
    """
    pane = get_pane(pane_id)
    if not pane:
        return None

    with get_connection() as conn, conn.cursor() as cur:
        # Include all sessions (dead sessions can be restarted)
        cur.execute(
            """
            SELECT id, name, mode, session_number, is_alive, working_dir
            FROM terminal_sessions
            WHERE pane_id = %s
            ORDER BY mode
            """,
            (_pane_id_to_str(pane_id),),
        )
        rows = cur.fetchall()
        pane["sessions"] = [
            {
                "id": str(row[0]),
                "name": row[1],
                "mode": row[2],
                "session_number": row[3],
                "is_alive": row[4],
                "working_dir": row[5],
            }
            for row in rows
        ]
    return pane


def list_panes_with_sessions() -> list[dict[str, Any]]:
    """List all panes with their sessions.

    Returns:
        List of pane dicts, each with 'sessions' list
    """
    panes = list_panes()
    if not panes:
        return []

    # Fetch all sessions at once for efficiency (include dead sessions - they can be restarted)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT pane_id, id, name, mode, session_number, is_alive, working_dir
            FROM terminal_sessions
            WHERE pane_id IS NOT NULL
            ORDER BY pane_id, mode
            """
        )
        rows = cur.fetchall()

    # Group sessions by pane_id
    sessions_by_pane: dict[str, list[dict]] = {}
    for row in rows:
        pane_id = str(row[0])
        if pane_id not in sessions_by_pane:
            sessions_by_pane[pane_id] = []
        sessions_by_pane[pane_id].append(
            {
                "id": str(row[1]),
                "name": row[2],
                "mode": row[3],
                "session_number": row[4],
                "is_alive": row[5],
                "working_dir": row[6],
            }
        )

    # Attach sessions to panes
    for pane in panes:
        pane["sessions"] = sessions_by_pane.get(pane["id"], [])

    return panes


def create_pane(
    pane_type: Literal["project", "adhoc"],
    pane_name: str,
    project_id: str | None = None,
    pane_order: int | None = None,
) -> dict[str, Any]:
    """Create a new pane (without sessions).

    Use create_pane_with_sessions for atomic pane+session creation.

    Args:
        pane_type: 'project' or 'adhoc'
        pane_name: Display name for the pane
        project_id: Required for project panes, None for adhoc
        pane_order: Position in layout (auto-assigned if None)

    Returns:
        Created pane dict
    """
    if pane_type == "project" and not project_id:
        raise ValueError("project_id required for project panes")
    if pane_type == "adhoc" and project_id:
        raise ValueError("project_id must be None for adhoc panes")

    with get_connection() as conn, conn.cursor() as cur:
        # Auto-assign pane_order if not provided
        if pane_order is None:
            cur.execute("SELECT COALESCE(MAX(pane_order), -1) + 1 FROM terminal_panes")
            order_row = cur.fetchone()
            pane_order = order_row[0] if order_row else 0

        cur.execute(
            f"""
            INSERT INTO terminal_panes (pane_type, project_id, pane_order, pane_name)
            VALUES (%s, %s, %s, %s)
            RETURNING {PANE_FIELDS}
            """,
            (pane_type, project_id, pane_order, pane_name),
        )
        row = cur.fetchone()
        conn.commit()

        if not row:
            raise ValueError("Failed to create pane")
        return _row_to_pane_dict(row)


def create_pane_with_sessions(
    pane_type: Literal["project", "adhoc"],
    pane_name: str,
    project_id: str | None = None,
    working_dir: str | None = None,
    pane_order: int | None = None,
) -> dict[str, Any]:
    """Atomically create a pane with its sessions.

    For project panes: creates shell + claude sessions.
    For adhoc panes: creates shell session only.

    Args:
        pane_type: 'project' or 'adhoc'
        pane_name: Display name for the pane
        project_id: Required for project panes
        working_dir: Initial working directory for sessions
        pane_order: Position in layout (auto-assigned if None)

    Returns:
        Pane dict with 'sessions' list
    """
    if pane_type == "project" and not project_id:
        raise ValueError("project_id required for project panes")
    if pane_type == "adhoc" and project_id:
        raise ValueError("project_id must be None for adhoc panes")

    with get_connection() as conn, conn.cursor() as cur:
        # Auto-assign pane_order if not provided
        if pane_order is None:
            cur.execute("SELECT COALESCE(MAX(pane_order), -1) + 1 FROM terminal_panes")
            order_row = cur.fetchone()
            pane_order = order_row[0] if order_row else 0

        # Create pane
        cur.execute(
            f"""
            INSERT INTO terminal_panes (pane_type, project_id, pane_order, pane_name)
            VALUES (%s, %s, %s, %s)
            RETURNING {PANE_FIELDS}
            """,
            (pane_type, project_id, pane_order, pane_name),
        )
        pane_row = cur.fetchone()
        if not pane_row:
            raise ValueError("Failed to create pane")
        pane = _row_to_pane_dict(pane_row)
        pane_id = pane["id"]

        # Compute session_number for this project
        if project_id:
            cur.execute(
                """
                SELECT COALESCE(MAX(session_number), 0) + 1
                FROM terminal_sessions
                WHERE project_id = %s AND is_alive = true
                """,
                (project_id,),
            )
            num_row = cur.fetchone()
            session_number = num_row[0] if num_row else 1
        else:
            session_number = 1

        sessions = []

        # Create shell session
        session_name = f"Project: {project_id}" if project_id else pane_name
        cur.execute(
            """
            INSERT INTO terminal_sessions (name, project_id, working_dir, mode, session_number, pane_id)
            VALUES (%s, %s, %s, 'shell', %s, %s)
            RETURNING id, name, mode, session_number, is_alive, working_dir
            """,
            (session_name, project_id, working_dir, session_number, pane_id),
        )
        shell_row = cur.fetchone()
        if not shell_row:
            raise ValueError("Failed to create shell session")
        sessions.append(
            {
                "id": str(shell_row[0]),
                "name": shell_row[1],
                "mode": shell_row[2],
                "session_number": shell_row[3],
                "is_alive": shell_row[4],
                "working_dir": shell_row[5],
            }
        )

        # Create claude session for project panes
        if pane_type == "project":
            cur.execute(
                """
                INSERT INTO terminal_sessions (name, project_id, working_dir, mode, session_number, pane_id)
                VALUES (%s, %s, %s, 'claude', %s, %s)
                RETURNING id, name, mode, session_number, is_alive, working_dir
                """,
                (session_name, project_id, working_dir, session_number, pane_id),
            )
            claude_row = cur.fetchone()
            if not claude_row:
                raise ValueError("Failed to create claude session")
            sessions.append(
                {
                    "id": str(claude_row[0]),
                    "name": claude_row[1],
                    "mode": claude_row[2],
                    "session_number": claude_row[3],
                    "is_alive": claude_row[4],
                    "working_dir": claude_row[5],
                }
            )

        conn.commit()

    pane["sessions"] = sessions
    return pane


def update_pane(pane_id: PaneId, **fields: Any) -> dict[str, Any] | None:
    """Update pane metadata.

    Allowed fields: pane_name, pane_order, active_mode

    Args:
        pane_id: Pane UUID
        **fields: Fields to update

    Returns:
        Updated pane dict or None if not found
    """
    allowed_fields = {"pane_name", "pane_order", "active_mode"}
    update_fields = {k: v for k, v in fields.items() if k in allowed_fields}

    if not update_fields:
        return get_pane(pane_id)

    set_clauses = [
        psycopg.sql.SQL("{} = %s").format(psycopg.sql.Identifier(field))
        for field in update_fields
    ]
    values = list(update_fields.values())
    values.append(_pane_id_to_str(pane_id))

    query = psycopg.sql.SQL(
        f"""
        UPDATE terminal_panes
        SET {{}}
        WHERE id = %s
        RETURNING {PANE_FIELDS}
    """
    ).format(psycopg.sql.SQL(", ").join(set_clauses))

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()

    if not row:
        return None
    return _row_to_pane_dict(row)


def delete_pane(pane_id: PaneId) -> bool:
    """Delete a pane and all its sessions (cascading delete).

    Args:
        pane_id: Pane UUID

    Returns:
        True if deleted, False if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM terminal_panes WHERE id = %s RETURNING id",
            (_pane_id_to_str(pane_id),),
        )
        result = cur.fetchone()
        conn.commit()

    return result is not None


def update_pane_order(pane_orders: list[tuple[str, int]]) -> None:
    """Batch update pane ordering.

    Args:
        pane_orders: List of (pane_id, new_order) tuples
    """
    if not pane_orders:
        return

    with get_connection() as conn, conn.cursor() as cur:
        for pane_id, order in pane_orders:
            cur.execute(
                "UPDATE terminal_panes SET pane_order = %s WHERE id = %s",
                (order, pane_id),
            )
        conn.commit()


def swap_pane_positions(pane_id_a: PaneId, pane_id_b: PaneId) -> bool:
    """Swap positions of two panes.

    Args:
        pane_id_a: First pane UUID
        pane_id_b: Second pane UUID

    Returns:
        True if successful, False if either pane not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        # Get current orders
        cur.execute(
            "SELECT id, pane_order FROM terminal_panes WHERE id IN (%s, %s)",
            (_pane_id_to_str(pane_id_a), _pane_id_to_str(pane_id_b)),
        )
        rows = cur.fetchall()

        if len(rows) != 2:
            return False

        orders = {str(row[0]): row[1] for row in rows}
        order_a = orders[_pane_id_to_str(pane_id_a)]
        order_b = orders[_pane_id_to_str(pane_id_b)]

        # Swap
        cur.execute(
            "UPDATE terminal_panes SET pane_order = %s WHERE id = %s",
            (order_b, _pane_id_to_str(pane_id_a)),
        )
        cur.execute(
            "UPDATE terminal_panes SET pane_order = %s WHERE id = %s",
            (order_a, _pane_id_to_str(pane_id_b)),
        )
        conn.commit()

    return True


def count_panes() -> int:
    """Count total number of panes.

    Returns:
        Number of panes
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM terminal_panes")
        row = cur.fetchone()
        return row[0] if row else 0


def get_next_pane_number(project_id: str | None) -> int:
    """Get the next pane number for naming (e.g., "Project [2]").

    Args:
        project_id: Project ID or None for adhoc

    Returns:
        Next pane number (1 if first pane)
    """
    with get_connection() as conn, conn.cursor() as cur:
        if project_id:
            cur.execute(
                "SELECT COUNT(*) + 1 FROM terminal_panes WHERE project_id = %s",
                (project_id,),
            )
        else:
            cur.execute(
                "SELECT COUNT(*) + 1 FROM terminal_panes WHERE pane_type = 'adhoc'"
            )
        row = cur.fetchone()
        return row[0] if row else 1


__all__ = [
    "PaneId",
    "PANE_FIELDS",
    "list_panes",
    "get_pane",
    "get_pane_with_sessions",
    "list_panes_with_sessions",
    "create_pane",
    "create_pane_with_sessions",
    "update_pane",
    "delete_pane",
    "update_pane_order",
    "swap_pane_positions",
    "count_panes",
    "get_next_pane_number",
]
