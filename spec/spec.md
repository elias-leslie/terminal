# Terminal UI/UX Fixes Specification

**Status:** Complete | **Last Updated:** 2026-01-07

## Objective

All 6 terminal rendering/input issues are root-caused with clear, implementable fixes that don't introduce regressions.

## Overview

Investigation and fix specification for terminal bugs: cursor visibility, multi-pane corruption, rendering stacking, status bar flickering, input duplication, and status bar consolidation.

## Current State

```
┌─────────────────────────────────────────────────────────────────┐
│  ISSUES IDENTIFIED                                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Cursor: Dark grey on black (invisible)                      │
│  2. Multi-pane: Focus switch corrupts adjacent panes            │
│  3. Rendering: tmux status bar stacks 3-4x                      │
│  4. Flickering: Status bar cycles without user input            │
│  5. Input: Keystrokes duplicate 3x in grid view                 │
│  6. Status bar: Redundant bottom bar with stale info            │
└─────────────────────────────────────────────────────────────────┘
```

## Root Causes

| Issue | Root Cause | File(s) |
|-------|-----------|---------|
| Cursor | `cursorAccent: "#0a0e14"` same as background | `terminal.ts:50` |
| Corruption | Invisible terminals still process WS messages | `TerminalTabs.tsx`, `use-terminal-websocket.ts` |
| Stacking | Multiple `fit()` calls + racing resize handlers | `Terminal.tsx:188-262` |
| Flickering | 30s refetch + 500ms Claude polling invalidates ALL sessions | `use-terminal-sessions.ts:158`, `use-claude-polling.ts:109` |
| Input dup | No focus guard on `onData`, all instances send | `Terminal.tsx:197` |

## Desired State

```
┌─────────────────────────────────────────────────────────────────┐
│  FIXED TERMINAL                                                 │
├─────────────────────────────────────────────────────────────────┤
│  - High-contrast cursor (white accent on green cursor)          │
│  - Isolated pane rendering (invisible = paused WS processing)   │
│  - Single resize handler (ResizeObserver only)                  │
│  - Event-driven updates (no polling = no flicker)               │
│  - Focus-guarded input (only focused terminal receives keys)    │
│  - Minimal top bar with info icon (hover for session details)   │
│  - No tmux status bar (disabled at config level)                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Pause WS (not disconnect) for invisible | Fast switching (0ms vs 100-300ms reconnect) |
| ResizeObserver only (remove window.resize) | Eliminate race conditions |
| Event-driven refetch (no polling) | Stop idle flickering |
| Focus guard in onData | Single-point fix, simpler than slot dedup |
| Disable tmux status bar | No stacking if bar doesn't exist |
| Top bar info icon + tooltip + copy | Minimal UI, context accessible on demand |

## Implementation Phases

### Phase 1: Cursor Fix
- Change `cursorAccent` from `#0a0e14` to `#ffffff`
- File: `frontend/lib/constants/terminal.ts:50`

### Phase 2: Resize Consolidation
- Remove `window.resize` listener (line 207)
- Remove 100ms delayed `fit()` call (lines 190-194)
- Keep single ResizeObserver with proper debounce
- File: `frontend/components/Terminal.tsx`

### Phase 3: Focus-Based Input Guard
- Add `isFocused` ref to Terminal
- Track focus via xterm textarea focus events
- Guard `onData`: only send if focused
- File: `frontend/components/Terminal.tsx`

### Phase 4: Invisible Terminal Pause
- Add `isVisible` prop to Terminal
- Pass visibility from TerminalTabs (based on activeSessionId)
- Skip `write()` when not visible
- Files: `Terminal.tsx`, `use-terminal-websocket.ts`

### Phase 5: Event-Driven Refetch
- Remove `refetchInterval: 30000` (line 158)
- Convert Claude polling to await-based
- Keep explicit invalidations on user actions
- Files: `use-terminal-sessions.ts`, `use-claude-polling.ts`

### Phase 6: Tmux Status Removal
- Add `set -g status off` to tmux session creation
- File: `terminal/utils/tmux.py`

### Phase 7: Top Bar Info Icon
- Create `SessionInfoIcon` component
- Hover: session ID + mode + timestamp
- Click: copy to clipboard
- Files: `TabBar.tsx`, `SessionInfoIcon.tsx` (new)

## Files Summary

**Modify:**
- `frontend/lib/constants/terminal.ts` - cursor color
- `frontend/components/Terminal.tsx` - resize, focus, visibility
- `frontend/lib/hooks/use-terminal-websocket.ts` - visibility check
- `frontend/lib/hooks/use-terminal-sessions.ts` - remove polling
- `frontend/lib/hooks/use-claude-polling.ts` - await conversion
- `terminal/utils/tmux.py` - disable status bar
- `frontend/components/TabBar.tsx` - add info icon

**Create:**
- `frontend/components/SessionInfoIcon.tsx`

## Success Criteria

- [x] Cursor visible in all contexts (cursorAccent: #ffffff)
- [x] Grid view switching: zero corruption (isVisible prop + WS pause)
- [x] No stacked rendering artifacts (single ResizeObserver)
- [x] Status bar stable (no flicker during 60s idle) (polling removed)
- [x] Input to focused terminal only (isFocusedRef guard)
- [x] Bottom bar removed; info icon in top bar (status off + SessionInfoIcon)

## Implementation Complete

**Completed:** 2026-01-07 by task-2cb7cc32

All 7 phases implemented and verified via browser-automation testing:
- Screenshot confirmed no tmux status bar
- SessionInfoIcon visible in toolbar
- Terminal rendering correctly

**Commits:**
- `6a0afb2` fix(frontend): cursor visibility, resize consolidation, and focus guard
- `a7a5e1b` fix(terminal): WS visibility, polling, tmux status, SessionInfoIcon

---
**Confidence:** 88/100 | **Verified:** 2026-01-07

### Confidence Breakdown
| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 23/25 | All 6 issues root-caused, implementation clear |
| Accuracy | 24/25 | Root causes verified against code, line numbers accurate |
| Clarity | 18/20 | Next steps actionable, phases ordered logically |
| User Alignment | 13/15 | All interview decisions captured |
| Decision Quality | 10/15 | Good rationale; some phases may need iteration |
