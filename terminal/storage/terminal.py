"""Terminal sessions storage layer - Session CRUD and lifecycle management.

This module provides data access for terminal session persistence.
Sessions represent persistent tmux terminals that survive browser close.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal, overload

import psycopg.sql

from .connection import get_connection
from .terminal_utils import SessionId, _to_str

# Claude-related functions moved to terminal_claude.py
# Re-export for backward compatibility
from .terminal_claude import (
    get_claude_state,
    update_claude_session,
    update_claude_state,
)


# Standard SELECT field list for terminal_sessions queries
# Keep in sync with _row_to_dict() field order
TERMINAL_SESSION_FIELDS = """id, name, user_id, project_id, working_dir, display_order,
               mode, is_alive, created_at, last_accessed_at, last_claude_session,
               claude_state"""


@overload
def _execute_session_query(
    query: str, params: tuple, *, fetch_mode: Literal["one"] = "one"
) -> dict[str, Any] | None: ...


@overload
def _execute_session_query(
    query: str, params: tuple, *, fetch_mode: Literal["all"]
) -> list[dict[str, Any]]: ...


def _execute_session_query(
    query: str, params: tuple, *, fetch_mode: Literal["one", "all"] = "one"
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
) -> str:
    """Create a new terminal session.

    The session ID is generated server-side to prevent client collisions.

    Args:
        name: Display name for the session
        project_id: Optional project ID for context
        working_dir: Initial working directory (default: user home)
        user_id: Optional user ID (for future auth support)
        mode: Session mode - 'shell' or 'claude' (default: 'shell')

    Returns:
        Server-generated session UUID as string
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO terminal_sessions (name, user_id, project_id, working_dir, mode)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (name, user_id, project_id, working_dir, mode),
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
        psycopg.sql.SQL("{} = %s").format(psycopg.sql.Identifier(field))
        for field in update_fields
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


def mark_dead(session_id: SessionId) -> dict[str, Any] | None:
    """Mark a session as dead (tmux session no longer exists).

    The session record is preserved for potential recovery.

    Args:
        session_id: Session UUID

    Returns:
        Updated session dict or None if not found
    """
    return update_session(session_id, is_alive=False)


def purge_dead_sessions(older_than_days: int = 7) -> int:
    """Permanently delete dead sessions older than N days.

    Called during startup reconciliation to prevent unbounded growth
    of dead session records.

    Args:
        older_than_days: Delete dead sessions not accessed in this many days

    Returns:
        Number of sessions deleted
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM terminal_sessions
            WHERE is_alive = false AND last_accessed_at < %s
            """,
            (cutoff,),
        )
        deleted_count = cur.rowcount
        conn.commit()

    return deleted_count


def touch_session(session_id: SessionId) -> dict[str, Any] | None:
    """Update last_accessed_at timestamp.

    Call this on WebSocket connect to track session activity.

    Args:
        session_id: Session UUID

    Returns:
        Updated session dict or None if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE terminal_sessions
            SET last_accessed_at = NOW()
            WHERE id = %s
            RETURNING {TERMINAL_SESSION_FIELDS}
            """,
            (_to_str(session_id),),
        )
        row = cur.fetchone()
        conn.commit()

    if not row:
        return None
    return _row_to_dict(row)


def list_orphaned(older_than_days: int = 30) -> list[dict[str, Any]]:
    """List sessions not accessed in N days.

    Used by cleanup job to find abandoned sessions.

    Args:
        older_than_days: Days since last access (default 30)

    Returns:
        List of orphaned session dicts
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    query = f"""
        SELECT {TERMINAL_SESSION_FIELDS}
        FROM terminal_sessions
        WHERE last_accessed_at < %s
        ORDER BY last_accessed_at
    """
    return _execute_session_query(query, (cutoff,), fetch_mode="all")


def _row_to_dict(row: tuple) -> dict[str, Any]:
    """Convert a database row to a session dict."""
    return {
        "id": str(row[0]),
        "name": row[1],
        "user_id": row[2],
        "project_id": row[3],
        "working_dir": row[4],
        "display_order": row[5],
        "mode": row[6],
        "is_alive": row[7],
        "created_at": row[8],
        "last_accessed_at": row[9],
        "last_claude_session": row[10] if len(row) > 10 else None,
        "claude_state": row[11] if len(row) > 11 else "not_started",
    }


def get_session_by_project(
    project_id: str, mode: str = "shell"
) -> dict[str, Any] | None:
    """Get the active session for a project and mode.

    Each project can have one shell session and one claude session.

    Args:
        project_id: Project identifier
        mode: Session mode - 'shell' or 'claude' (default: 'shell')

    Returns:
        Session dict or None if not found
    """
    query = f"""
        SELECT {TERMINAL_SESSION_FIELDS}
        FROM terminal_sessions
        WHERE project_id = %s AND mode = %s AND is_alive = true
        ORDER BY created_at DESC
        LIMIT 1
    """
    return _execute_session_query(query, (project_id, mode))


def get_dead_session_by_project(
    project_id: str, mode: str = "shell"
) -> dict[str, Any] | None:
    """Get a dead session for a project and mode (for resurrection).

    The unique constraint covers all sessions including dead ones.
    This function finds dead sessions that can be resurrected.

    Args:
        project_id: Project identifier
        mode: Session mode - 'shell' or 'claude' (default: 'shell')

    Returns:
        Dead session dict or None if not found
    """
    query = f"""
        SELECT {TERMINAL_SESSION_FIELDS}
        FROM terminal_sessions
        WHERE project_id = %s AND mode = %s AND is_alive = false
        ORDER BY created_at DESC
        LIMIT 1
    """
    return _execute_session_query(query, (project_id, mode))


def get_project_sessions(project_id: str) -> dict[str, dict[str, Any] | None]:
    """Get both shell and claude sessions for a project.

    Args:
        project_id: Project identifier

    Returns:
        Dict with 'shell' and 'claude' keys, each containing session dict or None
    """
    query = f"""
        SELECT {TERMINAL_SESSION_FIELDS}
        FROM terminal_sessions
        WHERE project_id = %s AND is_alive = true
        ORDER BY mode
    """
    sessions = _execute_session_query(query, (project_id,), fetch_mode="all")
    result: dict[str, dict[str, Any] | None] = {"shell": None, "claude": None}
    for session in sessions:
        if session["mode"] in result:
            result[session["mode"]] = session
    return result


__all__ = [
    # CRUD
    "list_sessions",
    "get_session",
    "create_session",
    "update_session",
    "delete_session",
    # Lifecycle
    "mark_dead",
    "purge_dead_sessions",
    "touch_session",
    "list_orphaned",
    # Project queries
    "get_session_by_project",
    "get_dead_session_by_project",
    "get_project_sessions",
    # Claude (re-exported from terminal_claude.py)
    "update_claude_session",
    "update_claude_state",
    "get_claude_state",
]
