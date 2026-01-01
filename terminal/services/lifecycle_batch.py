"""Batch terminal session lifecycle operations.

Handles multi-session operations:
- Reset single session (delete and recreate)
- Reset all sessions for a project
- Reset all sessions globally
- Disable project terminal (delete sessions + update settings)
"""

from __future__ import annotations

from ..constants import SESSION_MODES
from ..logging_config import get_logger
from ..storage import project_settings as settings_store
from ..storage import terminal as terminal_store
from .lifecycle_core import create_session, delete_session

logger = get_logger(__name__)


def reset_session(session_id: str) -> str | None:
    """Reset a terminal session - delete and recreate with same parameters.

    Gets session details, deletes the session, then creates a new one
    with the same name, project, working directory, and mode.

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

    # Extract parameters for recreation
    name = session["name"]
    project_id = session.get("project_id")
    working_dir = session.get("working_dir")
    user_id = session.get("user_id")
    mode = session.get("mode", "shell")

    # Delete old session
    delete_session(session_id)

    # Create new session with same parameters
    new_session_id = create_session(
        name=name,
        project_id=project_id,
        working_dir=working_dir,
        user_id=user_id,
        mode=mode,
    )

    logger.info(
        "session_reset",
        old_session_id=session_id,
        new_session_id=new_session_id,
        project_id=project_id,
        mode=mode,
    )

    return new_session_id


def reset_project_sessions(
    project_id: str, working_dir: str | None = None
) -> dict[str, str | None]:
    """Reset all sessions for a project.

    Gets both shell and claude sessions for the project, resets each one.
    If working_dir is provided, uses that instead of the old session's dir.

    Args:
        project_id: Project identifier
        working_dir: Optional new working directory (e.g., from updated project settings)

    Returns:
        Dict with 'shell' and 'claude' keys, each containing new session ID or None
    """
    # Get both sessions for project
    sessions = terminal_store.get_project_sessions(project_id)

    result: dict[str, str | None] = {"shell": None, "claude": None}

    for mode in SESSION_MODES:
        session = sessions.get(mode)
        if session:
            # Delete old session
            old_session_id = session["id"]
            delete_session(old_session_id)

            # Create new session with potentially updated working_dir
            new_working_dir = working_dir or session.get("working_dir")
            new_session_id = create_session(
                name=session["name"],
                project_id=project_id,
                working_dir=new_working_dir,
                user_id=session.get("user_id"),
                mode=mode,
            )

            logger.info(
                "session_reset",
                old_session_id=old_session_id,
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

    Deletes both shell and claude sessions and sets project enabled=false.

    Args:
        project_id: Project identifier

    Returns:
        True if successful
    """
    # Delete all sessions for this project
    sessions = terminal_store.get_project_sessions(project_id)

    for mode in SESSION_MODES:
        session = sessions.get(mode)
        if session:
            delete_session(session["id"])

    # Set project as disabled
    settings_store.upsert_settings(project_id, enabled=False)

    logger.info("project_terminal_disabled", project_id=project_id)

    return True
