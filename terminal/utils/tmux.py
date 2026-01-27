"""tmux session management utilities.

Provides core tmux operations used across the terminal service:
- Session naming conventions
- Session existence checks
- Session creation with error handling
- Session listing
"""

from __future__ import annotations

import re
import subprocess

from ..config import TMUX_DEFAULT_COLS, TMUX_DEFAULT_ROWS
from ..logging_config import get_logger

logger = get_logger(__name__)

TMUX_COMMAND_TIMEOUT = 10  # seconds for tmux subprocess calls

# Regex for valid session names (alphanumeric + hyphen/underscore/colon)
_SESSION_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-:]+$")


class TmuxError(Exception):
    """Error interacting with tmux."""


def validate_session_name(name: str) -> bool:
    """Validate tmux session name to prevent injection attacks.

    Args:
        name: Session name to validate

    Returns:
        True if valid, False otherwise
    """
    return bool(_SESSION_NAME_PATTERN.match(name)) and len(name) < 256


def run_tmux_command(args: list[str], check: bool = False) -> tuple[bool, str]:
    """Run a tmux command with standardized error handling.

    Args:
        args: Command arguments (tmux is prepended automatically)
        check: If True, raise TmuxError on failure

    Returns:
        Tuple of (success, output_or_error)

    Raises:
        TmuxError: If check=True and command fails
    """
    cmd = ["tmux", *args]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TMUX_COMMAND_TIMEOUT,
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            error_msg = (
                result.stderr.strip() or f"tmux exited with code {result.returncode}"
            )
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
    """Convert session ID to tmux session name.

    Args:
        session_id: Session UUID

    Returns:
        tmux session name (e.g., summitflow-abc123)
    """
    return f"summitflow-{session_id}"


def tmux_session_exists_by_name(session_name: str) -> bool:
    """Check if a tmux session exists by its direct name.

    Args:
        session_name: Direct tmux session name

    Returns:
        True if tmux session exists
    """
    success, _ = run_tmux_command(["has-session", "-t", session_name])
    return success


def tmux_session_exists(session_id: str) -> bool:
    """Check if a tmux session exists.

    Args:
        session_id: Session UUID

    Returns:
        True if tmux session exists
    """
    session_name = get_tmux_session_name(session_id)
    return tmux_session_exists_by_name(session_name)


# Environment variables to filter out (secrets that shouldn't be exposed to child shells)
# These vars are unset in tmux sessions to prevent accidental exposure
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


def _filter_session_environment(session_name: str) -> None:
    """Remove sensitive environment variables from tmux session.

    Unsets known secret variables to prevent child shells from inheriting them.
    Uses tmux set-environment -u to unset vars in the session environment.

    Args:
        session_name: tmux session name
    """
    for var in FILTERED_ENV_VARS:
        # -u removes the variable from the session environment
        # -g would affect global, but we only want session scope
        run_tmux_command(["set-environment", "-t", session_name, "-u", var])

    logger.debug(
        "session_environment_filtered",
        session=session_name,
        filtered_count=len(FILTERED_ENV_VARS),
    )


def create_tmux_session(
    session_id: str,
    working_dir: str | None = None,
    disable_mouse: bool = True,
) -> str:
    """Create a tmux session.

    Args:
        session_id: Session UUID
        working_dir: Optional working directory
        disable_mouse: Disable mouse mode (default True, lets xterm.js handle selection)

    Returns:
        tmux session name

    Raises:
        TmuxError: If tmux session creation fails
    """
    session_name = get_tmux_session_name(session_id)

    # Check if already exists
    if tmux_session_exists(session_id):
        logger.info("tmux_session_exists", session=session_name)
        # Ensure mouse is disabled for existing sessions
        if disable_mouse:
            run_tmux_command(["set-option", "-t", session_name, "mouse", "off"])
        # Ensure status bar is disabled for existing sessions
        run_tmux_command(["set-option", "-t", session_name, "status", "off"])
        # Re-apply environment filtering (in case new secrets were added)
        _filter_session_environment(session_name)
        return session_name

    # Create new session - default to home directory if working_dir not specified
    import os

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
        logger.error(
            "tmux_create_failed",
            session=session_name,
            error=output,
        )
        raise TmuxError(f"Failed to create tmux session: {output}")

    # Disable mouse mode so xterm.js handles selection natively
    if disable_mouse:
        run_tmux_command(["set-option", "-t", session_name, "mouse", "off"])

    # Disable tmux status bar - web UI handles session info display
    run_tmux_command(["set-option", "-t", session_name, "status", "off"])

    # Filter out sensitive environment variables from the session
    _filter_session_environment(session_name)

    logger.info(
        "tmux_session_created", session=session_name, working_dir=effective_working_dir
    )
    return session_name


def list_tmux_sessions() -> set[str]:
    """List all summitflow tmux sessions.

    Returns:
        Set of session IDs (without summitflow- prefix)
    """
    success, output = run_tmux_command(["list-sessions", "-F", "#{session_name}"])

    sessions = set()
    if success:
        for line in output.split("\n"):
            if line.startswith("summitflow-"):
                session_id = line.replace("summitflow-", "")
                sessions.add(session_id)

    return sessions


def is_claude_running_in_session(session_name: str) -> bool:
    """Check if Claude is running in a tmux session.

    Args:
        session_name: tmux session name

    Returns:
        True if Claude is running in the session
    """
    # Get the current command running in the pane
    success, output = run_tmux_command(
        ["list-panes", "-t", session_name, "-F", "#{pane_current_command}"]
    )

    if not success:
        return False

    # Check if any pane is running claude
    return any("claude" in line.lower() for line in output.split("\n"))


def get_scrollback(session_name: str) -> str | None:
    """Capture tmux scrollback history for a session.

    Uses tmux capture-pane with options:
    - -S -: Start from beginning of history
    - -e: Include escape sequences (colors, formatting)
    - -J: Join wrapped lines
    - -p: Print to stdout (instead of tmux buffer)

    Args:
        session_name: tmux session name

    Returns:
        Scrollback content with escape sequences, or None if capture fails
    """
    success, output = run_tmux_command(
        ["capture-pane", "-t", session_name, "-S", "-", "-e", "-J", "-p"]
    )

    if not success:
        logger.warning("tmux_scrollback_capture_failed", session=session_name)
        return None

    return output


def resize_tmux_window(session_name: str, cols: int, rows: int) -> bool:
    """Resize tmux window to match frontend dimensions.

    Args:
        session_name: tmux session name
        cols: Number of columns
        rows: Number of rows

    Returns:
        True if resize succeeded
    """
    success, _ = run_tmux_command(
        ["resize-window", "-t", session_name, "-x", str(cols), "-y", str(rows)]
    )

    if success:
        logger.debug("tmux_window_resized", session=session_name, cols=cols, rows=rows)
    else:
        logger.warning(
            "tmux_window_resize_failed", session=session_name, cols=cols, rows=rows
        )

    return success
