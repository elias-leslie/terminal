"""Claude Code integration API.

This module provides:
- Get Claude state for a terminal session (state machine based)
- Start Claude Code in a terminal session with state machine
"""

from __future__ import annotations

import asyncio
import subprocess
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ..logging_config import get_logger
from ..services.lifecycle import _get_tmux_session_name, _tmux_session_exists_by_name
from ..storage import terminal as terminal_store

router = APIRouter(tags=["Claude Integration"])
logger = get_logger(__name__)

# Type alias for Claude state
ClaudeState = Literal["not_started", "starting", "running", "stopped", "error"]


# ============================================================================
# Request/Response Models
# ============================================================================


class ClaudeStateResponse(BaseModel):
    """Claude Code state for a terminal session (state machine based)."""

    session_id: str
    claude_state: ClaudeState
    # Legacy fields for backward compatibility
    state: Literal["none", "active", "idle"] | None = None
    claude_session_name: str | None = None


class StartClaudeResponse(BaseModel):
    """Response after starting Claude Code."""

    session_id: str
    started: bool
    message: str
    claude_state: ClaudeState


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


def _determine_legacy_claude_state(
    session_id: str, last_claude_session: str | None
) -> tuple[Literal["none", "active", "idle"], str | None]:
    """Determine legacy Claude state for backward compatibility.

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


def _is_claude_running_in_session(tmux_session: str) -> bool:
    """Check if Claude Code is already running in a tmux session.

    Checks the current pane content for Claude Code TUI border character.
    This is the fallback detection method when state machine is not definitive.
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
    # Look for Claude Code's TUI border character (most reliable indicator)
    # The box-drawing character appears at the top of Claude's UI
    return "\u256d" in content  # Unicode box drawings light arc down and right


def _verify_claude_started(tmux_session: str) -> bool:
    """Verify Claude Code has started by checking for TUI border.

    Returns:
        True if Claude TUI is detected, False otherwise
    """
    return _is_claude_running_in_session(tmux_session)


async def _background_verify_claude_start(session_id: str, tmux_session: str) -> None:
    """Background task to verify Claude started after 2 seconds.

    Updates the claude_state to 'running' or 'error' based on verification.
    """
    await asyncio.sleep(2)

    # Verify Claude started by checking for TUI
    if _verify_claude_started(tmux_session):
        # Only update if still in 'starting' state (handles race conditions)
        updated = terminal_store.update_claude_state(
            session_id, "running", expected_state="starting"
        )
        if updated:
            logger.info(
                "claude_verified_running",
                session_id=session_id,
                tmux_session=tmux_session,
            )
        else:
            logger.info(
                "claude_state_already_changed",
                session_id=session_id,
                tmux_session=tmux_session,
            )
    else:
        # Claude didn't start - set to error
        updated = terminal_store.update_claude_state(
            session_id, "error", expected_state="starting"
        )
        if updated:
            logger.warning(
                "claude_start_failed",
                session_id=session_id,
                tmux_session=tmux_session,
            )


# ============================================================================
# Endpoints
# ============================================================================


@router.get(
    "/api/terminal/sessions/{session_id}/claude-state",
    response_model=ClaudeStateResponse,
)
async def get_claude_state_endpoint(session_id: str) -> ClaudeStateResponse:
    """Get Claude Code state for a terminal session.

    State machine states:
    - not_started: Claude has never been started
    - starting: Claude is in the process of starting
    - running: Claude is running and ready
    - stopped: Claude was running but exited
    - error: Claude failed to start

    Also includes legacy state fields for backward compatibility.
    """
    session = terminal_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Get state machine state
    claude_state: ClaudeState = session.get("claude_state", "not_started")

    # Get legacy state for backward compatibility
    legacy_state, claude_session = _determine_legacy_claude_state(
        session_id, session.get("last_claude_session")
    )

    return ClaudeStateResponse(
        session_id=session_id,
        claude_state=claude_state,
        state=legacy_state,
        claude_session_name=claude_session,
    )


@router.post(
    "/api/terminal/sessions/{session_id}/start-claude",
    response_model=StartClaudeResponse,
)
async def start_claude(
    session_id: str, background_tasks: BackgroundTasks
) -> StartClaudeResponse:
    """Start Claude Code in a terminal session.

    Uses state machine to prevent duplicate starts:
    - If claude_state is 'starting' or 'running', returns early
    - Sets claude_state to 'starting' before sending command
    - Background task verifies startup after 2 seconds

    Uses --dangerously-skip-permissions flag for auto-approval.
    """
    session = terminal_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Check current state - prevent duplicate starts
    current_state: ClaudeState = session.get("claude_state", "not_started")

    if current_state == "starting":
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message="Claude is already starting",
            claude_state="starting",
        )

    if current_state == "running":
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message="Claude is already running",
            claude_state="running",
        )

    # Get the tmux session name
    tmux_session = _get_tmux_session_name(session_id)

    # Check if tmux session exists
    if not _tmux_session_exists_by_name(tmux_session):
        raise HTTPException(
            status_code=400,
            detail=f"tmux session {tmux_session} does not exist",
        )

    # Fallback: Check if Claude is already running via pane content
    # This handles cases where state got out of sync
    if _is_claude_running_in_session(tmux_session):
        # Update state to match reality
        terminal_store.update_claude_state(session_id, "running")
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message="Claude is already running in this session",
            claude_state="running",
        )

    # Atomically set state to 'starting' (handles race conditions)
    # Only update if state is not already 'starting' or 'running'
    if current_state in ("not_started", "stopped", "error"):
        updated = terminal_store.update_claude_state(
            session_id, "starting", expected_state=current_state
        )
        if not updated:
            # State changed between check and update - another request won the race
            new_state = terminal_store.get_claude_state(session_id)
            return StartClaudeResponse(
                session_id=session_id,
                started=False,
                message=f"Claude state changed to {new_state}",
                claude_state=new_state or "not_started",
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
        # Command failed - set state to error
        terminal_store.update_claude_state(session_id, "error")
        logger.error(
            "claude_send_keys_failed",
            session_id=session_id,
            error=result.stderr,
        )
        return StartClaudeResponse(
            session_id=session_id,
            started=False,
            message=f"Failed to send command: {result.stderr}",
            claude_state="error",
        )

    # Schedule background verification task
    background_tasks.add_task(_background_verify_claude_start, session_id, tmux_session)

    logger.info(
        "claude_start_initiated",
        session_id=session_id,
        tmux_session=tmux_session,
    )

    return StartClaudeResponse(
        session_id=session_id,
        started=True,
        message="Claude command sent, verifying startup...",
        claude_state="starting",
    )
