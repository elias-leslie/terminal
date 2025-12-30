"""Database schema definitions for Terminal Service.

This file documents the database schema and provides initialization functions.
Tables are created in the shared 'summitflow' PostgreSQL database.
"""

# SQL to create terminal_sessions table (existing)
TERMINAL_SESSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    project_id VARCHAR(64),
    working_dir TEXT,
    display_order INTEGER DEFAULT 0,
    mode VARCHAR(16) DEFAULT 'shell' CHECK (mode IN ('shell', 'claude')),
    is_alive BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    last_claude_session VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_alive
    ON terminal_sessions(is_alive) WHERE is_alive = true;
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_project
    ON terminal_sessions(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_sessions_project_mode
    ON terminal_sessions(project_id, mode) WHERE project_id IS NOT NULL;
"""

# SQL to create terminal_project_settings table (new)
TERMINAL_PROJECT_SETTINGS_TABLE = """
CREATE TABLE IF NOT EXISTS terminal_project_settings (
    project_id VARCHAR(64) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    default_mode VARCHAR(16) NOT NULL DEFAULT 'shell'
        CHECK (default_mode IN ('shell', 'claude')),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tps_enabled
    ON terminal_project_settings(enabled) WHERE enabled = true;

COMMENT ON TABLE terminal_project_settings IS 'Terminal settings per SummitFlow project';
"""
