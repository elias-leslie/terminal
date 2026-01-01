"""PTY management service for terminal sessions.

Handles low-level PTY operations:
- Spawning PTY attached to tmux sessions
- Resizing PTY terminals
- Reading PTY output with UTF-8 handling
- Session name validation
"""

from __future__ import annotations

import asyncio
import errno
import fcntl
import os
import pty
import re
import select
import shlex
import struct
import termios
from typing import TYPE_CHECKING

from ..logging_config import get_logger
from ..utils.tmux import run_tmux_command

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = get_logger(__name__)

# Regex for valid session names (alphanumeric + hyphen/underscore/colon)
_SESSION_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-:]+$")


def validate_session_name(name: str) -> bool:
    """Validate tmux session name to prevent injection attacks.

    Args:
        name: Session name to validate

    Returns:
        True if valid, False otherwise
    """
    return bool(_SESSION_NAME_PATTERN.match(name)) and len(name) < 256


def spawn_pty_for_tmux(
    tmux_session: str,
    stored_target_session: str | None = None,
) -> tuple[int, int]:
    """Spawn a PTY attached to a tmux session.

    Args:
        tmux_session: Base tmux session name to attach to
        stored_target_session: Previously stored target session to auto-switch to

    Returns:
        Tuple of (master_fd, pid)

    Raises:
        ValueError: If tmux session name is invalid

    Security:
        Session names are validated with validate_session_name() before use.
        shlex.quote() provides additional protection for shell commands.
    """
    # Validate session names to prevent command injection
    if not validate_session_name(tmux_session):
        raise ValueError(f"Invalid tmux session name: {tmux_session[:50]}")

    # Check if stored target session still exists
    target_session = None
    if stored_target_session:
        if not validate_session_name(stored_target_session):
            logger.warning(
                "invalid_target_session_name",
                session=stored_target_session[:50],
            )
        else:
            success, _ = run_tmux_command(["has-session", "-t", stored_target_session])
            if success:
                target_session = stored_target_session
                logger.info(
                    "using_stored_target_session", session=stored_target_session
                )

    # Fork a PTY
    pid, master_fd = pty.fork()

    if pid == 0:
        # Child process - set TERM and attach to tmux
        os.environ["TERM"] = "xterm-256color"
        if target_session:
            # Attach to base session then immediately switch to target session
            # Use shlex.quote for additional shell injection protection
            safe_base = shlex.quote(tmux_session)
            safe_target = shlex.quote(target_session)
            os.execvp(
                "bash",
                [
                    "bash",
                    "-c",
                    f"tmux attach-session -t {safe_base} \\; switch-client -t {safe_target}",
                ],
            )
        else:
            os.execvp("tmux", ["tmux", "attach-session", "-t", tmux_session])
    else:
        # Parent process - configure the master FD
        # Set non-blocking
        flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
        fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        return master_fd, pid

    # Should not reach here - child process replaces itself
    raise RuntimeError("PTY fork failed")


def resize_pty(master_fd: int, cols: int, rows: int) -> None:
    """Resize a PTY.

    Args:
        master_fd: Master file descriptor
        cols: Number of columns
        rows: Number of rows
    """
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)


async def read_pty_output(websocket: WebSocket, master_fd: int) -> None:
    """Read output from PTY and send to WebSocket.

    Handles UTF-8 decoding with buffering for incomplete multi-byte sequences.

    Args:
        websocket: WebSocket connection to send output to
        master_fd: Master file descriptor to read from
    """
    loop = asyncio.get_event_loop()
    # Buffer for incomplete UTF-8 sequences at end of reads
    utf8_buffer = b""
    # Max buffer size - UTF-8 chars are max 4 bytes
    MAX_UTF8_BUFFER = 4

    try:
        while True:
            # Use select to wait for data with timeout
            ready, _, _ = await loop.run_in_executor(
                None,
                lambda: select.select([master_fd], [], [], 0.1),
            )

            if ready:
                try:
                    output = os.read(master_fd, 8192)
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
                                # Safety: clear buffer if it grows too large
                                if len(utf8_buffer) > MAX_UTF8_BUFFER:
                                    logger.debug(
                                        "utf8_buffer_overflow",
                                        buffer_size=len(utf8_buffer),
                                    )
                                    utf8_buffer = b""
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
                except OSError as e:
                    # EIO is expected when terminal closes
                    if e.errno != errno.EIO:
                        logger.warning(
                            "pty_read_error",
                            error=str(e),
                            errno=e.errno,
                        )
                    break
            else:
                await asyncio.sleep(0.01)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("terminal_output_error", error=str(e))
