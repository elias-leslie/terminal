"""Terminal session lifecycle management.

Provides atomic operations for terminal session lifecycle:
- Atomic create (DB + tmux, rollback on failure)
- Atomic delete (tmux kill + DB delete)
- Session resurrection (recreate tmux if DB record exists)
- Startup reconciliation (sync DB ↔ tmux state)
- Abandoned session cleanup

The database is the source of truth; tmux is the implementation detail.
"""

from __future__ import annotations

from ..constants import SESSION_MODES
from ..logging_config import get_logger
from ..storage import project_settings as settings_store
from ..storage import terminal as terminal_store
from ..utils.tmux import (
    TmuxError,
    create_tmux_session,
    get_tmux_session_name,
    list_tmux_sessions,
    run_tmux_command,
    tmux_session_exists,
)

logger = get_logger(__name__)


def _kill_tmux_session(session_id: str, ignore_missing: bool = True) -> bool:
    """Kill a tmux session.

    Args:
        session_id: Session UUID
        ignore_missing: Don't raise error if session doesn't exist

    Returns:
        True if session was killed, False if it didn't exist

    Raises:
        TmuxError: If kill fails (and ignore_missing is False)
    """
    session_name = get_tmux_session_name(session_id)

    success, error = run_tmux_command(["kill-session", "-t", session_name])

    if not success:
        if ignore_missing and "session not found" in error.lower():
            logger.info("tmux_session_not_found", session=session_name)
            return False
        if not ignore_missing:
            raise TmuxError(f"Failed to kill tmux session: {error}")
        return False

    logger.info("tmux_session_killed", session=session_name)
    return True


def _resurrect_dead_session(
    dead_session: dict,
    mode: str,
    name: str,
    working_dir: str | None,
) -> str:
    """Resurrect a dead session by updating DB and creating new tmux session.

    Rollback strategy: On tmux creation failure, marks session as dead
    (mark_dead) rather than deleting, since DB record already existed.

    Args:
        dead_session: Dead session dict from storage
        mode: Session mode ('shell' or 'claude')
        name: New display name for resurrected session
        working_dir: Optional working directory override

    Returns:
        Session ID of resurrected session

    Raises:
        TmuxError: If tmux creation fails (session marked dead again)
    """
    session_id = dead_session["id"]
    project_id = dead_session.get("project_id")

    logger.info(
        "resurrecting_dead_session",
        session_id=session_id,
        project_id=project_id,
        mode=mode,
    )

    # Update the session record
    terminal_store.update_session(
        session_id,
        name=name,
        working_dir=working_dir,
        is_alive=True,
    )

    # Create new tmux session
    try:
        create_tmux_session(session_id, working_dir)
    except TmuxError as e:
        # Rollback: mark dead again (resurrection failed)
        logger.error(
            "tmux_create_failed_rolling_back_resurrection",
            session_id=session_id,
            error=str(e),
        )
        terminal_store.mark_dead(session_id)
        raise

    logger.info(
        "session_resurrected",
        session_id=session_id,
        name=name,
        project_id=project_id,
        mode=mode,
    )

    return session_id


def create_session(
    name: str,
    project_id: str | None = None,
    working_dir: str | None = None,
    user_id: str | None = None,
    mode: str = "shell",
) -> str:
    """Create a new terminal session atomically.

    If a dead session exists for the same project_id+mode, resurrects it
    instead of creating a new one (to avoid unique constraint violations).

    Rollback strategy:
    - Resurrection path: Uses mark_dead (preserves existing DB record)
    - New creation path: Uses delete_session (removes newly created record)

    Creates DB record first, then tmux session. If tmux creation fails,
    rolls back the DB record.

    Args:
        name: Display name for the session
        project_id: Optional project ID for context
        working_dir: Initial working directory
        user_id: Optional user ID (for future auth)
        mode: Session mode - 'shell' or 'claude' (default: 'shell')

    Returns:
        Server-generated session UUID

    Raises:
        TmuxError: If tmux session creation fails (after rollback)
    """
    # Step 0: Check for dead session to resurrect (unique constraint workaround)
    if project_id:
        dead_session = terminal_store.get_dead_session_by_project(project_id, mode)
        if dead_session:
            return _resurrect_dead_session(dead_session, mode, name, working_dir)

    # Step 1: Create DB record
    session_id = terminal_store.create_session(
        name=name,
        project_id=project_id,
        working_dir=working_dir,
        user_id=user_id,
        mode=mode,
    )

    # Step 2: Create tmux session
    try:
        create_tmux_session(session_id, working_dir)
    except TmuxError as e:
        # Rollback: delete newly created DB record
        logger.error(
            "tmux_create_failed_rolling_back_new_session",
            session_id=session_id,
            error=str(e),
        )
        terminal_store.delete_session(session_id)
        raise

    logger.info(
        "session_created",
        session_id=session_id,
        name=name,
        project_id=project_id,
        mode=mode,
    )

    return session_id


def delete_session(session_id: str) -> bool:
    """Delete a terminal session.

    Kills tmux session first, then deletes DB record.
    Idempotent - returns True even if session didn't exist.

    Args:
        session_id: Session UUID

    Returns:
        True (always succeeds, idempotent)
    """
    # Step 1: Kill tmux session (ignore if missing)
    _kill_tmux_session(session_id, ignore_missing=True)

    # Step 2: Delete DB record
    deleted = terminal_store.delete_session(session_id)

    if deleted:
        logger.info("session_deleted", session_id=session_id)
    else:
        logger.info("session_not_found_for_delete", session_id=session_id)

    return True


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


def ensure_session_alive(session_id: str) -> bool:
    """Ensure a session is alive, recreating tmux if necessary.

    Called on WebSocket connect. If tmux session died but DB record
    exists, attempts to recreate the tmux session.

    Rollback strategy: On tmux creation failure, marks session as dead
    (mark_dead) since DB record already existed.

    Args:
        session_id: Session UUID

    Returns:
        True if session is alive (or was successfully resurrected)
        False if session doesn't exist in DB or resurrection failed
    """
    # Check DB record exists
    session = terminal_store.get_session(session_id)
    if not session:
        logger.warning("ensure_alive_no_db_record", session_id=session_id)
        return False

    # Check tmux session
    if tmux_session_exists(session_id):
        # Ensure DB says it's alive
        if not session["is_alive"]:
            terminal_store.update_session(session_id, is_alive=True)
            logger.info("session_marked_alive", session_id=session_id)
        return True

    # tmux died - try to recreate
    logger.info("session_resurrection_attempt", session_id=session_id)

    try:
        create_tmux_session(session_id, session.get("working_dir"))
        terminal_store.update_session(session_id, is_alive=True)
        logger.info("session_resurrected", session_id=session_id)
        return True
    except TmuxError as e:
        # Rollback: mark dead (resurrection failed)
        logger.error(
            "tmux_create_failed_rolling_back_ensure_alive",
            session_id=session_id,
            error=str(e),
        )
        terminal_store.mark_dead(session_id)
        return False


def reconcile_on_startup(purge_after_days: int = 7) -> dict[str, int]:
    """Reconcile DB with tmux state on server startup.

    Syncs the database with the actual tmux session state:
    - Sessions in DB but not tmux: mark as dead
    - Sessions in DB and tmux: mark as alive
    - Dead sessions older than purge_after_days: permanently deleted

    Args:
        purge_after_days: Delete dead sessions not accessed in this many days

    Returns:
        Stats dict with counts of sessions processed
    """
    logger.info("reconciliation_starting")

    # Get all DB sessions (including dead ones)
    db_sessions = terminal_store.list_sessions(include_dead=True)

    # Get all tmux sessions
    tmux_sessions = list_tmux_sessions()

    stats = {
        "total_db_sessions": len(db_sessions),
        "total_tmux_sessions": len(tmux_sessions),
        "marked_alive": 0,
        "marked_dead": 0,
        "purged": 0,
    }

    for session in db_sessions:
        session_id = session["id"]

        if session_id in tmux_sessions:
            # Session exists in both - ensure marked alive
            if not session["is_alive"]:
                terminal_store.update_session(session_id, is_alive=True)
                stats["marked_alive"] += 1
                logger.info("reconcile_marked_alive", session_id=session_id)
        else:
            # Session in DB but not tmux - mark dead
            if session["is_alive"]:
                terminal_store.mark_dead(session_id)
                stats["marked_dead"] += 1
                logger.info("reconcile_marked_dead", session_id=session_id)

    # Purge old dead sessions to prevent unbounded growth
    purged = terminal_store.purge_dead_sessions(older_than_days=purge_after_days)
    stats["purged"] = purged
    if purged > 0:
        logger.info("reconcile_purged_dead_sessions", count=purged)

    logger.info("reconciliation_complete", **stats)

    return stats
