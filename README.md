# SummitFlow Terminal

Standalone web terminal service with tmux-backed persistent sessions.

## Features

- **Persistent sessions** - tmux-backed terminals survive browser disconnects
- **Multi-tab interface** - Multiple terminals with split pane support
- **Mobile keyboard** - On-screen keyboard for touch devices
- **Project context** - Open terminals in specific project directories

## Architecture

- **Backend**: FastAPI (Python) on port 8002
- **Frontend**: Next.js with xterm.js on port 3002
- **Session management**: tmux for terminal persistence
- **Database**: PostgreSQL (shared with SummitFlow)

## Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL
- tmux

### Backend

```bash
cd terminal
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

### Environment

Create `~/.env.local` with:
```
DATABASE_URL=postgresql://user:pass@localhost/summitflow
```

## Running

### Development

```bash
# Backend
source .venv/bin/activate
python -m terminal

# Frontend
cd frontend
npm run dev
```

### Production (systemd)

```bash
bash scripts/start.sh    # Start services
bash scripts/status.sh   # Check status
bash scripts/restart.sh  # Restart services
bash scripts/shutdown.sh # Stop services
```

## API

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/terminal/sessions` | List sessions |
| POST | `/api/terminal/sessions` | Create session |
| GET | `/api/terminal/sessions/{id}` | Get session |
| PATCH | `/api/terminal/sessions/{id}` | Update session |
| DELETE | `/api/terminal/sessions/{id}` | Delete session |

### WebSocket

- `/ws/terminal/{session_id}` - Terminal I/O stream

## License

MIT
