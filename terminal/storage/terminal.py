"""Terminal sessions storage layer - Session CRUD and lifecycle management.

This module provides data access for terminal session persistence.
Sessions represent persistent tmux terminals that survive browser close.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import psycopg.sql

from .connection import get_connection


def list_sessions(include_dead: bool = False) -> list[dict[str, Any]]:
    """List terminal sessions.

    Args:
        include_dead: Include sessions marked as dead (default False)

    Returns:
        List of session dicts ordered by display_order
    """
    base_query = """
        SELECT id, name, user_id, project_id, working_dir, display_order,
               mode, is_alive, created_at, last_accessed_at, last_claude_session,
               claude_state
        FROM terminal_sessions
    """
    if include_dead:
        query = base_query + " ORDER BY display_order, created_at"
    else:
        query = base_query + " WHERE is_alive = true ORDER BY display_order, created_at"

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return [_row_to_dict(row) for row in rows]


def get_session(session_id: str | UUID) -> dict[str, Any] | None:
    """Get a session by ID.

    Args:
        session_id: Session UUID (string or UUID)

    Returns:
        Session dict or None if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, user_id, project_id, working_dir, display_order,
                   mode, is_alive, created_at, last_accessed_at, last_claude_session,
                   claude_state
            FROM terminal_sessions
            WHERE id = %s
            """,
            (str(session_id),),
        )
        row = cur.fetchone()

    if not row:
        return None
    return _row_to_dict(row)


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


def update_session(session_id: str | UUID, **fields: Any) -> dict[str, Any] | None:
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
    values.append(str(session_id))

    query = psycopg.sql.SQL("""
        UPDATE terminal_sessions
        SET {}
        WHERE id = %s
        RETURNING id, name, user_id, project_id, working_dir, display_order,
                  mode, is_alive, created_at, last_accessed_at, last_claude_session,
                  claude_state
    """).format(psycopg.sql.SQL(", ").join(set_clauses))

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()

    if not row:
        return None
    return _row_to_dict(row)


def delete_session(session_id: str | UUID) -> bool:
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
            (str(session_id),),
        )
        result = cur.fetchone()
        conn.commit()

    return result is not None


def mark_dead(session_id: str | UUID) -> dict[str, Any] | None:
    """Mark a session as dead (tmux session no longer exists).

    The session record is preserved for potential recovery.

    Args:
        session_id: Session UUID

    Returns:
        Updated session dict or None if not found
    """
    return update_session(session_id, is_alive=False)


def touch_session(session_id: str | UUID) -> dict[str, Any] | None:
    """Update last_accessed_at timestamp.

    Call this on WebSocket connect to track session activity.

    Args:
        session_id: Session UUID

    Returns:
        Updated session dict or None if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE terminal_sessions
            SET last_accessed_at = NOW()
            WHERE id = %s
            RETURNING id, name, user_id, project_id, working_dir, display_order,
                      mode, is_alive, created_at, last_accessed_at, last_claude_session,
                      claude_state
            """,
            (str(session_id),),
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

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, user_id, project_id, working_dir, display_order,
                   mode, is_alive, created_at, last_accessed_at, last_claude_session,
                   claude_state
            FROM terminal_sessions
            WHERE last_accessed_at < %s
            ORDER BY last_accessed_at
            """,
            (cutoff,),
        )
        rows = cur.fetchall()

    return [_row_to_dict(row) for row in rows]


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


def get_session_by_project(project_id: str, mode: str = "shell") -> dict[str, Any] | None:
    """Get the active session for a project and mode.

    Each project can have one shell session and one claude session.

    Args:
        project_id: Project identifier
        mode: Session mode - 'shell' or 'claude' (default: 'shell')

    Returns:
        Session dict or None if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, user_id, project_id, working_dir, display_order,
                   mode, is_alive, created_at, last_accessed_at, last_claude_session,
                   claude_state
            FROM terminal_sessions
            WHERE project_id = %s AND mode = %s AND is_alive = true
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (project_id, mode),
        )
        row = cur.fetchone()

    if not row:
        return None
    return _row_to_dict(row)


def get_project_sessions(project_id: str) -> dict[str, dict[str, Any] | None]:
    """Get both shell and claude sessions for a project.

    Args:
        project_id: Project identifier

    Returns:
        Dict with 'shell' and 'claude' keys, each containing session dict or None
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, user_id, project_id, working_dir, display_order,
                   mode, is_alive, created_at, last_accessed_at, last_claude_session,
                   claude_state
            FROM terminal_sessions
            WHERE project_id = %s AND is_alive = true
            ORDER BY mode
            """,
            (project_id,),
        )
        rows = cur.fetchall()

    result: dict[str, dict[str, Any] | None] = {"shell": None, "claude": None}
    for row in rows:
        session = _row_to_dict(row)
        if session["mode"] in result:
            result[session["mode"]] = session
    return result


def delete_project_sessions(project_id: str) -> int:
    """Delete all sessions for a project (hard delete).

    Args:
        project_id: Project identifier

    Returns:
        Number of sessions deleted
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM terminal_sessions WHERE project_id = %s",
            (project_id,),
        )
        count = cur.rowcount
        conn.commit()

    return count


def update_claude_session(session_id: str | UUID, claude_session: str | None) -> None:
    """Update the last active claude session for a terminal.

    Called when tclaude is run to remember which claude session to reconnect to.
    Pass None or empty string to clear the stored session.
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE terminal_sessions
            SET last_claude_session = NULLIF(%s, '')
            WHERE id = %s
            """,
            (claude_session or "", str(session_id)),
        )
        conn.commit()


def update_claude_state(
    session_id: str | UUID,
    state: str,
    expected_state: str | None = None,
) -> bool:
    """Update the Claude state for a terminal session.

    Uses conditional update when expected_state is provided to handle
    race conditions (e.g., two simultaneous start requests).

    Args:
        session_id: Session UUID
        state: New state value (not_started, starting, running, stopped, error)
        expected_state: If provided, only update if current state matches this

    Returns:
        True if update was applied, False if conditional check failed
    """
    with get_connection() as conn, conn.cursor() as cur:
        if expected_state is not None:
            # Conditional update - prevents race conditions
            cur.execute(
                """
                UPDATE terminal_sessions
                SET claude_state = %s
                WHERE id = %s AND claude_state = %s
                RETURNING id
                """,
                (state, str(session_id), expected_state),
            )
        else:
            # Unconditional update
            cur.execute(
                """
                UPDATE terminal_sessions
                SET claude_state = %s
                WHERE id = %s
                RETURNING id
                """,
                (state, str(session_id)),
            )
        result = cur.fetchone()
        conn.commit()

    return result is not None


def get_claude_state(session_id: str | UUID) -> str | None:
    """Get the current Claude state for a session.

    Args:
        session_id: Session UUID

    Returns:
        Current claude_state or None if session not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT claude_state
            FROM terminal_sessions
            WHERE id = %s
            """,
            (str(session_id),),
        )
        row = cur.fetchone()

    if not row:
        return None
    return row[0] or "not_started"
