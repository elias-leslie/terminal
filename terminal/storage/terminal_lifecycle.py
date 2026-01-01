"""Terminal sessions storage - Lifecycle management.

This module handles session lifecycle operations like marking sessions dead,
purging old sessions, and tracking session activity.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .connection import get_connection
from .terminal_crud import (
    TERMINAL_SESSION_FIELDS,
    _execute_session_query,
    update_session,
)
from .terminal_utils import SessionId, _to_str


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


# Import _row_to_dict for touch_session
from .terminal_crud import _row_to_dict  # noqa: E402


__all__ = [
    "mark_dead",
    "purge_dead_sessions",
    "touch_session",
    "list_orphaned",
]
