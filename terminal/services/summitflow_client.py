"""HTTP client for SummitFlow API.

This module provides async functions to fetch data from the SummitFlow
backend API, primarily for listing projects to populate terminal settings.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

# SummitFlow API base URL - can be overridden via environment
SUMMITFLOW_API_BASE = os.getenv("SUMMITFLOW_API_BASE", "http://localhost:8001/api")


async def list_projects() -> list[dict]:
    """Fetch all projects from SummitFlow API.

    Returns:
        List of project dicts with at least: id, name, root_path
        Returns empty list on connection errors (fails gracefully)
    """
    url = f"{SUMMITFLOW_API_BASE}/projects"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.ConnectError:
        logger.warning("Could not connect to SummitFlow API at %s", url)
        return []
    except httpx.TimeoutException:
        logger.warning("Timeout connecting to SummitFlow API at %s", url)
        return []
    except httpx.HTTPStatusError as e:
        logger.error("SummitFlow API returned error: %s", e.response.status_code)
        return []
    except Exception as e:
        logger.error("Unexpected error fetching projects: %s", e)
        return []
