"""Shared utilities for terminal storage layer."""

from __future__ import annotations

from uuid import UUID

# Type alias for session ID (accepts both str and UUID)
SessionId = str | UUID


def _to_str(session_id: SessionId) -> str:
    """Normalize session ID to string for SQL queries."""
    return str(session_id)


__all__ = ["SessionId", "_to_str"]
