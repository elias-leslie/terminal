"""Validation logic for API requests."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def validate_pane_limit(current_count: int, max_panes: int) -> None:
    """Validate that pane count is under limit.

    Raises HTTPException if limit exceeded.
    """
    if current_count >= max_panes:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {max_panes} panes allowed. Close one to add more.",
        )


def validate_create_pane_request(
    pane_type: str, project_id: str | None
) -> None:
    """Validate create pane request for type/project consistency.

    Raises HTTPException if validation fails.
    """
    if pane_type == "project" and not project_id:
        raise HTTPException(
            status_code=400, detail="project_id required for project panes"
        )
    if pane_type == "adhoc" and project_id:
        raise HTTPException(
            status_code=400, detail="project_id must be empty for adhoc panes"
        )


def validate_active_mode(pane_type: str, active_mode: str) -> None:
    """Validate active_mode is compatible with pane_type.

    Raises HTTPException if adhoc pane tries to use claude mode.
    """
    if pane_type == "adhoc" and active_mode == "claude":
        raise HTTPException(
            status_code=400, detail="Ad-hoc panes do not support claude mode"
        )


def require_pane_exists(pane: dict[str, Any] | None, pane_id: str) -> dict[str, Any]:
    """Validate pane exists or raise 404.

    Returns the pane if it exists.
    """
    if not pane:
        raise HTTPException(status_code=404, detail=f"Pane {pane_id} not found")
    return pane
