"""Terminal sessions storage - Project-specific queries.

This module handles project-scoped session queries, including
finding sessions by project and mode.
"""

from __future__ import annotations

from typing import Any

from .terminal_crud import TERMINAL_SESSION_FIELDS, _execute_session_query


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
    "get_session_by_project",
    "get_dead_session_by_project",
    "get_project_sessions",
]
