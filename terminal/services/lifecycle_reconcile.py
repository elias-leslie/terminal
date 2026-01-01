"""Terminal session startup reconciliation.

Handles reconciliation of database state with tmux session state:
- Sync DB ↔ tmux state on startup
- Mark sessions as alive/dead based on tmux presence
- Purge old abandoned sessions
"""

from __future__ import annotations

from ..logging_config import get_logger
from ..storage import terminal as terminal_store
from ..utils.tmux import list_tmux_sessions

logger = get_logger(__name__)


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
