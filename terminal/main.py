"""Terminal Service - FastAPI Application.

Independent microservice for web terminal functionality.
Runs on port 8002, separate from main SummitFlow backend.
"""

import subprocess
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import sessions, terminal
from .config import CORS_ORIGINS, TERMINAL_PORT
from .logging_config import get_logger
from .services import lifecycle

logger = get_logger(__name__)


def _setup_tmux_options() -> None:
    """Set up tmux options and hooks for terminal service.

    Configures:
    - detach-on-destroy off: When a session ends, switch to another instead of showing [exited]
    - client-session-changed hook: Notify backend when sessions switch
    """
    # When a session is destroyed, switch to another session instead of detaching
    # This makes /exit in Claude Code seamlessly return to the base terminal
    subprocess.run(
        ["tmux", "set-option", "-g", "detach-on-destroy", "off"],
        capture_output=True,
    )

    # The hook calls our internal endpoint with from/to session info
    # We run curl in background (&) to not block tmux
    hook_cmd = (
        f'run-shell "curl -s \'http://localhost:{TERMINAL_PORT}/api/internal/session-switch'
        '?from=#{client_last_session}&to=#{client_session}\' >/dev/null 2>&1 &"'
    )

    # Set global hook (applies to all sessions)
    result = subprocess.run(
        ["tmux", "set-hook", "-g", "client-session-changed", hook_cmd],
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        logger.info("tmux_options_configured")
    else:
        # tmux might not be running yet - that's OK
        logger.warning("tmux_setup_failed", error=result.stderr.strip())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler."""
    # Startup: reconcile DB with tmux state
    logger.info("terminal_service_starting", port=TERMINAL_PORT)
    try:
        stats = lifecycle.reconcile_on_startup()
        logger.info("startup_reconciliation_complete", **stats)
    except Exception as e:
        logger.error("startup_reconciliation_failed", error=str(e))

    # Set up tmux options and hooks
    _setup_tmux_options()

    yield

    # Shutdown
    logger.info("terminal_service_stopping")


app = FastAPI(
    title="SummitFlow Terminal",
    description="Web terminal service for SummitFlow",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(terminal.router)
app.include_router(sessions.router)


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "service": "terminal"}


def main() -> None:
    """Run the terminal service."""
    uvicorn.run(
        "terminal.main:app",
        host="0.0.0.0",
        port=TERMINAL_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
