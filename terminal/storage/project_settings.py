"""Terminal project settings storage layer.

This module provides data access for per-project terminal settings.
Each project can be enabled/disabled for terminal access and have
a default mode (shell or claude).
"""

from __future__ import annotations

from typing import Any, Literal

from .connection import get_connection


def get_all_settings() -> dict[str, dict[str, Any]]:
    """Get all project settings, keyed by project_id.

    Returns:
        Dict mapping project_id to settings dict
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT project_id, enabled, default_mode, display_order,
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
            SELECT project_id, enabled, default_mode, display_order,
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
    default_mode: Literal["shell", "claude"] | None = None,
    display_order: int | None = None,
) -> dict[str, Any]:
    """Create or update project settings.

    Uses PostgreSQL upsert (INSERT ... ON CONFLICT) for atomic operation.

    Args:
        project_id: Project identifier
        enabled: Whether terminal is enabled for this project
        default_mode: Default mode ('shell' or 'claude')
        display_order: Display order in tab bar

    Returns:
        Updated settings dict
    """
    # Build the update SET clause dynamically based on provided fields
    update_parts = ["updated_at = NOW()"]
    if enabled is not None:
        update_parts.append("enabled = EXCLUDED.enabled")
    if default_mode is not None:
        update_parts.append("default_mode = EXCLUDED.default_mode")
    if display_order is not None:
        update_parts.append("display_order = EXCLUDED.display_order")

    update_clause = ", ".join(update_parts)

    # Use defaults for None values in the INSERT
    insert_enabled = enabled if enabled is not None else False
    insert_mode = default_mode if default_mode is not None else "shell"
    insert_order = display_order if display_order is not None else 0

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO terminal_project_settings
                (project_id, enabled, default_mode, display_order)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (project_id) DO UPDATE SET
                {update_clause}
            RETURNING project_id, enabled, default_mode, display_order,
                      created_at, updated_at
            """,
            (project_id, insert_enabled, insert_mode, insert_order),
        )
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
        cases = " ".join(
            f"WHEN project_id = %s THEN {i}" for i in range(len(project_ids))
        )
        placeholders = ", ".join(["%s"] * len(project_ids))

        cur.execute(
            f"""
            UPDATE terminal_project_settings
            SET display_order = CASE {cases} END,
                updated_at = NOW()
            WHERE project_id IN ({placeholders})
            """,
            (*project_ids, *project_ids),
        )
        conn.commit()


def _row_to_dict(row: tuple) -> dict[str, Any]:
    """Convert a database row to a settings dict."""
    return {
        "project_id": row[0],
        "enabled": row[1],
        "default_mode": row[2],
        "display_order": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }
