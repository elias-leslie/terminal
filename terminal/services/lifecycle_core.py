"""Core terminal session lifecycle operations.

Handles single-session atomic operations:
- Atomic create (DB + tmux, rollback on failure)
- Atomic delete (tmux kill + DB delete)
- Session resurrection (recreate tmux if DB record exists)
- Ensure session alive (resurrection on connect)

The database is the source of truth; tmux is the implementation detail.
"""

from __future__ import annotations

from ..logging_config import get_logger
from ..storage import terminal as terminal_store
from ..utils.tmux import (
    TmuxError,
    create_tmux_session,
    get_tmux_session_name,
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
