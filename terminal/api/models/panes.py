"""Pydantic models for Terminal Panes API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


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
    max_panes: int


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
