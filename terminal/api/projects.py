"""Terminal Projects API - Project settings for terminal tabs.

This module provides:
- List projects with terminal settings merged
- Update terminal settings per project
- Bulk update display order for drag-and-drop
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..constants import SessionMode
from ..services import lifecycle, summitflow_client
from ..storage import project_settings as settings_store

router = APIRouter(tags=["Terminal Projects"])


# ============================================================================
# Request/Response Models
# ============================================================================


class ProjectResponse(BaseModel):
    """Project with terminal settings merged."""

    id: str
    name: str
    root_path: str | None
    # Terminal-specific settings
    terminal_enabled: bool = False
    mode: SessionMode = "shell"  # Active mode (shell or claude)
    display_order: int = 0


class ProjectSettingsUpdate(BaseModel):
    """Request to update terminal settings for a project."""

    enabled: bool | None = None
    active_mode: SessionMode | None = None
    display_order: int | None = None


class SetModeRequest(BaseModel):
    """Request to set active mode for a project."""

    mode: SessionMode


class BulkOrderUpdate(BaseModel):
    """Request to bulk update display order."""

    project_ids: list[str]


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/api/terminal/projects", response_model=list[ProjectResponse])
async def list_projects() -> list[ProjectResponse]:
    """List all projects with terminal settings merged.

    Fetches projects from SummitFlow API and merges with local
    terminal_project_settings. Projects without settings get defaults.
    """
    # Fetch projects from SummitFlow
    sf_projects = await summitflow_client.list_projects()

    # Get all local terminal settings
    all_settings = settings_store.get_all_settings()

    # Merge and build response
    result: list[ProjectResponse] = []
    for project in sf_projects:
        project_id = project.get("id", "")
        settings = all_settings.get(project_id)

        result.append(
            ProjectResponse(
                id=project_id,
                name=project.get("name", project_id),
                root_path=project.get("root_path"),
                terminal_enabled=settings["enabled"] if settings else False,
                mode=settings["active_mode"] if settings else "shell",
                display_order=settings["display_order"] if settings else 0,
            )
        )

    # Sort by display_order, then by name
    result.sort(key=lambda p: (p.display_order, p.name))

    return result


@router.put("/api/terminal/project-settings/{project_id}", response_model=ProjectResponse)
async def update_project_settings(
    project_id: str,
    update: ProjectSettingsUpdate,
) -> ProjectResponse:
    """Update terminal settings for a project.

    Creates settings if they don't exist (upsert).
    """
    # Upsert the settings
    settings = settings_store.upsert_settings(
        project_id=project_id,
        enabled=update.enabled,
        active_mode=update.active_mode,
        display_order=update.display_order,
    )

    # Try to get project info from SummitFlow for the name/path
    sf_projects = await summitflow_client.list_projects()
    project_info = next((p for p in sf_projects if p.get("id") == project_id), None)

    return ProjectResponse(
        id=project_id,
        name=project_info.get("name", project_id) if project_info else project_id,
        root_path=project_info.get("root_path") if project_info else None,
        terminal_enabled=settings["enabled"],
        mode=settings["active_mode"],
        display_order=settings["display_order"],
    )


@router.post("/api/terminal/project-settings/bulk-order", response_model=list[ProjectResponse])
async def bulk_update_order(update: BulkOrderUpdate) -> list[ProjectResponse]:
    """Bulk update display order for drag-and-drop reordering.

    The order in the project_ids list becomes the display_order.
    """
    settings_store.bulk_update_order(update.project_ids)

    # Return updated project list
    return await list_projects()


@router.post("/api/terminal/projects/{project_id}/reset")
async def reset_project(project_id: str) -> dict[str, Any]:
    """Reset all terminal sessions for a project.

    Resets both shell and claude sessions if they exist.
    Uses the current project root_path from SummitFlow settings.
    Also resets mode back to shell.
    Returns new session IDs for each mode.
    """
    # Get current project info from SummitFlow
    sf_projects = await summitflow_client.list_projects()
    project_info = next((p for p in sf_projects if p.get("id") == project_id), None)
    working_dir = project_info.get("root_path") if project_info else None

    # Reset sessions
    result = lifecycle.reset_project_sessions(project_id, working_dir=working_dir)

    # Reset mode back to shell
    settings_store.upsert_settings(project_id=project_id, active_mode="shell")

    return {
        "project_id": project_id,
        "shell_session_id": result["shell"],
        "claude_session_id": result["claude"],
        "mode": "shell",
    }


@router.post("/api/terminal/projects/{project_id}/disable")
async def disable_project(project_id: str) -> dict[str, Any]:
    """Disable terminal for a project.

    Deletes all sessions and sets enabled=false in settings.
    """
    lifecycle.disable_project_terminal(project_id)
    return {"project_id": project_id, "disabled": True}


@router.put("/api/terminal/projects/{project_id}/mode")
async def set_project_mode(project_id: str, request: SetModeRequest) -> dict[str, Any]:
    """Set the active mode for a project.

    Updates the active_mode in project settings. This mode syncs across devices.
    """
    result = settings_store.set_active_mode(project_id, request.mode)
    if not result:
        # Create settings if they don't exist
        result = settings_store.upsert_settings(project_id, active_mode=request.mode)

    return {
        "project_id": project_id,
        "mode": result["active_mode"],
    }
