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

from typing import Any

from fastapi import APIRouter, HTTPException

from ..services.pane_service import (
    convert_layout_items_to_storage,
    get_layout_update_fields,
    get_update_fields,
    update_layouts_with_retry,
)
from ..storage import pane_crud
from .models.panes import (
    BulkLayoutUpdateRequest,
    CreatePaneRequest,
    PaneListResponse,
    PaneResponse,
    SwapPanesRequest,
    UpdatePaneLayoutRequest,
    UpdatePaneOrderRequest,
    UpdatePaneRequest,
)
from .pane_responses import build_pane_response
from .validators import (
    require_pane_exists,
    validate_active_mode,
    validate_create_pane_request,
    validate_pane_limit,
)

router = APIRouter(tags=["Terminal Panes"])

MAX_PANES = 4


@router.get("/api/terminal/panes", response_model=PaneListResponse)
async def list_panes() -> PaneListResponse:
    """List all terminal panes with their sessions."""
    panes = pane_crud.list_panes_with_sessions()
    return PaneListResponse(
        items=[build_pane_response(p) for p in panes],
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
    """
    validate_pane_limit(pane_crud.count_panes(), MAX_PANES)
    validate_create_pane_request(request.pane_type, request.project_id)

    try:
        pane = pane_crud.create_pane_with_sessions(
            pane_type=request.pane_type,
            pane_name=request.pane_name,
            project_id=request.project_id,
            working_dir=request.working_dir,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    return build_pane_response(pane)


@router.get("/api/terminal/panes/{pane_id}", response_model=PaneResponse)
async def get_pane(pane_id: str) -> PaneResponse:
    """Get a single terminal pane with its sessions."""
    pane = require_pane_exists(pane_crud.get_pane_with_sessions(pane_id), pane_id)
    return build_pane_response(pane)


@router.patch("/api/terminal/panes/{pane_id}", response_model=PaneResponse)
async def update_pane(pane_id: str, request: UpdatePaneRequest) -> PaneResponse:
    """Update terminal pane metadata (pane_name, active_mode)."""
    existing = require_pane_exists(pane_crud.get_pane(pane_id), pane_id)

    if request.active_mode is not None:
        validate_active_mode(existing["pane_type"], request.active_mode)

    update_fields = get_update_fields(request.pane_name, request.active_mode)
    if not update_fields:
        pane = pane_crud.get_pane_with_sessions(pane_id)
        return build_pane_response(pane or existing)

    pane = pane_crud.update_pane(pane_id, **update_fields)
    if not pane:
        raise HTTPException(status_code=500, detail="Failed to update pane")

    pane_with_sessions = pane_crud.get_pane_with_sessions(pane_id)
    return build_pane_response(pane_with_sessions or pane)


@router.delete("/api/terminal/panes/{pane_id}")
async def delete_pane(pane_id: str) -> dict[str, Any]:
    """Delete a terminal pane and all its sessions."""
    deleted = pane_crud.delete_pane(pane_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Pane {pane_id} not found")
    return {"deleted": True, "id": pane_id}


@router.post("/api/terminal/panes/swap")
async def swap_panes(request: SwapPanesRequest) -> dict[str, Any]:
    """Swap positions of two panes."""
    success = pane_crud.swap_pane_positions(request.pane_id_a, request.pane_id_b)
    if not success:
        raise HTTPException(status_code=404, detail="One or both panes not found")
    return {
        "swapped": True,
        "pane_id_a": request.pane_id_a,
        "pane_id_b": request.pane_id_b,
    }


@router.put("/api/terminal/panes/order")
async def update_pane_order(request: UpdatePaneOrderRequest) -> dict[str, Any]:
    """Batch update pane ordering."""
    pane_crud.update_pane_order(request.pane_orders)
    return {"updated": True, "count": len(request.pane_orders)}


@router.patch("/api/terminal/panes/{pane_id}/layout", response_model=PaneResponse)
async def update_pane_layout(
    pane_id: str, request: UpdatePaneLayoutRequest
) -> PaneResponse:
    """Update a single pane's layout (position and size)."""
    existing = require_pane_exists(pane_crud.get_pane(pane_id), pane_id)

    update_fields = get_layout_update_fields(
        request.width_percent,
        request.height_percent,
        request.grid_row,
        request.grid_col,
    )
    if not update_fields:
        pane = pane_crud.get_pane_with_sessions(pane_id)
        return build_pane_response(pane or existing)

    pane = pane_crud.update_pane(pane_id, **update_fields)
    if not pane:
        raise HTTPException(status_code=500, detail="Failed to update pane layout")

    pane_with_sessions = pane_crud.get_pane_with_sessions(pane_id)
    return build_pane_response(pane_with_sessions or pane)


@router.put("/api/terminal/layout", response_model=list[PaneResponse])
async def update_all_pane_layouts(
    request: BulkLayoutUpdateRequest,
) -> list[PaneResponse]:
    """Bulk update layout for all panes at once."""
    if not request.layouts:
        return []

    layouts_data = convert_layout_items_to_storage(
        [item.model_dump() for item in request.layouts]
    )

    try:
        await update_layouts_with_retry(layouts_data)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from None

    all_panes = pane_crud.list_panes_with_sessions()
    return [build_pane_response(p) for p in all_panes]
