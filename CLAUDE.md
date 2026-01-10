# CLAUDE.md

SummitFlow Terminal - Standalone web terminal service with tmux-backed persistent sessions.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start services | `bash ~/terminal/scripts/start.sh` |
| Restart services | `bash ~/terminal/scripts/restart.sh` |
| Stop services | `bash ~/terminal/scripts/shutdown.sh` |
| Check status | `bash ~/terminal/scripts/status.sh` |
| View backend logs | `journalctl --user -u summitflow-terminal -f` |
| View frontend logs | `journalctl --user -u summitflow-terminal-frontend -f` |

---

## URLs

| Service | URL |
|---------|-----|
| Production Frontend | https://terminal.summitflow.dev |
| Production API | https://terminalapi.summitflow.dev |
| Local Frontend | http://localhost:3002 |
| Local API | http://localhost:8002 |

**Note:** Production URLs require Cloudflare Access auth. See `~/.claude/rules/cloudflare-access.md`.

---

## Architecture

```
terminal/
├── terminal/           # Backend (FastAPI, port 8002)
│   ├── api/            # REST and WebSocket endpoints
│   │   ├── terminal.py # WebSocket: /ws/terminal/{session_id}
│   │   └── sessions.py # REST: /api/terminal/sessions
│   ├── services/       # Business logic
│   │   └── lifecycle.py
│   ├── storage/        # Database access
│   │   ├── connection.py
│   │   └── terminal.py
│   ├── config.py       # Configuration
│   ├── main.py         # FastAPI app
│   └── __main__.py     # Entry point
├── frontend/           # Frontend (Next.js, port 3002)
│   ├── app/            # Next.js pages
│   ├── components/     # React components
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   ├── TerminalTabs.tsx  # Tab management
│   │   └── keyboard/         # Mobile keyboard
│   └── lib/hooks/      # React hooks
├── scripts/            # Service control
├── .venv/              # Python virtual environment
└── pyproject.toml      # Python dependencies
```

---

## Service Management

Services run via `systemctl --user` (user-mode systemd).

```bash
# Check status
systemctl --user status summitflow-terminal
systemctl --user status summitflow-terminal-frontend

# Manual control
systemctl --user start summitflow-terminal
systemctl --user restart summitflow-terminal-frontend
```

---

## Environment & Database

**Environment file:** `~/.env.local` (global, not project-specific)
- Contains `DATABASE_URL` and other shared config
- Loaded by systemd services via `EnvironmentFile=-%h/.env.local`

**Database:** PostgreSQL `summitflow` (shared across projects)
- Connection: `postgresql://summitflow_app:<password>@localhost:5432/summitflow`
- Direct query: `source ~/.env.local && psql $DATABASE_URL`

---

## Development

### Backend

```bash
cd ~/terminal
source .venv/bin/activate
python -m terminal  # Runs on port 8002
```

### Frontend

```bash
cd ~/terminal/frontend
npm run dev  # Dev server on port 3002
npm run build && npm start  # Production build
```

---

## Database

Uses shared PostgreSQL database: `summitflow`

Table: `terminal_sessions`
- `id` (UUID) - Session identifier
- `name` - Display name
- `project_id` - Associated project
- `working_dir` - Starting directory
- `is_alive` - Session status
- `created_at`, `last_accessed_at` - Timestamps

---

## API Endpoints

### REST

- `GET /health` - Health check
- `GET /api/terminal/sessions` - List sessions
- `POST /api/terminal/sessions` - Create session
- `GET /api/terminal/sessions/{id}` - Get session
- `PATCH /api/terminal/sessions/{id}` - Update session
- `DELETE /api/terminal/sessions/{id}` - Delete session

### WebSocket

- `/ws/terminal/{session_id}` - Terminal I/O
  - Text messages: Input to terminal
  - Binary `r` prefix: Resize `{cols, rows}`
  - Server sends output as text

---

## Key Features

- **Persistent sessions** - tmux-backed, survives browser disconnects
- **Multi-tab interface** - Multiple terminals in split panes
- **Mobile support** - On-screen keyboard for touch devices
- **Project context** - Opens in project directory via `?project=` param

---

## Anti-Patterns

| Don't | Why | Do Instead |
|-------|-----|------------|
| Hardcode session UUIDs in tests | Tests become brittle, fail on different environments | Use fixtures or generate IDs dynamically |
| Use setTimeout for WebSocket timing | Race conditions, flaky tests | Use event listeners with timeout fallbacks |
| Direct PTY reads during tmux operations | tmux buffers interfere with reads | Use `tmux capture-pane -p` for reliable output |
| Mix tmux and direct terminal I/O | Conflicting buffer states cause corruption | Pick one approach per test/feature |
| Skip wheelCleanup/touchCleanup | Event listeners leak, memory grows | Always call before dispose() |
| Assume session is alive after create | Session may fail to start | Poll status or use health check endpoint |
| Non-blocking waitpid after SIGKILL | Creates zombie processes | Use retry loop with asyncio.sleep() |
| Query one session per mode for cleanup | Leaves orphaned duplicate sessions | Use get_all_project_sessions() |

---

**Version**: 1.0.0 | **Updated**: 2026-01-08
