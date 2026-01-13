# Testing

## Backend (pytest)

```bash
cd backend && python -m pytest tests/ -v
```

| Directory | Purpose |
|-----------|---------|
| `tests/unit/` | Storage, services, utilities |
| `tests/integration/` | API endpoints, WebSocket |

**Fixtures:** Use `@pytest.fixture` for database connections, mock tmux sessions.

**Async tests:** Use `@pytest.mark.asyncio` for async functions.

## Frontend (vitest)

```bash
cd frontend && npm test
```

| Pattern | Use |
|---------|-----|
| `*.test.ts` | Unit tests |
| `*.test.tsx` | Component tests |

## WebSocket Testing

Mock WebSocket connections for terminal I/O tests:
- Test message types: text input, resize, ping/pong
- Test reconnection behavior
- Test session timeout handling
