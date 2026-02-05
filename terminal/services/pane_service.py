"""Business logic for terminal pane operations."""

from __future__ import annotations

from typing import Any

from ..storage import pane_crud


def get_update_fields(
    pane_name: str | None = None, active_mode: str | None = None
) -> dict[str, Any]:
    """Build update fields dict from optional parameters."""
    fields: dict[str, Any] = {}
    if pane_name is not None:
        fields["pane_name"] = pane_name
    if active_mode is not None:
        fields["active_mode"] = active_mode
    return fields


def get_layout_update_fields(
    width_percent: float | None = None,
    height_percent: float | None = None,
    grid_row: int | None = None,
    grid_col: int | None = None,
) -> dict[str, Any]:
    """Build layout update fields dict from optional parameters."""
    fields: dict[str, Any] = {}
    if width_percent is not None:
        fields["width_percent"] = width_percent
    if height_percent is not None:
        fields["height_percent"] = height_percent
    if grid_row is not None:
        fields["grid_row"] = grid_row
    if grid_col is not None:
        fields["grid_col"] = grid_col
    return fields


def convert_layout_items_to_storage(layouts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert layout items from API format to storage format."""
    return [
        {
            "pane_id": item["pane_id"],
            "width_percent": item.get("width_percent"),
            "height_percent": item.get("height_percent"),
            "grid_row": item.get("grid_row"),
            "grid_col": item.get("grid_col"),
        }
        for item in layouts
    ]


async def update_layouts_with_retry(
    layouts_data: list[dict[str, Any]], max_retries: int = 3
) -> None:
    """Update pane layouts with retry logic for database contention."""
    import asyncio

    for attempt in range(max_retries):
        try:
            pane_crud.update_pane_layouts(layouts_data)
            return
        except Exception as e:
            if attempt == max_retries - 1:
                raise RuntimeError(
                    f"Failed to update layouts after {max_retries} attempts: {e}"
                ) from e
            await asyncio.sleep(0.1 * (attempt + 1))
