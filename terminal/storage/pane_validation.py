"""Validation logic for terminal panes."""

from __future__ import annotations

from typing import Literal


def validate_pane_type_and_project(
    pane_type: Literal["project", "adhoc"], project_id: str | None
) -> None:
    """Validate pane_type and project_id consistency.

    Args:
        pane_type: 'project' or 'adhoc'
        project_id: Project ID or None

    Raises:
        ValueError: If validation fails
    """
    if pane_type == "project" and not project_id:
        raise ValueError("project_id required for project panes")
    if pane_type == "adhoc" and project_id:
        raise ValueError("project_id must be None for adhoc panes")


__all__ = ["validate_pane_type_and_project"]
