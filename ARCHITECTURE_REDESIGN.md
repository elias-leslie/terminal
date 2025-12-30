# Terminal Tabs Architecture Redesign

## Problem Summary

The terminal tabs system has fundamental state management issues:

1. **Tab highlighting broken** - Multiple tabs can appear active, none on refresh
2. **Mode switching unreliable** - Claude sometimes doesn't start, duplicates sent
3. **Reset has race conditions** - Blank terminals, no tab highlighted after reset
4. **Claude auto-start fragile** - String matching causes false positives/negatives
5. **State split across 5+ locations** - No single source of truth

## Root Causes

1. `setActiveId` called from 6+ locations without coordination
2. `setActiveId` races with `invalidateQueries` - UI shows new ID before data arrives
3. Project reset lacks optimistic update (ad-hoc reset has it)
4. String-based Claude detection (`"Claude Code v"`, `"[Opus"`) is fragile
5. Field name inconsistency: backend `active_mode` vs frontend `terminal_mode`

---

## New Architecture

### Principle 1: Single Source of Truth for Active Session

**Current**: `activeId` is in `useTerminalSessions` hook state, set from many places.

**New**: `activeId` derived from URL + project mode state.

```
activeId = derive(url.searchParams.sessionId, projectSettings.activeMode, sessions)
```

**Logic**:
1. If URL has `?session=<id>`, that session is active (for deep links)
2. Else, if a project is selected and has a session for its `activeMode`, use that
3. Else, use the first session in the list
4. If no sessions, `activeId = null`

**Benefits**:
- No `setActiveId` calls scattered everywhere
- URL becomes shareable/bookmarkable
- Refresh preserves state via URL

### Principle 2: Atomic Operations with Optimistic Updates

**Current**: Reset does `setActiveId(new)` then `invalidateQueries()` separately.

**New**: All mutations use this pattern:

```typescript
const mutation = useMutation({
  mutationFn: async (params) => {
    return await api.call(params);
  },
  onMutate: async (params) => {
    // 1. Cancel in-flight queries
    await queryClient.cancelQueries({ queryKey: ["terminal-sessions"] });

    // 2. Snapshot current state
    const previous = queryClient.getQueryData(["terminal-sessions"]);

    // 3. Optimistically update cache
    queryClient.setQueryData(["terminal-sessions"], (old) => {
      // Apply the change optimistically
    });

    // 4. Update URL if needed
    router.push(`?session=${newSessionId}`);

    return { previous };
  },
  onError: (err, params, context) => {
    // Rollback on error
    queryClient.setQueryData(["terminal-sessions"], context.previous);
    router.back(); // Restore URL
  },
  onSettled: () => {
    // Refetch to sync with server
    queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
  },
});
```

### Principle 3: Mode as Server State, Not Local State

**Current**: `switchMode` updates local state, then API, then refetch.

**New**: Mode is always derived from server data. UI shows loading state during transition.

```typescript
// The mode is always from the server
const currentMode = projectSettings?.terminal_mode ?? "shell";

// Switching mode is just a mutation
const switchMode = useMutation({
  mutationFn: (mode) => api.setProjectMode(projectId, mode),
  onMutate: async (mode) => {
    // Optimistic update in cache
    queryClient.setQueryData(["terminal-projects"], (old) =>
      old?.map(p => p.id === projectId ? { ...p, terminal_mode: mode } : p)
    );
  },
  // ... rollback on error, refetch on settled
});

// UI derives which session to show from mode
const activeSession = currentMode === "claude"
  ? project.claudeSession
  : project.shellSession;
```

### Principle 4: Claude State Machine (Not String Matching)

**Current**: String matching on tmux pane content for indicators like `"Claude Code v"`.

**New**: Explicit state machine with database tracking.

```python
# Database: terminal_sessions table
claude_state VARCHAR(16) CHECK (
  claude_state IN ('not_started', 'starting', 'running', 'stopped', 'error')
)
```

**State transitions**:
```
not_started → starting (POST /start-claude called)
starting → running (Claude sends ready signal OR timeout + pane check)
starting → error (Command failed)
running → stopped (Exit detected)
stopped → starting (Restart requested)
```

**Detection method**: Instead of fragile string matching:
1. When `/start-claude` is called, set `claude_state = 'starting'`
2. Wait 2 seconds, then verify with ONE check:
   - `tmux capture-pane` for `"╭"` (Claude Code's TUI border character)
   - If found: set `claude_state = 'running'`
   - If not found after 5 seconds: set `claude_state = 'error'`
3. On WebSocket disconnect: Check if Claude exited

**Benefits**:
- Explicit state, not guessed
- Can show "Starting Claude..." in UI
- No duplicate starts (check state, not content)

### Principle 5: Session Creation is Synchronous (From UI Perspective)

**Current**: Click tab → maybe create session → setActiveId → races with refetch.

**New**: Session must exist before switching to it. Use suspense/loading states.

```typescript
const handleTabClick = async (projectId: string) => {
  const session = getOrCreateSession(projectId, currentMode);

  if (session.isCreating) {
    // Show loading state on tab, don't switch yet
    return;
  }

  // Session exists, switch to it
  router.push(`?session=${session.id}`);
};
```

For project tabs that might not have a session:
1. Tab shows "loading" indicator while session is created
2. Only after session exists, update URL to switch
3. Terminal component only renders when session ID is valid

---

## Implementation Plan

### Backend Changes

1. **Add `claude_state` column to `terminal_sessions`**
   - Enum: `not_started`, `starting`, `running`, `stopped`, `error`
   - Default: `not_started`

2. **Refactor `/start-claude` endpoint**
   - Check `claude_state` instead of string matching
   - If `starting` or `running`: return early (no duplicate)
   - Set `claude_state = 'starting'` before sending command
   - Background task verifies startup after 2 seconds

3. **Add `/sessions/{id}/claude-state` GET endpoint**
   - Returns current `claude_state` for UI polling

4. **Normalize field names**
   - Backend always returns `mode` (not `terminal_mode` or `active_mode`)
   - API responses consistent

### Frontend Changes

1. **URL-based active session**
   - Remove `activeId` useState
   - Add `useSearchParams` for `?session=<id>`
   - Derive active session from URL + project mode

2. **Centralized session switching**
   - Single `switchToSession(sessionId)` function
   - Updates URL, triggers no other state changes
   - Components react to URL change via hook

3. **Optimistic updates for all mutations**
   - Create session: Add to cache, update URL
   - Reset session: Replace in cache, update URL
   - Delete session: Remove from cache, update URL if was active
   - Switch mode: Update project cache, switch session

4. **Loading states for async operations**
   - Tab shows spinner during session creation
   - Mode dropdown disabled during switch
   - Reset button disabled during reset

5. **Remove all `setTimeout` hacks**
   - Claude start waits for state transition, not arbitrary delay
   - Session switch waits for data, not timeout

### Component Refactors

1. **TerminalTabs.tsx**
   - Remove `activeId` prop drilling
   - Use URL param hook
   - Derive `isActive` from URL
   - Single `switchToSession` handler

2. **TabModeDropdown.tsx**
   - Disable during mutation
   - Show loading state

3. **Terminal.tsx**
   - Accept `sessionId` prop
   - Don't render if session doesn't exist in cache
   - Show placeholder during session creation

4. **useProjectTerminals.ts**
   - Remove manual session ID management
   - Pure derivation: projects + sessions → projectTerminals

5. **useTerminalSessions.ts**
   - Remove `activeId` state
   - Keep mutations with proper optimistic updates

---

## Migration Strategy

### Phase 1: Backend Stabilization
1. Add `claude_state` column
2. Refactor start-claude with state machine
3. Normalize API response field names

### Phase 2: Frontend Foundation
1. Add URL-based session tracking (parallel to existing)
2. Add centralized `switchToSession` function
3. Keep old code working for comparison

### Phase 3: Component Migration
1. Migrate TerminalTabs to new model
2. Migrate TabModeDropdown
3. Migrate Terminal component
4. Remove old state management code

### Phase 4: Cleanup
1. Remove deprecated hooks/state
2. Remove timing hacks
3. Add integration tests for flows

---

## File Changes Summary

### Backend Files to Modify
- `terminal/storage/schema.py` - Add `claude_state` column
- `terminal/storage/terminal.py` - Add state update methods
- `terminal/api/claude.py` - Refactor with state machine
- `terminal/api/projects.py` - Normalize field names
- `terminal/api/sessions.py` - Include claude_state in responses

### Frontend Files to Modify
- `frontend/app/page.tsx` - URL params handling
- `frontend/lib/hooks/use-terminal-sessions.ts` - Remove activeId state
- `frontend/lib/hooks/use-project-terminals.ts` - Pure derivation
- `frontend/lib/hooks/use-session-switch.ts` - NEW: Centralized switching
- `frontend/components/TerminalTabs.tsx` - Use URL-based active
- `frontend/components/TabModeDropdown.tsx` - Loading states
- `frontend/components/Terminal.tsx` - Existence check before render

### New Files
- `frontend/lib/hooks/use-active-session.ts` - URL + project derivation
- `frontend/lib/hooks/use-claude-state.ts` - Poll claude_state

---

## Success Criteria

1. **Tab highlighting**: Exactly one tab highlighted at all times
2. **Mode switching**: 100% reliable Claude start (no duplicates, no misses)
3. **Reset**: Fresh terminal visible immediately, correct tab highlighted
4. **No timing bugs**: Works regardless of network latency
5. **Shareable URLs**: `?session=<id>` loads correct terminal
6. **Simple code**: Clear data flow, no hacks

---

## Agent Division (Phase 3)

1. **Backend: Claude State Machine** - Add column, refactor detection
2. **Backend: API Normalization** - Consistent field names
3. **Frontend: URL State Hook** - `useActiveSession` implementation
4. **Frontend: Session Switching** - Centralized `switchToSession`
5. **Frontend: TerminalTabs Rewrite** - Use new hooks
6. **Frontend: Mode Dropdown Rewrite** - Loading states, atomic switch
7. **Frontend: Reset Flow** - Proper optimistic updates
8. **Frontend: Terminal Component** - Existence checks
9. **Integration Testing** - End-to-end flow verification
10. **Cleanup** - Remove old code, dead paths
