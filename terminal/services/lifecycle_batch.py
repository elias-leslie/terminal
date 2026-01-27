"""Batch terminal session lifecycle operations.

Handles multi-session operations:
- Reset single session (delete and recreate)
- Reset all sessions for a project
- Reset all sessions globally
- Disable project terminal (delete sessions + update settings)
"""

from __future__ import annotations

from typing import Any

from ..constants import SESSION_MODES
from ..logging_config import get_logger
from ..storage import project_settings as settings_store
from ..storage import terminal as terminal_store
from .lifecycle_core import create_session, delete_session

logger = get_logger(__name__)


def reset_session(session_id: str) -> str | None:
    """Reset a terminal session - delete and recreate with same parameters.

    Gets session details, deletes the session, then creates a new one
    with the same name, project, working directory, mode, and pane.

    Args:
        session_id: Session UUID to reset

    Returns:
        New session UUID, or None if original session not found
    """
    # Get session details first
    session = terminal_store.get_session(session_id)
    if not session:
        logger.warning("reset_session_not_found", session_id=session_id)
        return None

    # Extract parameters for recreation (including pane_id for pane architecture)
    name = session["name"]
    project_id = session.get("project_id")
    working_dir = session.get("working_dir")
    user_id = session.get("user_id")
    mode = session.get("mode", "shell")
    pane_id = session.get("pane_id")

    # Delete old session
    delete_session(session_id)

    # Create new session with same parameters (preserves pane association)
    new_session_id = create_session(
        name=name,
        project_id=project_id,
        working_dir=working_dir,
        user_id=user_id,
        mode=mode,
        pane_id=pane_id,
    )

    logger.info(
        "session_reset",
        old_session_id=session_id,
        new_session_id=new_session_id,
        project_id=project_id,
        mode=mode,
        pane_id=pane_id,
    )

    return new_session_id


def reset_project_sessions(
    project_id: str, working_dir: str | None = None
) -> dict[str, str | None]:
    """Reset all sessions for a project.

    Deletes ALL existing sessions (including orphans) and creates fresh ones.
    If working_dir is provided, uses that for the new sessions.

    Args:
        project_id: Project identifier
        working_dir: Optional new working directory (e.g., from updated project settings)

    Returns:
        Dict with 'shell' and 'claude' keys, each containing new session ID or None
    """
    from ..storage.terminal_project import get_all_project_sessions

    # Get ALL sessions for project (including orphans/duplicates)
    all_sessions = get_all_project_sessions(project_id)

    # Collect working_dir and name from existing sessions for recreation
    session_info: dict[str, dict[str, Any]] = {}
    for session in all_sessions:
        mode = session.get("mode", "shell")
        if mode not in session_info:
            session_info[mode] = {
                "working_dir": session.get("working_dir"),
                "name": session.get("name"),
                "user_id": session.get("user_id"),
            }

    # Delete ALL sessions for this project
    deleted_count = 0
    for session in all_sessions:
        delete_session(session["id"])
        deleted_count += 1

    if deleted_count > 2:
        logger.warning(
            "orphan_sessions_cleaned",
            project_id=project_id,
            deleted_count=deleted_count,
        )

    result: dict[str, str | None] = {"shell": None, "claude": None}

    # Create new sessions
    for mode in SESSION_MODES:
        info = session_info.get(mode, {})
        new_working_dir = working_dir or info.get("working_dir")
        name = info.get("name") or f"Project: {project_id} ({mode.title()})"

        new_session_id = create_session(
            name=name,
            project_id=project_id,
            working_dir=new_working_dir,
            user_id=info.get("user_id"),
            mode=mode,
        )

        logger.info(
            "session_reset",
            new_session_id=new_session_id,
            project_id=project_id,
            mode=mode,
        )

        result[mode] = new_session_id

    logger.info(
        "project_sessions_reset",
        project_id=project_id,
        shell_session=result["shell"],
        claude_session=result["claude"],
        cleaned_orphans=deleted_count - 2 if deleted_count > 2 else 0,
    )

    return result


def reset_all_sessions() -> int:
    """Reset all terminal sessions.

    Lists all active sessions and resets each one.

    Returns:
        Count of sessions reset
    """
    sessions = terminal_store.list_sessions()

    count = 0
    for session in sessions:
        new_id = reset_session(session["id"])
        if new_id:
            count += 1

    logger.info("all_sessions_reset", count=count)

    return count


def disable_project_terminal(project_id: str) -> bool:
    """Disable terminal for a project.

    Deletes ALL sessions (including orphans) and sets project enabled=false.

    Args:
        project_id: Project identifier

    Returns:
        True if successful
    """
    from ..storage.terminal_project import get_all_project_sessions

    # Delete ALL sessions for this project (including orphans)
    all_sessions = get_all_project_sessions(project_id)

    deleted_count = 0
    for session in all_sessions:
        delete_session(session["id"])
        deleted_count += 1

    # Set project as disabled
    settings_store.upsert_settings(project_id, enabled=False)

    logger.info(
        "project_terminal_disabled",
        project_id=project_id,
        deleted_sessions=deleted_count,
    )

    return True
