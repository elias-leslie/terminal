"""Terminal sessions storage - CRUD operations.

This module handles basic Create, Read, Update, Delete operations
for terminal session persistence.
"""

from __future__ import annotations

from typing import Any, Literal, overload

import psycopg.sql

from .connection import get_connection
from .terminal_utils import SessionId, _to_str

# Standard SELECT field list for terminal_sessions queries
# Keep in sync with _row_to_dict() field order
TERMINAL_SESSION_FIELDS = """id, name, user_id, project_id, working_dir, display_order,
               mode, session_number, is_alive, created_at, last_accessed_at,
               last_claude_session, claude_state, pane_id"""


@overload
def _execute_session_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["one"] = "one"
) -> dict[str, Any] | None: ...


@overload
def _execute_session_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["all"]
) -> list[dict[str, Any]]: ...


def _execute_session_query(
    query: str, params: tuple[Any, ...], *, fetch_mode: Literal["one", "all"] = "one"
) -> dict[str, Any] | list[dict[str, Any]] | None:
    """Execute a session query and return converted result(s).

    Centralizes the query -> fetch -> _row_to_dict pattern.

    Args:
        query: SQL query string (should SELECT TERMINAL_SESSION_FIELDS)
        params: Query parameters
        fetch_mode: 'one' returns single dict/None, 'all' returns list

    Returns:
        Single session dict, list of dicts, or None
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        if fetch_mode == "one":
            row = cur.fetchone()
            return _row_to_dict(row) if row else None
        else:
            rows = cur.fetchall()
            return [_row_to_dict(row) for row in rows]


def _row_to_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    """Convert a database row to a session dict."""
    return {
        "id": str(row[0]),
        "name": row[1],
        "user_id": row[2],
        "project_id": row[3],
        "working_dir": row[4],
        "display_order": row[5],
        "mode": row[6],
        "session_number": row[7],
        "is_alive": row[8],
        "created_at": row[9],
        "last_accessed_at": row[10],
        "last_claude_session": row[11] if len(row) > 11 else None,
        "claude_state": row[12] if len(row) > 12 else "not_started",
        "pane_id": str(row[13]) if len(row) > 13 and row[13] else None,
    }


def list_sessions(include_dead: bool = False) -> list[dict[str, Any]]:
    """List terminal sessions.

    Args:
        include_dead: Include sessions marked as dead (default False)

    Returns:
        List of session dicts ordered by display_order
    """
    if include_dead:
        query = f"""
            SELECT {TERMINAL_SESSION_FIELDS}
            FROM terminal_sessions
            ORDER BY display_order, created_at
        """
    else:
        query = f"""
            SELECT {TERMINAL_SESSION_FIELDS}
            FROM terminal_sessions
            WHERE is_alive = true
            ORDER BY display_order, created_at
        """
    return _execute_session_query(query, (), fetch_mode="all")


def get_session(session_id: SessionId) -> dict[str, Any] | None:
    """Get a session by ID.

    Args:
        session_id: Session UUID (string or UUID)

    Returns:
        Session dict or None if not found
    """
    query = f"""
        SELECT {TERMINAL_SESSION_FIELDS}
        FROM terminal_sessions
        WHERE id = %s
    """
    return _execute_session_query(query, (_to_str(session_id),))


def create_session(
    name: str,
    project_id: str | None = None,
    working_dir: str | None = None,
    user_id: str | None = None,
    mode: str = "shell",
    pane_id: str | None = None,
) -> str:
    """Create a new terminal session.

    The session ID is generated server-side to prevent client collisions.
    session_number is computed as MAX+1 for the project+mode combination,
    allowing multiple sessions per project (removed unique constraint).

    Args:
        name: Display name for the session
        project_id: Optional project ID for context
        working_dir: Initial working directory (default: user home)
        user_id: Optional user ID (for future auth support)
        mode: Session mode - 'shell' or 'claude' (default: 'shell')
        pane_id: Pane this session belongs to (required for pane architecture)

    Returns:
        Server-generated session UUID as string
    """
    with get_connection() as conn, conn.cursor() as cur:
        # Compute session_number: MAX+1 for this project+mode, or 1 if none exist
        if project_id:
            cur.execute(
                """
                SELECT COALESCE(MAX(session_number), 0) + 1
                FROM terminal_sessions
                WHERE project_id = %s AND mode = %s AND is_alive = true
                """,
                (project_id, mode),
            )
            row = cur.fetchone()
            session_number = row[0] if row else 1
        else:
            session_number = 1

        cur.execute(
            """
            INSERT INTO terminal_sessions
                (name, user_id, project_id, working_dir, mode, session_number, pane_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (name, user_id, project_id, working_dir, mode, session_number, pane_id),
        )
        row = cur.fetchone()
        conn.commit()

    if not row:
        raise ValueError("Failed to create terminal session")

    return str(row[0])


def update_session(session_id: SessionId, **fields: Any) -> dict[str, Any] | None:
    """Update session metadata.

    Allowed fields: name, display_order, is_alive, working_dir

    Args:
        session_id: Session UUID
        **fields: Fields to update

    Returns:
        Updated session dict or None if not found
    """
    allowed_fields = {"name", "display_order", "is_alive", "working_dir"}
    update_fields = {k: v for k, v in fields.items() if k in allowed_fields}

    if not update_fields:
        return get_session(session_id)

    set_clauses = [
        psycopg.sql.SQL("{} = %s").format(psycopg.sql.Identifier(field)) for field in update_fields
    ]
    values = list(update_fields.values())
    values.append(_to_str(session_id))

    query = psycopg.sql.SQL(
        f"""
        UPDATE terminal_sessions
        SET {{}}
        WHERE id = %s
        RETURNING {TERMINAL_SESSION_FIELDS}
    """
    ).format(psycopg.sql.SQL(", ").join(set_clauses))

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()

    if not row:
        return None
    return _row_to_dict(row)


def delete_session(session_id: SessionId) -> bool:
    """Delete a session (hard delete).

    Use this when user explicitly closes the terminal.

    Args:
        session_id: Session UUID

    Returns:
        True if deleted, False if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM terminal_sessions WHERE id = %s RETURNING id",
            (_to_str(session_id),),
        )
        result = cur.fetchone()
        conn.commit()

    return result is not None


__all__ = [
    "TERMINAL_SESSION_FIELDS",
    "_execute_session_query",
    "_row_to_dict",
    "create_session",
    "delete_session",
    "get_session",
    "list_sessions",
    "update_session",
]
