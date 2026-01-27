"""Terminal session lifecycle management facade.

Re-exports all lifecycle functions from specialized modules for backward compatibility.
Import from here to get all lifecycle operations in one place.

Submodules:
- lifecycle_core: Single-session atomic operations
- lifecycle_batch: Multi-session batch operations
- lifecycle_reconcile: Startup reconciliation
"""

from __future__ import annotations

# Re-export TmuxError for convenience
from ..utils.tmux import TmuxError  # noqa: F401

# Batch multi-session operations
from .lifecycle_batch import (
    disable_project_terminal,
    reset_all_sessions,
    reset_project_sessions,
    reset_session,
)

# Core single-session operations
from .lifecycle_core import (
    create_session,
    delete_session,
    ensure_session_alive,
)

# Startup reconciliation
from .lifecycle_reconcile import reconcile_on_startup

__all__ = [
    "create_session",
    "delete_session",
    "disable_project_terminal",
    "ensure_session_alive",
    "reconcile_on_startup",
    "reset_all_sessions",
    "reset_project_sessions",
    "reset_session",
]
