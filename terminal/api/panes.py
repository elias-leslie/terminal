"""Terminal Panes API - REST endpoints for pane management.

This module provides:
- List terminal panes with their sessions
- Create new pane (atomically creates sessions)
- Update pane metadata (name, order, active_mode)
- Delete pane (cascades to sessions)
- Swap pane positions

Panes are containers for 1-2 sessions:
- Project panes: shell + claude sessions (toggled via active_mode)
- Ad-hoc panes: shell session only
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..storage import pane_crud

router = APIRouter(tags=["Terminal Panes"])

MAX_PANES = 4


# ============================================================================
# Request/Response Models
# ============================================================================


class SessionInPaneResponse(BaseModel):
    """Session data within a pane response."""

    id: str
    name: str
    mode: str
    session_number: int
    is_alive: bool
    working_dir: str | None


class PaneResponse(BaseModel):
    """Terminal pane response model."""

    id: str
    pane_type: str  # 'project' or 'adhoc'
    project_id: str | None
    pane_order: int
    pane_name: str
    active_mode: str  # 'shell' or 'claude'
    created_at: str | None
    sessions: list[SessionInPaneResponse] = []
    # Layout fields for resizable grid
    width_percent: float = 100.0
    height_percent: float = 100.0
    grid_row: int = 0
    grid_col: int = 0


class PaneListResponse(BaseModel):
    """Response for listing terminal panes."""

    items: list[PaneResponse]
    total: int
    max_panes: int = MAX_PANES


class CreatePaneRequest(BaseModel):
    """Request to create a terminal pane."""

    pane_type: Literal["project", "adhoc"]
    pane_name: str
    project_id: str | None = None
    working_dir: str | None = None


class UpdatePaneRequest(BaseModel):
    """Request to update a terminal pane."""

    pane_name: str | None = None
    active_mode: Literal["shell", "claude"] | None = None


class SwapPanesRequest(BaseModel):
    """Request to swap two pane positions."""

    pane_id_a: str
    pane_id_b: str


class UpdatePaneOrderRequest(BaseModel):
    """Request to update pane ordering."""

    pane_orders: list[tuple[str, int]]  # [(pane_id, new_order), ...]


class UpdatePaneLayoutRequest(BaseModel):
    """Request to update a single pane's layout."""

    width_percent: float | None = None
    height_percent: float | None = None
    grid_row: int | None = None
    grid_col: int | None = None


class PaneLayoutItem(BaseModel):
    """Single pane layout for bulk update."""

    pane_id: str
    width_percent: float | None = None
    height_percent: float | None = None
    grid_row: int | None = None
    grid_col: int | None = None


class BulkLayoutUpdateRequest(BaseModel):
    """Request to update layout for all panes at once."""

    layouts: list[PaneLayoutItem]


# ============================================================================
# Helpers
# ============================================================================


def _session_to_response(session: dict[str, Any]) -> SessionInPaneResponse:
    """Convert storage session dict to API response."""
    return SessionInPaneResponse(
        id=session["id"],
        name=session["name"],
        mode=session["mode"],
        session_number=session["session_number"],
        is_alive=session["is_alive"],
        working_dir=session.get("working_dir"),
    )


def _pane_to_response(pane: dict[str, Any]) -> PaneResponse:
    """Convert storage pane dict to API response."""
    sessions = pane.get("sessions", [])
    return PaneResponse(
        id=pane["id"],
        pane_type=pane["pane_type"],
        project_id=pane.get("project_id"),
        pane_order=pane["pane_order"],
        pane_name=pane["pane_name"],
        active_mode=pane.get("active_mode", "shell"),
        created_at=pane["created_at"].isoformat() if pane.get("created_at") else None,
        sessions=[_session_to_response(s) for s in sessions],
        width_percent=pane.get("width_percent", 100.0),
        height_percent=pane.get("height_percent", 100.0),
        grid_row=pane.get("grid_row", 0),
        grid_col=pane.get("grid_col", 0),
    )


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/api/terminal/panes", response_model=PaneListResponse)
async def list_panes() -> PaneListResponse:
    """List all terminal panes with their sessions.

    Panes are ordered by pane_order.
    """
    panes = pane_crud.list_panes_with_sessions()

    return PaneListResponse(
        items=[_pane_to_response(p) for p in panes],
        total=len(panes),
        max_panes=MAX_PANES,
    )


@router.get("/api/terminal/panes/count")
async def get_pane_count() -> dict[str, Any]:
    """Get current pane count and max limit."""
    count = pane_crud.count_panes()
    return {
        "count": count,
        "max_panes": MAX_PANES,
        "at_limit": count >= MAX_PANES,
    }


@router.post("/api/terminal/panes", response_model=PaneResponse)
async def create_pane(request: CreatePaneRequest) -> PaneResponse:
    """Create a new terminal pane with sessions.

    For project panes: creates shell + claude sessions.
    For adhoc panes: creates shell session only.

    Enforces max 4 panes limit.
    """
    # Check pane limit
    current_count = pane_crud.count_panes()
    if current_count >= MAX_PANES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PANES} panes allowed. Close one to add more.",
        )

    # Validate pane_type and project_id consistency
    if request.pane_type == "project" and not request.project_id:
        raise HTTPException(
            status_code=400, detail="project_id required for project panes"
        )
    if request.pane_type == "adhoc" and request.project_id:
        raise HTTPException(
            status_code=400, detail="project_id must be empty for adhoc panes"
        )

    try:
        pane = pane_crud.create_pane_with_sessions(
            pane_type=request.pane_type,
            pane_name=request.pane_name,
            project_id=request.project_id,
            working_dir=request.working_dir,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    return _pane_to_response(pane)


@router.get("/api/terminal/panes/{pane_id}", response_model=PaneResponse)
async def get_pane(pane_id: str) -> PaneResponse:
    """Get a single terminal pane with its sessions."""
    pane = pane_crud.get_pane_with_sessions(pane_id)
    if not pane:
        raise HTTPException(
            status_code=404, detail=f"Pane {pane_id} not found"
        ) from None

    return _pane_to_response(pane)


@router.patch("/api/terminal/panes/{pane_id}", response_model=PaneResponse)
async def update_pane(pane_id: str, request: UpdatePaneRequest) -> PaneResponse:
    """Update terminal pane metadata.

    Can update: pane_name, active_mode
    """
    # Verify pane exists
    existing = pane_crud.get_pane(pane_id)
    if not existing:
        raise HTTPException(
            status_code=404, detail=f"Pane {pane_id} not found"
        ) from None

    # Build update fields
    update_fields: dict[str, Any] = {}
    if request.pane_name is not None:
        update_fields["pane_name"] = request.pane_name
    if request.active_mode is not None:
        # For adhoc panes, only shell is allowed
        if existing["pane_type"] == "adhoc" and request.active_mode == "claude":
            raise HTTPException(
                status_code=400, detail="Ad-hoc panes do not support claude mode"
            )
        update_fields["active_mode"] = request.active_mode

    if not update_fields:
        # Return existing pane with sessions
        pane = pane_crud.get_pane_with_sessions(pane_id)
        return (
            _pane_to_response(pane) if pane else PaneResponse(**existing, sessions=[])
        )

    pane = pane_crud.update_pane(pane_id, **update_fields)
    if not pane:
        raise HTTPException(status_code=500, detail="Failed to update pane") from None

    # Fetch with sessions
    pane_with_sessions = pane_crud.get_pane_with_sessions(pane_id)
    return _pane_to_response(pane_with_sessions or pane)


@router.delete("/api/terminal/panes/{pane_id}")
async def delete_pane(pane_id: str) -> dict[str, Any]:
    """Delete a terminal pane and all its sessions.

    Sessions are cascade-deleted via foreign key.
    """
    deleted = pane_crud.delete_pane(pane_id)
    if not deleted:
        raise HTTPException(
            status_code=404, detail=f"Pane {pane_id} not found"
        ) from None

    return {"deleted": True, "id": pane_id}


@router.post("/api/terminal/panes/swap")
async def swap_panes(request: SwapPanesRequest) -> dict[str, Any]:
    """Swap positions of two panes.

    Used for dropdown swap and drag-and-drop swap.
    """
    success = pane_crud.swap_pane_positions(request.pane_id_a, request.pane_id_b)
    if not success:
        raise HTTPException(
            status_code=404, detail="One or both panes not found"
        ) from None

    return {
        "swapped": True,
        "pane_id_a": request.pane_id_a,
        "pane_id_b": request.pane_id_b,
    }


@router.put("/api/terminal/panes/order")
async def update_pane_order(request: UpdatePaneOrderRequest) -> dict[str, Any]:
    """Batch update pane ordering.

    Used for drag-and-drop reordering in the UI.
    """
    pane_crud.update_pane_order(request.pane_orders)
    return {"updated": True, "count": len(request.pane_orders)}


@router.patch("/api/terminal/panes/{pane_id}/layout", response_model=PaneResponse)
async def update_pane_layout(
    pane_id: str, request: UpdatePaneLayoutRequest
) -> PaneResponse:
    """Update a single pane's layout (position and size).

    Used when resizing or repositioning a single pane.
    """
    existing = pane_crud.get_pane(pane_id)
    if not existing:
        raise HTTPException(
            status_code=404, detail=f"Pane {pane_id} not found"
        ) from None

    update_fields: dict[str, Any] = {}
    if request.width_percent is not None:
        update_fields["width_percent"] = request.width_percent
    if request.height_percent is not None:
        update_fields["height_percent"] = request.height_percent
    if request.grid_row is not None:
        update_fields["grid_row"] = request.grid_row
    if request.grid_col is not None:
        update_fields["grid_col"] = request.grid_col

    if not update_fields:
        pane = pane_crud.get_pane_with_sessions(pane_id)
        return _pane_to_response(pane or existing)

    pane = pane_crud.update_pane(pane_id, **update_fields)
    if not pane:
        raise HTTPException(
            status_code=500, detail="Failed to update pane layout"
        ) from None

    pane_with_sessions = pane_crud.get_pane_with_sessions(pane_id)
    return _pane_to_response(pane_with_sessions or pane)


@router.put("/api/terminal/layout", response_model=list[PaneResponse])
async def update_all_pane_layouts(
    request: BulkLayoutUpdateRequest,
) -> list[PaneResponse]:
    """Bulk update layout for all panes at once.

    Used after resize operations complete to persist the entire layout.
    Includes retry logic for database contention.
    """
    if not request.layouts:
        return []

    # Convert request to storage format
    layouts_data = [
        {
            "pane_id": item.pane_id,
            "width_percent": item.width_percent,
            "height_percent": item.height_percent,
            "grid_row": item.grid_row,
            "grid_col": item.grid_col,
        }
        for item in request.layouts
    ]

    # Simple retry for database contention
    max_retries = 3
    for attempt in range(max_retries):
        try:
            pane_crud.update_pane_layouts(layouts_data)
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update layouts after {max_retries} attempts: {e}",
                ) from None
            import asyncio

            await asyncio.sleep(0.1 * (attempt + 1))

    # Fetch all panes with sessions for complete response
    all_panes = pane_crud.list_panes_with_sessions()
    return [_pane_to_response(p) for p in all_panes]
