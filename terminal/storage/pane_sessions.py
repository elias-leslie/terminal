"""Session fetching logic for terminal panes."""

from __future__ import annotations

from typing import Any

from .connection import get_connection
from .pane_db_helpers import PaneId, normalize_pane_id, session_row_to_dict


def fetch_sessions_for_pane(pane_id: PaneId) -> list[dict[str, Any]]:
    """Fetch all sessions for a given pane.

    Args:
        pane_id: Pane UUID

    Returns:
        List of session dicts
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, mode, session_number, is_alive, working_dir
            FROM terminal_sessions
            WHERE pane_id = %s
            ORDER BY mode
            """,
            (normalize_pane_id(pane_id),),
        )
        rows = cur.fetchall()
        return [session_row_to_dict(row) for row in rows]


def fetch_all_sessions_by_pane() -> dict[str, list[dict[str, Any]]]:
    """Fetch all sessions grouped by pane_id.

    Returns:
        Dict mapping pane_id to list of session dicts
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT pane_id, id, name, mode, session_number, is_alive, working_dir
            FROM terminal_sessions
            WHERE pane_id IS NOT NULL
            ORDER BY pane_id, mode
            """
        )
        rows = cur.fetchall()

    sessions_by_pane: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        pane_id = str(row[0])
        if pane_id not in sessions_by_pane:
            sessions_by_pane[pane_id] = []
        sessions_by_pane[pane_id].append(
            {
                "id": str(row[1]),
                "name": row[2],
                "mode": row[3],
                "session_number": row[4],
                "is_alive": row[5],
                "working_dir": row[6],
            }
        )

    return sessions_by_pane


__all__ = ["fetch_all_sessions_by_pane", "fetch_sessions_for_pane"]
