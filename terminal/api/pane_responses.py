"""Response builders for Terminal Panes API."""

from __future__ import annotations

from typing import Any

from .models.panes import PaneResponse, SessionInPaneResponse


def build_session_response(session: dict[str, Any]) -> SessionInPaneResponse:
    """Convert storage session dict to API response."""
    return SessionInPaneResponse(
        id=session["id"],
        name=session["name"],
        mode=session["mode"],
        session_number=session["session_number"],
        is_alive=session["is_alive"],
        working_dir=session.get("working_dir"),
    )


def build_pane_response(pane: dict[str, Any]) -> PaneResponse:
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
        sessions=[build_session_response(s) for s in sessions],
        width_percent=pane.get("width_percent", 100.0),
        height_percent=pane.get("height_percent", 100.0),
        grid_row=pane.get("grid_row", 0),
        grid_col=pane.get("grid_col", 0),
    )
