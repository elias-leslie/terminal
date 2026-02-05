"""tmux session management utilities.

Provides core tmux operations: session naming, existence checks, creation,
listing, scrollback capture, and window resizing.
"""

from __future__ import annotations

import os
import re
import subprocess

from ..config import TMUX_DEFAULT_COLS, TMUX_DEFAULT_ROWS
from ..logging_config import get_logger

logger = get_logger(__name__)

TMUX_COMMAND_TIMEOUT = 10  # seconds for tmux subprocess calls
_SESSION_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-:]+$")

# Secrets filtered from tmux session environments
FILTERED_ENV_VARS = {
    "DATABASE_URL",
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "SECRET_KEY",
    "JWT_SECRET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "SLACK_TOKEN",
    "DISCORD_TOKEN",
}


class TmuxError(Exception):
    """Error interacting with tmux."""


def validate_session_name(name: str) -> bool:
    """Validate tmux session name to prevent injection attacks."""
    return bool(_SESSION_NAME_PATTERN.match(name)) and len(name) < 256


def run_tmux_command(args: list[str], check: bool = False) -> tuple[bool, str]:
    """Run a tmux command with standardized error handling.

    Returns: (success, output_or_error)
    Raises: TmuxError if check=True and command fails
    """
    cmd = ["tmux", *args]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=TMUX_COMMAND_TIMEOUT)
        if result.returncode == 0:
            return True, result.stdout.strip()

        error_msg = result.stderr.strip() or f"tmux exited with code {result.returncode}"
        logger.debug("tmux_command_failed", cmd=args, error=error_msg)
        if check:
            raise TmuxError(error_msg)
        return False, error_msg
    except subprocess.TimeoutExpired as err:
        error_msg = f"tmux command timed out after {TMUX_COMMAND_TIMEOUT}s"
        logger.error("tmux_command_timeout", cmd=args)
        if check:
            raise TmuxError(error_msg) from err
        return False, error_msg


def get_tmux_session_name(session_id: str) -> str:
    """Convert session ID to tmux session name."""
    return f"summitflow-{session_id}"


def tmux_session_exists_by_name(session_name: str) -> bool:
    """Check if a tmux session exists by its direct name."""
    success, _ = run_tmux_command(["has-session", "-t", session_name])
    return success


def tmux_session_exists(session_id: str) -> bool:
    """Check if a tmux session exists."""
    return tmux_session_exists_by_name(get_tmux_session_name(session_id))


def _apply_session_options(session_name: str, disable_mouse: bool = True) -> None:
    """Apply session options: mouse off, status off, filter secret env vars."""
    if disable_mouse:
        run_tmux_command(["set-option", "-t", session_name, "mouse", "off"])
    run_tmux_command(["set-option", "-t", session_name, "status", "off"])
    for var in FILTERED_ENV_VARS:
        run_tmux_command(["set-environment", "-t", session_name, "-u", var])
    logger.debug("session_configured", session=session_name, filtered_vars=len(FILTERED_ENV_VARS))


def create_tmux_session(
    session_id: str,
    working_dir: str | None = None,
    disable_mouse: bool = True,
) -> str:
    """Create or reconfigure a tmux session.

    Returns: tmux session name
    Raises: TmuxError if session creation fails
    """
    session_name = get_tmux_session_name(session_id)

    # If session exists, reconfigure and return
    if tmux_session_exists(session_id):
        logger.info("tmux_session_exists", session=session_name)
        _apply_session_options(session_name, disable_mouse)
        return session_name

    # Create new session
    effective_working_dir = working_dir or os.path.expanduser("~")
    args = [
        "new-session",
        "-d",
        "-s",
        session_name,
        "-x",
        str(TMUX_DEFAULT_COLS),
        "-y",
        str(TMUX_DEFAULT_ROWS),
        "-c",
        effective_working_dir,
    ]

    success, output = run_tmux_command(args)
    if not success:
        logger.error("tmux_create_failed", session=session_name, error=output)
        raise TmuxError(f"Failed to create tmux session: {output}")

    _apply_session_options(session_name, disable_mouse)
    logger.info("tmux_session_created", session=session_name, working_dir=effective_working_dir)
    return session_name


def list_tmux_sessions() -> set[str]:
    """List all summitflow tmux sessions (returns session IDs without prefix)."""
    success, output = run_tmux_command(["list-sessions", "-F", "#{session_name}"])

    if not success:
        return set()

    return {
        line.replace("summitflow-", "")
        for line in output.split("\n")
        if line.startswith("summitflow-")
    }


def is_claude_running_in_session(session_name: str) -> bool:
    """Check if Claude is running in a tmux session."""
    success, output = run_tmux_command(
        ["list-panes", "-t", session_name, "-F", "#{pane_current_command}"]
    )
    return success and any("claude" in line.lower() for line in output.split("\n"))


def get_scrollback(session_name: str) -> str | None:
    """Capture tmux scrollback with escape sequences and joined wrapped lines."""
    success, output = run_tmux_command(
        ["capture-pane", "-t", session_name, "-S", "-", "-e", "-J", "-p"]
    )

    if not success:
        logger.warning("tmux_scrollback_capture_failed", session=session_name)
        return None

    return output


def resize_tmux_window(session_name: str, cols: int, rows: int) -> bool:
    """Resize tmux window to match frontend dimensions."""
    success, _ = run_tmux_command(
        ["resize-window", "-t", session_name, "-x", str(cols), "-y", str(rows)]
    )

    if success:
        logger.debug("tmux_window_resized", session=session_name, cols=cols, rows=rows)
    else:
        logger.warning("tmux_window_resize_failed", session=session_name, cols=cols, rows=rows)

    return success
