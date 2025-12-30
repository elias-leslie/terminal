"""Terminal project settings storage layer.

This module provides data access for per-project terminal settings.
Each project can be enabled/disabled for terminal access and tracks
the active mode (shell or claude) which syncs across devices.
"""

from __future__ import annotations

from typing import Any, Literal

import psycopg.sql

from .connection import get_connection


def get_all_settings() -> dict[str, dict[str, Any]]:
    """Get all project settings, keyed by project_id.

    Returns:
        Dict mapping project_id to settings dict
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT project_id, enabled, active_mode, display_order,
                   created_at, updated_at
            FROM terminal_project_settings
            ORDER BY display_order, project_id
            """
        )
        rows = cur.fetchall()

    return {row[0]: _row_to_dict(row) for row in rows}


def get_settings(project_id: str) -> dict[str, Any] | None:
    """Get settings for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        Settings dict or None if not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT project_id, enabled, active_mode, display_order,
                   created_at, updated_at
            FROM terminal_project_settings
            WHERE project_id = %s
            """,
            (project_id,),
        )
        row = cur.fetchone()

    if not row:
        return None
    return _row_to_dict(row)


def upsert_settings(
    project_id: str,
    enabled: bool | None = None,
    active_mode: Literal["shell", "claude"] | None = None,
    display_order: int | None = None,
) -> dict[str, Any]:
    """Create or update project settings.

    Uses PostgreSQL upsert (INSERT ... ON CONFLICT) for atomic operation.

    Args:
        project_id: Project identifier
        enabled: Whether terminal is enabled for this project
        active_mode: Active mode ('shell' or 'claude') - syncs across devices
        display_order: Display order in tab bar

    Returns:
        Updated settings dict
    """
    # Build the update SET clause dynamically based on provided fields
    update_parts = [psycopg.sql.SQL("updated_at = NOW()")]
    if enabled is not None:
        update_parts.append(psycopg.sql.SQL("enabled = EXCLUDED.enabled"))
    if active_mode is not None:
        update_parts.append(psycopg.sql.SQL("active_mode = EXCLUDED.active_mode"))
    if display_order is not None:
        update_parts.append(psycopg.sql.SQL("display_order = EXCLUDED.display_order"))

    update_clause = psycopg.sql.SQL(", ").join(update_parts)

    # Use defaults for None values in the INSERT
    insert_enabled = enabled if enabled is not None else False
    insert_mode = active_mode if active_mode is not None else "shell"
    insert_order = display_order if display_order is not None else 0

    query = psycopg.sql.SQL("""
        INSERT INTO terminal_project_settings
            (project_id, enabled, active_mode, display_order)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (project_id) DO UPDATE SET
            {}
        RETURNING project_id, enabled, active_mode, display_order,
                  created_at, updated_at
    """).format(update_clause)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, (project_id, insert_enabled, insert_mode, insert_order))
        row = cur.fetchone()
        conn.commit()

    if not row:
        raise ValueError(f"Failed to upsert settings for {project_id}")
    return _row_to_dict(row)


def bulk_update_order(project_ids: list[str]) -> None:
    """Update display_order for multiple projects based on list order.

    The index in the list becomes the display_order value.

    Args:
        project_ids: Ordered list of project IDs
    """
    if not project_ids:
        return

    with get_connection() as conn, conn.cursor() as cur:
        # Use a single query with CASE for efficiency
        # Build CASE clauses: WHEN project_id = %s THEN 0, WHEN project_id = %s THEN 1, ...
        case_parts = [
            psycopg.sql.SQL("WHEN project_id = %s THEN {}").format(psycopg.sql.Literal(i))
            for i in range(len(project_ids))
        ]
        cases = psycopg.sql.SQL(" ").join(case_parts)

        # Build IN clause placeholders
        placeholders = psycopg.sql.SQL(", ").join([psycopg.sql.SQL("%s")] * len(project_ids))

        query = psycopg.sql.SQL("""
            UPDATE terminal_project_settings
            SET display_order = CASE {} END,
                updated_at = NOW()
            WHERE project_id IN ({})
        """).format(cases, placeholders)

        cur.execute(query, (*project_ids, *project_ids))
        conn.commit()


def set_active_mode(project_id: str, mode: Literal["shell", "claude"]) -> dict[str, Any] | None:
    """Set the active mode for a project.

    This is called when user switches between shell and claude modes.
    The mode syncs across devices via the database.

    Args:
        project_id: Project identifier
        mode: The mode to set ('shell' or 'claude')

    Returns:
        Updated settings dict or None if project not found
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE terminal_project_settings
            SET active_mode = %s, updated_at = NOW()
            WHERE project_id = %s
            RETURNING project_id, enabled, active_mode, display_order,
                      created_at, updated_at
            """,
            (mode, project_id),
        )
        row = cur.fetchone()
        conn.commit()

    if not row:
        return None
    return _row_to_dict(row)


def _row_to_dict(row: tuple) -> dict[str, Any]:
    """Convert a database row to a settings dict."""
    return {
        "project_id": row[0],
        "enabled": row[1],
        "active_mode": row[2],
        "display_order": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }
