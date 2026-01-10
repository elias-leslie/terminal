"""Terminal session startup reconciliation.

Handles reconciliation of database state with tmux session state:
- Sync DB ↔ tmux state on startup
- Mark sessions as alive/dead based on tmux presence
- Purge old abandoned sessions
- Kill orphan tmux sessions (no DB record)
"""

from __future__ import annotations

from ..logging_config import get_logger
from ..storage import terminal as terminal_store
from ..utils.tmux import get_tmux_session_name, list_tmux_sessions, run_tmux_command

logger = get_logger(__name__)


def _kill_orphan_tmux_sessions(db_session_ids: set[str]) -> int:
    """Kill tmux sessions that have no matching DB record.

    These are true orphans - tmux sessions that were created but their
    DB records were deleted (e.g., purged after 7 days of inactivity).
    Safe to kill because there's no way to reconnect without a DB record.

    Args:
        db_session_ids: Set of all session IDs that exist in the database

    Returns:
        Number of orphan tmux sessions killed
    """
    tmux_sessions = list_tmux_sessions()
    orphans = tmux_sessions - db_session_ids
    killed = 0

    for session_id in orphans:
        session_name = get_tmux_session_name(session_id)
        success, error = run_tmux_command(["kill-session", "-t", session_name])
        if success:
            killed += 1
            logger.info("orphan_tmux_killed", session_id=session_id)
        else:
            logger.warning(
                "orphan_tmux_kill_failed", session_id=session_id, error=error
            )

    return killed


def reconcile_on_startup(purge_after_days: int = 7) -> dict[str, int]:
    """Reconcile DB with tmux state on server startup.

    Syncs the database with the actual tmux session state:
    - Sessions in DB but not tmux: mark as dead
    - Sessions in DB and tmux: mark as alive
    - Dead sessions older than purge_after_days: permanently deleted
    - Orphan tmux sessions (no DB record): killed

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

    # Kill orphan tmux sessions (no DB record at all)
    # Must run AFTER purge so we have the final set of DB session IDs
    remaining_db_ids = {
        s["id"] for s in terminal_store.list_sessions(include_dead=True)
    }
    orphans_killed = _kill_orphan_tmux_sessions(remaining_db_ids)
    stats["orphans_killed"] = orphans_killed
    if orphans_killed > 0:
        logger.info("reconcile_orphans_killed", count=orphans_killed)

    logger.info("reconciliation_complete", **stats)

    return stats
