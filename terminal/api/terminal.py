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
import re
import select
import struct
import subprocess
import termios
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..logging_config import get_logger
from ..services import lifecycle
from ..storage import terminal as terminal_store

logger = get_logger(__name__)
router = APIRouter()

# Active terminal sessions: session_id -> master_fd
_sessions: dict[str, dict[str, Any]] = {}


def _create_tmux_session(session_id: str, working_dir: str | None = None) -> str:
    """Create or attach to a tmux session.

    Args:
        session_id: Unique session identifier
        working_dir: Optional working directory to start in

    Returns:
        tmux session name
    """
    session_name = f"summitflow-{session_id}"

    # Check if session exists
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        capture_output=True,
    )

    if result.returncode != 0:
        # Create new session with optional working directory
        cmd = ["tmux", "new-session", "-d", "-s", session_name, "-x", "120", "-y", "30"]
        if working_dir:
            cmd.extend(["-c", working_dir])
        subprocess.run(cmd, capture_output=True)

        # Disable mouse mode so xterm.js handles selection natively
        subprocess.run(
            ["tmux", "set-option", "-t", session_name, "mouse", "off"],
            capture_output=True,
        )
        logger.info("tmux_session_created", session=session_name, working_dir=working_dir)
    else:
        # Ensure mouse is off for existing sessions too
        subprocess.run(
            ["tmux", "set-option", "-t", session_name, "mouse", "off"],
            capture_output=True,
        )
        logger.info("tmux_session_attached", session=session_name)

    return session_name


def _get_claude_session_for_project(working_dir: str | None, session_name: str | None) -> str | None:
    """Find the claude-* tmux session matching a project.

    Tries working_dir first, then falls back to session_name.

    Args:
        working_dir: Working directory (e.g., /home/user/portfolio-ai)
        session_name: Terminal session name (e.g., "Portfolio-AI")

    Returns:
        Claude session name if found and exists, None otherwise
    """
    project_name = None

    # Try working_dir first
    if working_dir:
        project_name = os.path.basename(working_dir.rstrip("/"))

    # Fall back to session name (convert to lowercase, replace spaces with hyphens)
    if not project_name and session_name:
        # "Portfolio-AI" -> "portfolio-ai"
        project_name = session_name.lower().replace(" ", "-")

    if not project_name:
        return None

    claude_session = f"claude-{project_name}"

    # Check if this session exists
    result = subprocess.run(
        ["tmux", "has-session", "-t", claude_session],
        capture_output=True,
    )

    if result.returncode == 0:
        logger.info("claude_session_found", project=project_name, session=claude_session)
        return claude_session

    return None


def _spawn_pty_for_tmux(
    tmux_session: str,
    working_dir: str | None = None,
    terminal_name: str | None = None,
    stored_claude_session: str | None = None,
) -> tuple[int, int]:
    """Spawn a PTY attached to a tmux session.

    Args:
        tmux_session: tmux session name
        working_dir: Working directory to determine which claude session to auto-switch to
        stored_claude_session: Previously stored claude session to reconnect to
        terminal_name: Terminal display name (fallback for project detection)

    Returns:
        Tuple of (master_fd, pid)
    """
    # First check stored claude session, then try to detect from project
    claude_session = None

    if stored_claude_session:
        # Verify stored session still exists
        result = subprocess.run(
            ["tmux", "has-session", "-t", stored_claude_session],
            capture_output=True,
        )
        if result.returncode == 0:
            claude_session = stored_claude_session
            logger.info("using_stored_claude_session", session=stored_claude_session)

    if not claude_session:
        # Fall back to detecting from working_dir or terminal_name
        claude_session = _get_claude_session_for_project(working_dir, terminal_name)

    # Fork a PTY
    pid, master_fd = pty.fork()

    if pid == 0:
        # Child process - set TERM and attach to tmux
        os.environ["TERM"] = "xterm-256color"
        if claude_session:
            # Attach to summitflow session then immediately switch to claude session
            os.execvp(
                "bash",
                ["bash", "-c", f"tmux attach-session -t {tmux_session} \\; switch-client -t {claude_session}"],
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

        # Get session info for working directory, name, and stored claude session
        session = terminal_store.get_session(session_id)
        session_working_dir = session.get("working_dir") if session else working_dir
        terminal_name = session.get("name") if session else None
        stored_claude_session = session.get("last_claude_session") if session else None

        # Create or attach to tmux session (should exist now due to ensure_session_alive)
        tmux_session_name = _create_tmux_session(session_id, session_working_dir)

        # Spawn PTY for tmux (pass stored claude session for auto-reconnect)
        master_fd, pid = _spawn_pty_for_tmux(
            tmux_session_name, session_working_dir, terminal_name, stored_claude_session
        )

        # Store session info
        _sessions[session_id] = {
            "master_fd": master_fd,
            "pid": pid,
            "session_name": tmux_session_name,
        }

        # Start output reader task
        output_task = asyncio.create_task(_read_output(websocket, master_fd, session_id))

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
                            cols = resize.get("cols", 120)
                            rows = resize.get("rows", 30)
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
        # Clean up PTY but keep tmux session
        if master_fd is not None:
            with contextlib.suppress(OSError):
                os.close(master_fd)

        _sessions.pop(session_id, None)

        logger.info("terminal_cleanup_complete", session_id=session_id)


# Patterns to detect tclaude - both new session and reattach
_TCLAUDE_START_PATTERN = re.compile(r"🚀 Starting Claude in (/\S+)")
_TCLAUDE_REATTACH_PATTERN = re.compile(r"🔄 Reattaching to (claude-\S+)")


async def _read_output(websocket: WebSocket, master_fd: int, session_id: str) -> None:
    """Read output from PTY and send to WebSocket.

    Args:
        websocket: WebSocket connection
        master_fd: Master file descriptor
        session_id: Terminal session ID for updating stored claude session
    """
    loop = asyncio.get_event_loop()

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
                        decoded = output.decode("utf-8", errors="replace")
                        await websocket.send_text(decoded)

                        # Detect tclaude startup (new session or reattach)
                        claude_session = None
                        project_name = None

                        # Check for new session: "🚀 Starting Claude in /path"
                        start_match = _TCLAUDE_START_PATTERN.search(decoded)
                        if start_match:
                            project_path = start_match.group(1)
                            project_name = os.path.basename(project_path.rstrip("/"))
                            claude_session = f"claude-{project_name}"

                        # Check for reattach: "🔄 Reattaching to claude-project..."
                        reattach_match = _TCLAUDE_REATTACH_PATTERN.search(decoded)
                        if reattach_match:
                            claude_session = reattach_match.group(1).rstrip(".")
                            # Extract project name from session name
                            project_name = claude_session.replace("claude-", "", 1)

                        if claude_session:
                            logger.info("tclaude_detected", project=project_name, session=claude_session)
                            terminal_store.update_claude_session(session_id, claude_session)
                            # Send tab name update to frontend
                            tab_name = project_name.replace("-", " ").title()
                            await websocket.send_text(f"\x1b]0;{tab_name}\x07")

                        # Detect tmux session exit - triggers reconnect to original session
                        if "[exited]" in decoded:
                            logger.info("tmux_session_exited_detected")
                            # Clear stored claude session on exit
                            terminal_store.update_claude_session(session_id, "")
                            break
                except OSError:
                    break
            else:
                await asyncio.sleep(0.01)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("terminal_output_error", error=str(e))
