"""Terminal constants - shared across services, storage, and APIs.

This module defines the canonical list of session modes and related type aliases.
Use these definitions instead of hardcoding mode strings or type hints.
"""

from typing import Literal

# List of valid session modes
SESSION_MODES = ["shell", "claude"]

# Type alias for session mode parameter annotations
SessionMode = Literal["shell", "claude"]
