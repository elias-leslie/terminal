"""Terminal Claude integration storage - Claude session and state tracking.

This module handles storage for Claude Code integration features:
- Tracking which Claude session a terminal is connected to
- State machine for Claude process lifecycle
"""

from __future__ import annotations

from uuid import UUID

from .connection import get_connection

# Type alias for session ID (accepts both str and UUID)
SessionId = str | UUID

__all__ = [
    "update_claude_session",
    "update_claude_state",
    "get_claude_state",
]


def _to_str(session_id: SessionId) -> str:
    """Normalize session ID to string for SQL queries."""
    return str(session_id)


def update_claude_session(session_id: SessionId, claude_session: str | None) -> None:
    """Update the last active claude session for a terminal.

    Called when tclaude is run to remember which claude session to reconnect to.
    Pass None or empty string to clear the stored session.

    Args:
        session_id: Terminal session UUID
        claude_session: Name of the Claude tmux session, or None to clear
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE terminal_sessions
            SET last_claude_session = NULLIF(%s, '')
            WHERE id = %s
            """,
            (claude_session or "", _to_str(session_id)),
        )
        conn.commit()


def update_claude_state(
    session_id: SessionId,
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
                (state, _to_str(session_id), expected_state),
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
                (state, _to_str(session_id)),
            )
        result = cur.fetchone()
        conn.commit()

    return result is not None


def get_claude_state(session_id: SessionId) -> str | None:
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
            (_to_str(session_id),),
        )
        row = cur.fetchone()

    if not row:
        return None
    return row[0] or "not_started"
