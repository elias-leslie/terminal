"""PTY management service for terminal sessions.

Handles low-level PTY operations:
- Spawning PTY attached to tmux sessions
- Resizing PTY terminals
- Reading PTY output with UTF-8 handling
- Session name validation
"""

from __future__ import annotations

import asyncio
import contextlib
import errno
import fcntl
import os
import pty
import shlex
import struct
import termios
from typing import TYPE_CHECKING

from ..logging_config import get_logger
from ..utils.tmux import run_tmux_command, validate_session_name

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = get_logger(__name__)


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
                logger.info("using_stored_target_session", session=stored_target_session)

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


# Output batching constants (from ghostty/AutoMaker analysis)
FLUSH_INTERVAL_MS = 16  # milliseconds - ~60fps
BATCH_SIZE_LIMIT = 4096  # bytes - 4KB


async def read_pty_output(websocket: WebSocket, master_fd: int) -> None:
    """Read output from PTY and send to WebSocket with batching.

    Uses asyncio native FD watching with loop.add_reader() for true zero CPU
    when idle, instead of polling with select().

    Implements 16ms/4KB batching to prevent browser freeze on heavy output:
    - Accumulates data into a buffer
    - Flushes every 16ms OR when buffer reaches 4KB
    - Ensures final buffer is flushed on disconnect

    Handles UTF-8 decoding with buffering for incomplete multi-byte sequences.

    Args:
        websocket: WebSocket connection to send output to
        master_fd: Master file descriptor to read from
    """
    loop = asyncio.get_event_loop()
    # Queue to bridge sync callback to async context
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    # Buffer for incomplete UTF-8 sequences at end of reads
    utf8_buffer = b""
    # Max buffer size - UTF-8 chars are max 4 bytes
    MAX_UTF8_BUFFER = 4
    # Output batch buffer for throttling
    batch_buffer = ""
    # Track last flush time
    last_flush_time = loop.time()

    def on_readable() -> None:
        """Callback when FD has data available - runs in event loop thread."""
        try:
            data = os.read(master_fd, 8192)
            if data:
                queue.put_nowait(data)
            else:
                queue.put_nowait(None)  # EOF
        except OSError as e:
            # EIO is expected when terminal closes
            if e.errno != errno.EIO:
                logger.warning(
                    "pty_read_error",
                    error=str(e),
                    errno=e.errno,
                )
            queue.put_nowait(None)

    async def flush_batch() -> bool:
        """Flush accumulated batch buffer to WebSocket.

        Returns:
            True if session should continue, False if session exited
        """
        nonlocal batch_buffer, last_flush_time
        if batch_buffer:
            await websocket.send_text(batch_buffer)
            # Detect tmux session exit - triggers disconnect for reconnect
            if "[exited]" in batch_buffer:
                logger.info("tmux_session_exited_detected")
                batch_buffer = ""
                return False
            batch_buffer = ""
        last_flush_time = loop.time()
        return True

    # Register FD for read events - true event-driven, zero CPU when idle
    loop.add_reader(master_fd, on_readable)

    try:
        while True:
            # Calculate time until next flush
            time_since_flush = (loop.time() - last_flush_time) * 1000  # ms
            wait_time = max(0.001, (FLUSH_INTERVAL_MS - time_since_flush) / 1000)

            try:
                # Wait for data with timeout to enable periodic flushing
                output = await asyncio.wait_for(queue.get(), timeout=wait_time)
            except TimeoutError:
                # Flush interval reached - flush current batch if any
                if not await flush_batch():
                    break
                continue

            if output is None:
                # EOF or error - flush remaining buffer before exit
                await flush_batch()
                break

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
                    decoded = output[: e.start].decode("utf-8", errors="replace")
                else:
                    # Error in middle, replace and continue
                    decoded = output.decode("utf-8", errors="replace")

            if decoded:
                batch_buffer += decoded

                # Flush if batch size limit reached
                if len(batch_buffer) >= BATCH_SIZE_LIMIT and not await flush_batch():
                    break

    except asyncio.CancelledError:
        # Flush remaining buffer on cancellation
        if batch_buffer:
            with contextlib.suppress(Exception):
                await websocket.send_text(batch_buffer)
    except Exception as e:
        logger.error("terminal_output_error", error=str(e))
    finally:
        # Always clean up the FD reader
        loop.remove_reader(master_fd)
