"""Claude Code integration API.

This module provides:
- Get Claude state for a terminal session
- Start Claude Code in a terminal session
"""

from __future__ import annotations

import subprocess
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.lifecycle import _get_tmux_session_name, _tmux_session_exists_by_name
from ..storage import terminal as terminal_store

router = APIRouter(tags=["Claude Integration"])


# ============================================================================
# Request/Response Models
# ============================================================================


class ClaudeStateResponse(BaseModel):
    """Claude Code state for a terminal session."""

    session_id: str
    state: Literal["none", "active", "idle"]
    claude_session_name: str | None = None


class StartClaudeResponse(BaseModel):
    """Response after starting Claude Code."""

    session_id: str
    started: bool
    message: str


# ============================================================================
# Helpers
# ============================================================================


def _get_current_tmux_client_session(tmux_session_name: str) -> str | None:
    """Get the session that the client is currently attached to.

    This checks if any client is attached and what session they're viewing.

    Returns:
        Current session name or None if no client attached
    """
    result = subprocess.run(
        ["tmux", "list-clients", "-t", tmux_session_name, "-F", "#{client_session}"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return None

    sessions = result.stdout.strip().split("\n")
    return sessions[0] if sessions and sessions[0] else None


def _determine_claude_state(
    session_id: str, last_claude_session: str | None
) -> tuple[Literal["none", "active", "idle"], str | None]:
    """Determine Claude state for a session.

    Returns:
        Tuple of (state, claude_session_name)
    """
    if not last_claude_session:
        return "none", None

    # Check if the claude session still exists
    if not _tmux_session_exists_by_name(last_claude_session):
        # Claude session was destroyed - clear it
        terminal_store.update_claude_session(session_id, None)
        return "none", None

    # Claude session exists - check if client is in it
    base_session_name = _get_tmux_session_name(session_id)
    current_session = _get_current_tmux_client_session(base_session_name)

    if current_session == last_claude_session:
        return "active", last_claude_session
    else:
        return "idle", last_claude_session


# ============================================================================
# Endpoints
# ============================================================================


@router.get(
    "/api/terminal/sessions/{session_id}/claude-state",
    response_model=ClaudeStateResponse,
)
async def get_claude_state(session_id: str) -> ClaudeStateResponse:
    """Get Claude Code state for a terminal session.

    States:
    - none: Claude has never been started or session was closed
    - active: Claude session exists and client is viewing it
    - idle: Claude session exists but client is in base session
    """
    session = terminal_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    state, claude_session = _determine_claude_state(
        session_id, session.get("last_claude_session")
    )

    return ClaudeStateResponse(
        session_id=session_id,
        state=state,
        claude_session_name=claude_session,
    )


def _is_claude_running_in_session(tmux_session: str) -> bool:
    """Check if Claude Code is already running in a tmux session.

    Checks the current pane content for Claude Code specific indicators.
    """
    # Capture the current pane content
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", tmux_session, "-p"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return False

    content = result.stdout
    # Check for Claude Code specific indicators (not generic shell stuff)
    claude_indicators = [
        "Claude Code v",  # Version banner
        "[Opus",  # Model indicator in status bar
        "[Sonnet",  # Alternative model
        "> Try ",  # Claude's suggestion prompt
        "| main |",  # Claude status bar format
        "0/200K",  # Token counter
    ]

    return any(indicator in content for indicator in claude_indicators)


@router.post(
    "/api/terminal/sessions/{session_id}/start-claude",
    response_model=StartClaudeResponse,
)
async def start_claude(session_id: str) -> StartClaudeResponse:
    """Start Claude Code in a terminal session.

    Only sends the command if Claude is not already running.
    Uses --dangerously-skip-permissions flag for auto-approval.
    """
    session = terminal_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Get the tmux session name
    tmux_session = _get_tmux_session_name(session_id)

    # Check if session exists
    if not _tmux_session_exists_by_name(tmux_session):
        raise HTTPException(
            status_code=400,
            detail=f"tmux session {tmux_session} does not exist",
        )

    # Check if Claude is already running
    if _is_claude_running_in_session(tmux_session):
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message="Claude is already running in this session",
        )

    # Send the claude command with skip-permissions flag
    result = subprocess.run(
        [
            "tmux",
            "send-keys",
            "-t",
            tmux_session,
            "claude --dangerously-skip-permissions",
            "Enter",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message=f"Failed to send command: {result.stderr}",
        )

    return StartClaudeResponse(
        session_id=session_id,
        started=True,
        message="Claude command sent to terminal",
    )
