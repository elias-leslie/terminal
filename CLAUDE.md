# SummitFlow Terminal

Standalone web terminal service with tmux-backed persistent sessions.

**Project context injected via memory system at session start.**

See `~/.claude/CLAUDE.md` for memory API reference.

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
│   └── main.py         # FastAPI app
├── frontend/           # Frontend (Next.js, port 3002)
│   ├── app/            # Next.js pages
│   ├── components/     # React components
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   ├── TerminalTabs.tsx  # Tab management
│   │   └── keyboard/         # Mobile keyboard
│   └── lib/hooks/      # React hooks
└── scripts/            # Service control
```

## Database Schema

Table: `terminal_sessions`
- `id` (UUID) - Session identifier
- `name` - Display name
- `project_id` - Associated project
- `working_dir` - Starting directory
- `is_alive` - Session status
- `created_at`, `last_accessed_at` - Timestamps

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
