"""Terminal WebSocket API for PTY sessions.

Provides WebSocket endpoints for terminal access:
- /ws/terminal/{session_id} - Connect to a terminal session

Uses tmux for session persistence so terminals survive disconnects.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import json
import os
import pty
import select
import struct
import termios
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..config import TMUX_DEFAULT_COLS, TMUX_DEFAULT_ROWS
from ..logging_config import get_logger
from ..services import lifecycle
from ..storage import terminal as terminal_store
from ..utils.tmux import create_tmux_session, run_tmux_command

logger = get_logger(__name__)
router = APIRouter()

# Active terminal sessions: session_id -> master_fd
_sessions: dict[str, dict[str, Any]] = {}

# Prefix for terminal base sessions
_BASE_SESSION_PREFIX = "summitflow-"


@router.get("/api/internal/session-switch")
async def session_switch_hook(
    from_session: str = Query(..., alias="from"),
    to_session: str = Query(..., alias="to"),
) -> dict:
    """Handle tmux session switch notifications.

    Called by tmux hook when a client switches sessions.
    Extracts terminal session ID from the base session name and stores the target.
    """
    # Only track switches FROM a terminal base session
    if not from_session.startswith(_BASE_SESSION_PREFIX):
        return {"status": "ignored", "reason": "not from base session"}

    # Extract terminal session ID from "summitflow-{uuid}"
    terminal_session_id = from_session[len(_BASE_SESSION_PREFIX):]

    # Don't store if switching back to base session
    if to_session.startswith(_BASE_SESSION_PREFIX):
        logger.info("session_switch_to_base", terminal=terminal_session_id)
        terminal_store.update_claude_session(terminal_session_id, None)
        return {"status": "cleared"}

    # Store the target session
    logger.info("session_switch_detected", terminal=terminal_session_id, target=to_session)
    terminal_store.update_claude_session(terminal_session_id, to_session)

    return {"status": "stored", "target": to_session}


def _spawn_pty_for_tmux(
    tmux_session: str,
    stored_target_session: str | None = None,
) -> tuple[int, int]:
    """Spawn a PTY attached to a tmux session.

    Args:
        tmux_session: Base tmux session name to attach to
        stored_target_session: Previously stored target session to auto-switch to

    Returns:
        Tuple of (master_fd, pid)
    """
    # Check if stored target session still exists
    target_session = None
    if stored_target_session:
        success, _ = run_tmux_command(["has-session", "-t", stored_target_session])
        if success:
            target_session = stored_target_session
            logger.info("using_stored_target_session", session=stored_target_session)

    # Fork a PTY
    pid, master_fd = pty.fork()

    if pid == 0:
        # Child process - set TERM and attach to tmux
        os.environ["TERM"] = "xterm-256color"
        if target_session:
            # Attach to base session then immediately switch to target session
            os.execvp(
                "bash",
                ["bash", "-c", f"tmux attach-session -t {tmux_session} \\; switch-client -t {target_session}"],
            )
        else:
            os.execvp("tmux", ["tmux", "attach-session", "-t", tmux_session])
    else:
        # Parent process - configure the master FD
        # Set non-blocking
        flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
        fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        return master_fd, pid


def _resize_pty(master_fd: int, cols: int, rows: int) -> None:
    """Resize a PTY.

    Args:
        master_fd: Master file descriptor
        cols: Number of columns
        rows: Number of rows
    """
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)


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
        # Check if session exists in DB and ensure tmux is alive
        # This will recreate tmux if the DB record exists but tmux died
        try:
            is_alive = lifecycle.ensure_session_alive(session_id)
        except Exception as e:
            # Handle invalid session IDs (e.g., non-UUID format)
            logger.warning("terminal_session_invalid", session_id=session_id, error=str(e))
            is_alive = False

        if not is_alive:
            # Session doesn't exist in DB or couldn't be resurrected
            logger.warning("terminal_session_dead", session_id=session_id)
            await websocket.close(
                code=4000,
                reason='{"error": "session_dead", "message": "Session not found or could not be restored"}',
            )
            return

        # Touch session to update last_accessed_at
        terminal_store.touch_session(session_id)

        # Get session info for working directory and stored target session
        session = terminal_store.get_session(session_id)
        session_working_dir = session.get("working_dir") if session else working_dir
        stored_target_session = session.get("last_claude_session") if session else None

        # Create or attach to tmux session (should exist now due to ensure_session_alive)
        tmux_session_name = create_tmux_session(session_id, session_working_dir)

        # Spawn PTY for tmux (pass stored target session for auto-reconnect)
        master_fd, pid = _spawn_pty_for_tmux(tmux_session_name, stored_target_session)

        # Store session info
        _sessions[session_id] = {
            "master_fd": master_fd,
            "pid": pid,
            "session_name": tmux_session_name,
        }

        # NOTE: We intentionally do NOT send tmux scrollback here.
        # Sending scrollback causes display corruption when tmux width != frontend width.
        # Users can scroll through tmux history using copy-mode (Ctrl+B [).
        # The xterm.js scrollback buffer handles new content correctly.

        # Start output reader task
        output_task = asyncio.create_task(_read_output(websocket, master_fd))

        # Session tracking is now handled by tmux hooks (see main.py)
        # No polling needed - hooks notify us instantly on session switch

        # Read input from WebSocket
        try:
            while True:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                if "text" in message:
                    text = message["text"]

                    # Check for resize command (JSON starting with {"resize":)
                    if text.startswith('{"resize":'):
                        try:
                            data = json.loads(text)
                            resize = data.get("resize", {})
                            cols = resize.get("cols", TMUX_DEFAULT_COLS)
                            rows = resize.get("rows", TMUX_DEFAULT_ROWS)
                            _resize_pty(master_fd, cols, rows)
                            logger.info(
                                "terminal_resized",
                                session_id=session_id,
                                cols=cols,
                                rows=rows,
                            )
                        except json.JSONDecodeError:
                            pass
                    else:
                        # Regular input - write to PTY
                        os.write(master_fd, text.encode("utf-8"))

                elif "bytes" in message:
                    # Binary data - write directly
                    os.write(master_fd, message["bytes"])

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
                os.waitpid(pid, os.WNOHANG)  # Reap zombie

        if master_fd is not None:
            with contextlib.suppress(OSError):
                os.close(master_fd)

        _sessions.pop(session_id, None)

        logger.info("terminal_cleanup_complete", session_id=session_id)


async def _read_output(websocket: WebSocket, master_fd: int) -> None:
    """Read output from PTY and send to WebSocket.

    Args:
        websocket: WebSocket connection
        master_fd: Master file descriptor
    """
    loop = asyncio.get_event_loop()
    # Buffer for incomplete UTF-8 sequences at end of reads
    utf8_buffer = b""

    try:
        while True:
            # Use select to wait for data with timeout
            ready, _, _ = await loop.run_in_executor(
                None,
                lambda: select.select([master_fd], [], [], 0.1),
            )

            if ready:
                try:
                    output = os.read(master_fd, 4096)
                    if output:
                        # Prepend any buffered incomplete sequence
                        output = utf8_buffer + output
                        utf8_buffer = b""

                        # Try to decode, handling incomplete sequences at the end
                        try:
                            decoded = output.decode("utf-8")
                        except UnicodeDecodeError as e:
                            # Check if error is at the end (incomplete sequence)
                            if e.start >= len(output) - 3:
                                # Buffer the incomplete bytes for next read
                                utf8_buffer = output[e.start :]
                                decoded = output[: e.start].decode(
                                    "utf-8", errors="replace"
                                )
                            else:
                                # Error in middle, replace and continue
                                decoded = output.decode("utf-8", errors="replace")

                        if decoded:
                            await websocket.send_text(decoded)

                            # Detect tmux session exit - triggers disconnect for reconnect
                            if "[exited]" in decoded:
                                logger.info("tmux_session_exited_detected")
                                break
                except OSError:
                    break
            else:
                await asyncio.sleep(0.01)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("terminal_output_error", error=str(e))
