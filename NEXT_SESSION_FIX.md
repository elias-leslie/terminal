# Terminal UI Fix - Complete Implementation Required

## CRITICAL CONSTRAINT: Max 8 Sessions

**Session Isolation**: Sessions are already isolated via `summitflow-` prefix (see `terminal/utils/tmux.py:90`)
- `get_tmux_session_name(session_id)` returns `f"summitflow-{session_id}"`
- `list_tmux_sessions()` only returns sessions with `summitflow-` prefix
- Other tmux sessions (mobaxterm, manual tmux, etc.) are NOT affected

**Session Limit**: Currently NO limit exists. Need to add:
- `MAX_SESSIONS = 8` for the terminal solution
- Frontend must check before allowing new session creation
- Backend must enforce limit and return error if exceeded
- UI should disable + button and show "Maximum 8 terminals" when at limit

### Files to Add Session Limit

**Frontend:**
- `lib/constants/terminal.ts` - Add `MAX_TERMINAL_SESSIONS = 8`
- `lib/hooks/use-terminal-tabs-state.ts` - Check `sessions.length < MAX_TERMINAL_SESSIONS`
- `components/UnifiedTerminalHeader.tsx` - Update tooltip "Maximum 8 terminals"
- `components/TerminalManagerModal.tsx` - Show warning when at limit

**Backend:**
- `terminal/config.py` - Add `MAX_TERMINAL_SESSIONS = 8`
- `terminal/api/sessions.py` - Check limit before creating, return 429 Too Many Requests
- `terminal/services/lifecycle.py` - Enforce limit in create_session()

---

## Current Architecture Problems

### Problem 1: Slot Architecture
**Current behavior:**
- `terminalSlots` = ONE slot per ENABLED project + ONE slot per ad-hoc session
- Clicking + and selecting "SummitFlow" creates a session WITH `project_id=summitflow`
- But since SummitFlow project ALREADY has a slot, NO NEW PANE is added
- The new session just gets added to SummitFlow's session collection
- User sees no visual change in split/grid mode

**Expected behavior:**
- Click + -> Select project -> NEW PANE appears
- Each session should be its own slot
- Multiple panes can show the same project

**Root cause in code:**
```typescript
// use-terminal-tabs-state.ts - terminalSlots derivation
const terminalSlots: TerminalSlot[] = useMemo(() => {
  const slots: TerminalSlot[] = [];

  // ONE slot per project (not per session!)
  for (const pt of projectTerminals) {
    slots.push({
      type: "project",
      projectId: pt.projectId,
      // ...
    });
  }

  // ONE slot per ad-hoc session
  for (const session of adHocSessions) {
    slots.push({
      type: "adhoc",
      sessionId: session.id,
      // ...
    });
  }

  return slots;
}, [projectTerminals, adHocSessions]);
```

### Problem 2: Dropdown Shows Projects, Not Sessions
**Current behavior:**
- `TerminalSwitcher` shows ONE entry per project
- If SummitFlow has 5 sessions, dropdown shows just "SummitFlow"
- No way to see/select individual sessions

**Expected behavior:**
- Dropdown shows ALL sessions individually
- Each session is selectable
- Sessions grouped by project for organization

### Problem 3: GlobalActionMenu Missing in Split/Grid
**Current behavior:**
- `TerminalHeader` (single mode) has `GlobalActionMenu` (reset all / close all)
- `UnifiedTerminalHeader` (split/grid pane headers) does NOT have it

**Expected behavior:**
- All view modes should have access to reset all / close all

---

## Files That Need Changes

### 1. `frontend/lib/utils/slot.ts`
Change `TerminalSlot` to be session-based, not project-based:
```typescript
// NEW: Each slot is ONE session
export interface SessionSlot {
  sessionId: string;
  sessionName: string;
  projectId: string | null;  // null for ad-hoc
  projectName: string | null;
  workingDir: string | null;
  mode: "shell" | "claude";
  claudeState?: string;
}
```

### 2. `frontend/lib/hooks/use-terminal-tabs-state.ts`
Change `terminalSlots` derivation to create one slot per SESSION:
```typescript
const terminalSlots = useMemo(() => {
  return sessions.map(session => ({
    sessionId: session.id,
    sessionName: session.name,
    projectId: session.project_id,
    projectName: /* lookup from projects */,
    workingDir: session.working_dir,
    mode: session.mode,
    claudeState: session.claude_state,
  }));
}, [sessions]);
```

### 3. `frontend/components/TerminalSwitcher.tsx`
Show ALL sessions, not just projects:
```typescript
// Show individual sessions grouped by project
{projectSessions.map(session => (
  <SessionItem
    key={session.id}
    session={session}
    projectName={getProjectName(session.project_id)}
    isSelected={session.id === currentSessionId}
    onClick={() => onSelectSession(session.id)}
  />
))}
{adHocSessions.map(session => (
  <SessionItem
    key={session.id}
    session={session}
    isSelected={session.id === currentSessionId}
    onClick={() => onSelectSession(session.id)}
  />
))}
```

### 4. `frontend/components/UnifiedTerminalHeader.tsx`
Add GlobalActionMenu:
```typescript
// Add to props
onResetAll?: () => void;
onCloseAll?: () => void;

// Add to component JSX (before Settings)
{onResetAll && onCloseAll && (
  <GlobalActionMenu
    onResetAll={onResetAll}
    onCloseAll={onCloseAll}
    isMobile={isMobile}
  />
)}
```

### 5. `frontend/components/GridLayout.tsx`
Pass reset/close handlers to cells:
```typescript
// Add to GridLayoutProps
onResetAll?: () => void;
onCloseAll?: () => void;

// Pass to GridCell
<GridCell
  // ...existing props
  onResetAll={onResetAll}
  onCloseAll={onCloseAll}
/>
```

### 6. `frontend/components/GridCell.tsx`
Pass reset/close to UnifiedTerminalHeader:
```typescript
<UnifiedTerminalHeader
  // ...existing props
  onResetAll={onResetAll}
  onCloseAll={onCloseAll}
/>
```

### 7. `frontend/components/SplitPane.tsx`
Same as GridCell - pass reset/close handlers.

### 8. `frontend/components/TerminalLayoutRenderer.tsx`
Pass reset/close handlers through to GridLayout and SplitPane.

### 9. `frontend/components/TerminalTabs.tsx`
Pass reset/close handlers to TerminalLayoutRenderer:
```typescript
<TerminalLayoutRenderer
  // ...existing props
  onResetAll={resetAll}
  onCloseAll={handleCloseAll}
/>
```

---

## Test Cases (MUST ALL PASS)

### Session Limit (MAX 8)
1. [ ] Can create up to 8 terminal sessions
2. [ ] At 8 sessions: + button disabled with tooltip "Maximum 8 terminals"
3. [ ] At 8 sessions: Modal shows warning "Session limit reached"
4. [ ] Backend returns 429 error if trying to create 9th session
5. [ ] Closing a session allows creating a new one (back under limit)
6. [ ] Session count only includes `summitflow-*` sessions (not other tmux)

### Single Pane Mode
1. [ ] + button visible in header
2. [ ] Click + -> Modal opens
3. [ ] Click project -> NEW session created AND visible in dropdown
4. [ ] Dropdown shows ALL sessions individually (not grouped by project)
5. [ ] Can switch between sessions via dropdown
6. [ ] GlobalActionMenu (kebab) visible with Reset All / Close All

### Split Mode (Horizontal/Vertical)
1. [ ] + button visible in EACH pane header
2. [ ] Click + in any pane -> Modal opens
3. [ ] Click project -> NEW PANE added with new session
4. [ ] Each pane has its own dropdown showing all sessions
5. [ ] Can select different sessions for each pane
6. [ ] GlobalActionMenu (kebab) visible in EACH pane header
7. [ ] Layout selector works from any pane
8. [ ] Settings accessible from any pane
9. [ ] Empty split view shows header with controls

### Grid Mode (2x2, 3x3, 4x4)
1. [ ] + button visible in EACH cell header
2. [ ] Click + in any cell -> Modal opens
3. [ ] Click project -> NEW cell filled with new session
4. [ ] Each cell has its own dropdown
5. [ ] GlobalActionMenu (kebab) visible in EACH cell header
6. [ ] Empty cells have headers with layout/settings controls
7. [ ] Drag-and-drop reordering works

### Modal Behavior
1. [ ] Shows all projects with session counts
2. [ ] Clicking project creates NEW session (not just switch)
3. [ ] "New Terminal" creates ad-hoc session
4. [ ] Modal closes after selection
5. [ ] Shows session limit warning when at max (8)

---

## Command to Run

```bash
cd ~/terminal && claude --dangerously-skip-permissions "Fix terminal pane architecture - READ ~/terminal/NEXT_SESSION_FIX.md FIRST for full details:

## REQUIREMENTS:

1. MAX 8 SESSIONS LIMIT (CRITICAL)
   - Add MAX_TERMINAL_SESSIONS = 8 constant
   - Frontend: disable + button at limit, show tooltip
   - Backend: return 429 if limit exceeded
   - Sessions are isolated via summitflow- prefix (already done)
   - Files: frontend/lib/constants/terminal.ts, terminal/config.py, terminal/api/sessions.py

2. CHANGE SLOT ARCHITECTURE (CRITICAL)
   - Current: ONE slot per PROJECT (broken)
   - Fix: ONE slot per SESSION
   - Click + must ADD NEW PANE, not just switch
   - Files: lib/utils/slot.ts, lib/hooks/use-terminal-tabs-state.ts

3. UPDATE DROPDOWN
   - Show ALL sessions individually (not grouped by project)
   - Each session selectable
   - Files: components/TerminalSwitcher.tsx

4. ADD GLOBALMENU TO ALL MODES
   - Reset All / Close All currently only in single mode
   - Add to UnifiedTerminalHeader for split/grid
   - Files: UnifiedTerminalHeader.tsx, GridLayout.tsx, GridCell.tsx, SplitPane.tsx, TerminalLayoutRenderer.tsx, TerminalTabs.tsx

5. TEST EVERYTHING
   - All 28 test cases in NEXT_SESSION_FIX.md must pass
   - Test single, split (h/v), grid (2x2, 3x3, 4x4)
   - Test session limit enforcement
   - Test locally AND via Cloudflare production

Do NOT give partial implementations. Complete ALL requirements. Verify ALL test cases."
```

---

## Architecture Diagram

```
CURRENT (BROKEN):
┌─────────────────────────────────────────────────────────┐
│ projectTerminals (ONE slot per project)                 │
│   - SummitFlow slot (contains 5 sessions internally)    │
│   - Terminal slot (contains 3 sessions internally)      │
├─────────────────────────────────────────────────────────┤
│ adHocSessions (ONE slot per session)                    │
│   - Terminal 1 slot                                     │
│   - Terminal 2 slot                                     │
└─────────────────────────────────────────────────────────┘
Result: 2 project slots + 2 ad-hoc slots = 4 max visible panes
Click + on SummitFlow = adds session to SummitFlow slot (no new pane)

EXPECTED (FIXED):
┌─────────────────────────────────────────────────────────┐
│ ALL sessions as individual slots                        │
│   - SummitFlow Shell #1                                 │
│   - SummitFlow Shell #2                                 │
│   - SummitFlow Claude #1                                │
│   - Terminal Shell #1                                   │
│   - Terminal 1 (ad-hoc)                                 │
│   - Terminal 2 (ad-hoc)                                 │
└─────────────────────────────────────────────────────────┘
Result: Each session = 1 slot = 1 possible pane
Click + on SummitFlow = creates new session = new pane
```
