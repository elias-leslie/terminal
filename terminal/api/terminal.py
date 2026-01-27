"""Terminal WebSocket API for PTY sessions.

Provides WebSocket endpoints for terminal access:
- /ws/terminal/{session_id} - Connect to a terminal session

Uses tmux for session persistence so terminals survive disconnects.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from typing import Any

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect

from ..config import TMUX_DEFAULT_COLS, TMUX_DEFAULT_ROWS
from ..logging_config import get_logger
from ..services import lifecycle
from ..services.pty_manager import (
    read_pty_output,
    resize_pty,
    spawn_pty_for_tmux,
)
from ..storage import terminal as terminal_store
from ..utils.tmux import (
    create_tmux_session,
    get_scrollback,
    resize_tmux_window,
    validate_session_name,
)

logger = get_logger(__name__)
router = APIRouter()

_sessions: dict[str, dict[str, Any]] = {}

# Prefix for terminal base sessions
_BASE_SESSION_PREFIX = "summitflow-"


@router.get("/api/internal/session-switch")
async def session_switch_hook(
    request: Request,
    from_session: str = Query(..., alias="from"),
    to_session: str = Query(..., alias="to"),
) -> dict[str, Any]:
    """Handle tmux session switch notifications.

    Called by tmux hook when a client switches sessions.
    Extracts terminal session ID from the base session name and stores the target.

    Security: Only accepts requests from localhost (tmux hooks).
    """
    # Security: Only allow localhost
    client_host = request.client.host if request.client else None
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        logger.warning(
            "session_switch_rejected",
            reason="not_localhost",
            client=client_host,
        )
        return {"status": "rejected", "reason": "unauthorized"}

    # Validate session names to prevent injection
    # Empty from_session is valid (first connection to a session)
    if (
        from_session and not validate_session_name(from_session)
    ) or not validate_session_name(to_session):
        logger.warning(
            "session_switch_rejected",
            reason="invalid_session_name",
            from_session=from_session[:50] if from_session else "",
            to_session=to_session[:50],
        )
        return {"status": "rejected", "reason": "invalid session name"}

    # Only track switches FROM a terminal base session
    # Empty from_session means initial connection, not a switch
    if not from_session or not from_session.startswith(_BASE_SESSION_PREFIX):
        return {"status": "ignored", "reason": "not from base session"}

    # Extract terminal session ID from "summitflow-{uuid}"
    terminal_session_id = from_session[len(_BASE_SESSION_PREFIX) :]

    # Don't store if switching back to base session
    if to_session.startswith(_BASE_SESSION_PREFIX):
        logger.info("session_switch_to_base", terminal=terminal_session_id)
        terminal_store.update_claude_session(terminal_session_id, None)
        return {"status": "cleared"}

    # Store the target session
    logger.info(
        "session_switch_detected", terminal=terminal_session_id, target=to_session
    )
    terminal_store.update_claude_session(terminal_session_id, to_session)

    return {"status": "stored", "target": to_session}


def _validate_and_prepare_session(session_id: str) -> tuple[dict[str, Any], str]:
    """Validate session exists and prepare for WebSocket connection.

    Args:
        session_id: Terminal session identifier

    Returns:
        Tuple of (session_dict, tmux_session_name)

    Raises:
        ValueError: If session is invalid or cannot be restored
    """
    # Check if session exists in DB and ensure tmux is alive
    # This will recreate tmux if the DB record exists but tmux died
    try:
        is_alive = lifecycle.ensure_session_alive(session_id)
    except Exception as e:
        # Handle invalid session IDs (e.g., non-UUID format)
        logger.warning("terminal_session_invalid", session_id=session_id, error=str(e))
        raise ValueError(f"Invalid session ID: {session_id}") from e

    if not is_alive:
        # Session doesn't exist in DB or couldn't be resurrected
        logger.warning("terminal_session_dead", session_id=session_id)
        raise ValueError(f"Session not found or could not be restored: {session_id}")

    # Touch session to update last_accessed_at
    terminal_store.touch_session(session_id)

    # Get session info for working directory and stored target session
    session = terminal_store.get_session(session_id)
    if not session:
        raise ValueError(f"Session not found after validation: {session_id}")

    # Get tmux session name (should exist now due to ensure_session_alive)
    session_working_dir = session.get("working_dir")
    tmux_session_name = create_tmux_session(session_id, session_working_dir)

    return session, tmux_session_name


def _handle_websocket_message(
    message: Any,
    master_fd: int,
    session_id: str,
    tmux_session_name: str | None = None,
) -> tuple[int, int] | None:
    """Handle a single WebSocket message.

    Args:
        message: WebSocket message dict
        master_fd: Master file descriptor to write to
        session_id: Terminal session ID (for logging)
        tmux_session_name: tmux session name for resize operations

    Returns:
        (cols, rows) tuple if this was a resize event, None otherwise

    Handles:
    - Resize commands (JSON starting with {"resize":)
    - Text input (forwarded to PTY)
    - Binary input (forwarded to PTY)
    """
    # Handle text messages
    if "text" in message:
        text = message["text"]

        # Check for JSON control commands
        if text.startswith("{"):
            try:
                data = json.loads(text)

                # Handle resize command
                if "resize" in data:
                    resize = data.get("resize", {})
                    cols = resize.get("cols", TMUX_DEFAULT_COLS)
                    rows = resize.get("rows", TMUX_DEFAULT_ROWS)
                    resize_pty(master_fd, cols, rows)
                    # Also resize the tmux window to match
                    if tmux_session_name:
                        resize_tmux_window(tmux_session_name, cols, rows)
                    logger.info(
                        "terminal_resized",
                        session_id=session_id,
                        cols=cols,
                        rows=rows,
                    )
                    return (cols, rows)

                # Handle refresh command (redraw terminal after connect)
                if data.get("refresh"):
                    # Send Ctrl+L to trigger terminal redraw
                    os.write(master_fd, b"\x0c")
                    logger.debug("terminal_refreshed", session_id=session_id)
                    return None

            except json.JSONDecodeError:
                # Not valid JSON, treat as input
                pass

        # Regular input - write to PTY
        os.write(master_fd, text.encode("utf-8"))
        return None

    # Handle binary messages
    if "bytes" in message:
        os.write(master_fd, message["bytes"])
        return None

    return None


@router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(
    websocket: WebSocket,
    session_id: str,
    working_dir: str | None = Query(None),
) -> None:
    """WebSocket endpoint for terminal sessions.

    Protocol:
    - Text messages: Input to terminal
    - Binary messages starting with 'r': Resize event (JSON: {cols, rows})
    - Server sends output as text messages

    Args:
        websocket: WebSocket connection
        session_id: Terminal session identifier
        working_dir: Optional working directory for new sessions
    """
    await websocket.accept()
    logger.info("terminal_connected", session_id=session_id, working_dir=working_dir)

    master_fd: int | None = None
    pid: int | None = None

    try:
        # Validate session and prepare tmux
        try:
            session, tmux_session_name = _validate_and_prepare_session(session_id)
        except ValueError as e:
            await websocket.close(
                code=4000,
                reason=f'{{"error": "session_dead", "message": "{e!s}"}}',
            )
            return

        # Extract session data for PTY spawn
        stored_target_session = session.get("last_claude_session")

        # Spawn PTY for tmux (pass stored target session for auto-reconnect)
        master_fd, pid = spawn_pty_for_tmux(tmux_session_name, stored_target_session)

        # Store session info
        _sessions[session_id] = {
            "master_fd": master_fd,
            "pid": pid,
            "session_name": tmux_session_name,
        }

        # Wait for first resize event from frontend (sync dimensions)
        # This ensures tmux dimensions match frontend before sending scrollback
        initial_resize_received = False
        resize_timeout = 5.0  # seconds to wait for resize

        try:
            async with asyncio.timeout(resize_timeout):
                while not initial_resize_received:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        return
                    resize_result = _handle_websocket_message(
                        message, master_fd, session_id, tmux_session_name
                    )
                    if resize_result is not None:
                        initial_resize_received = True
                        logger.info(
                            "initial_resize_received",
                            session_id=session_id,
                            cols=resize_result[0],
                            rows=resize_result[1],
                        )
        except TimeoutError:
            # No resize received, proceed with defaults
            logger.warning(
                "initial_resize_timeout",
                session_id=session_id,
                timeout=resize_timeout,
            )

        # Capture and send scrollback after resize (dimensions now match)
        scrollback = get_scrollback(tmux_session_name)
        if scrollback:
            await websocket.send_text(scrollback)
            logger.info(
                "scrollback_sent",
                session_id=session_id,
                bytes=len(scrollback),
            )

        # Start output reader task for live output
        output_task = asyncio.create_task(read_pty_output(websocket, master_fd))

        # Auto-start Claude for claude-mode sessions
        session_mode = session.get("mode")
        if session_mode == "claude":
            # Import here to avoid circular import
            from ..utils.tmux import is_claude_running_in_session

            # Check if Claude is already running
            if not is_claude_running_in_session(tmux_session_name):
                # Wait for shell prompt to appear, then send claude command
                await asyncio.sleep(0.3)
                os.write(master_fd, b"claude --dangerously-skip-permissions\n")
                logger.info("auto_started_claude", session_id=session_id)

        # Session tracking is now handled by tmux hooks (see main.py)
        # No polling needed - hooks notify us instantly on session switch

        # Read input from WebSocket
        try:
            while True:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                _handle_websocket_message(
                    message, master_fd, session_id, tmux_session_name
                )

        except WebSocketDisconnect:
            logger.info("terminal_disconnected", session_id=session_id)

        finally:
            output_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await output_task

    except Exception as e:
        logger.error("terminal_error", session_id=session_id, error=str(e))
        with contextlib.suppress(Exception):
            await websocket.close(code=1011, reason=str(e))

    finally:
        # Clean up PTY child process and fd, but keep tmux session
        if pid is not None:
            with contextlib.suppress(OSError):
                os.kill(pid, 9)  # SIGKILL the tmux attach process
            # Wait for child to exit (with retries to prevent zombie)
            for _ in range(20):
                try:
                    wpid, _ = os.waitpid(pid, os.WNOHANG)
                    if wpid != 0:
                        break  # Child reaped
                except ChildProcessError:
                    break  # Already reaped by someone else
                except OSError:
                    break  # Process doesn't exist
                await asyncio.sleep(0.01)  # 10ms delay between retries
            else:
                # Final blocking wait if still not reaped
                with contextlib.suppress(OSError, ChildProcessError):
                    os.waitpid(pid, 0)

        if master_fd is not None:
            with contextlib.suppress(OSError):
                os.close(master_fd)

        _sessions.pop(session_id, None)

        logger.info("terminal_cleanup_complete", session_id=session_id)
