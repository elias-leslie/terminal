# WebSocket Protocol

## Message Types

| Direction | Type | Format |
|-----------|------|--------|
| Client → Server | Text input | Raw text |
| Client → Server | Resize | Binary `r` prefix + cols/rows |
| Server → Client | Terminal output | Raw text |
| Both | Ping/Pong | WebSocket standard |

## Connection States

```
connecting → connected → (disconnected | error | session_dead | timeout)
                ↓
           reconnecting
```

## Reconnection Strategy

1. Immediate retry on disconnect
2. Exponential backoff: 1s, 2s, 4s, 8s (max 30s)
3. Max retries: 10
4. Show user notification after 3 failures

## Session Lifecycle

| Event | Action |
|-------|--------|
| Connect | Create/resume tmux session |
| Disconnect | Keep tmux session alive |
| Timeout (30min) | Mark session stale, allow reconnect |
| Explicit close | Kill tmux session |

## Error Handling

| Error | Response |
|-------|----------|
| Session not found | Create new session |
| Tmux crash | Show error, offer restart |
| Network error | Auto-reconnect with backoff |
