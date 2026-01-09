# Terminal Pane Architecture Refactor

**Created:** 2026-01-09
**Status:** IN_PROGRESS
**SummitFlow Task:** task-765f0220
**Resume Command:**
```bash
cd ~/terminal && claude "Resume terminal pane architecture refactor. Read /home/kasadis/terminal/.claude/session-state/pane-architecture-refactor.md for current state and continue from the next incomplete task."
```

---

## Acceptance Criteria (MUST ALL PASS before task complete)

| ID | Criterion | Verified |
|----|-----------|----------|
| AC-01 | **Pane Limit**: Maximum 4 panes can exist; [+] button disabled at limit with tooltip "Maximum 4 terminals. Close one to add more." | [ ] |
| AC-02 | **Project Pane Structure**: Each project pane contains exactly 2 sessions (1 shell, 1 claude); mode toggle [Shell]/[Claude] visible and switches between them | [ ] |
| AC-03 | **Ad-Hoc Pane Structure**: Each ad-hoc pane contains exactly 1 session (shell only); no mode toggle visible | [ ] |
| AC-04 | **Project Pane Naming**: First pane shows project name (e.g., "SummitFlow"); subsequent panes show badge ("SummitFlow [2]", "SummitFlow [3]") | [ ] |
| AC-05 | **Ad-Hoc Pane Naming**: First pane shows "Ad-Hoc Terminal"; subsequent panes show badge ("Ad-Hoc Terminal [2]", etc.) | [ ] |
| AC-06 | **Multiple Same-Project Panes**: Can create up to 4 panes for the same project (subject to total 4-pane limit) | [ ] |
| AC-07 | **Dropdown Swap (Split/Grid)**: In split or grid mode, selecting a different pane from dropdown SWAPS positions between current and selected pane | [ ] |
| AC-08 | **Dropdown Switch (Single)**: In single mode, selecting a different pane from dropdown switches view to that pane (no swap) | [ ] |
| AC-09 | **Drag-and-Drop Swap**: Dragging panes in grid mode swaps their positions; uses same mechanism as dropdown swap; instant (no animation) | [ ] |
| AC-10 | **Reset Scope**: Reset button resets ONLY the currently visible session (shell OR claude); other session in pane unaffected | [ ] |
| AC-11 | **Close Scope**: Close (X) button removes entire pane AND all attached sessions (both shell and claude for project panes) | [ ] |
| AC-12 | **Reset All / Close All**: Both require confirmation dialog before executing; affect ALL panes and their sessions | [ ] |
| AC-13 | **Layout Modes**: Only single, horizontal split, vertical split, and grid-2x2 available; grid-3x3 and grid-4x4 do NOT exist | [ ] |
| AC-14 | **Empty State**: When 0 panes exist, auto-creates one ad-hoc pane; works in single, split, AND grid view modes | [ ] |
| AC-15 | **DB Persistence**: Panes stored in terminal_panes table; page refresh preserves exact layout; layout syncs across browser tabs and devices | [ ] |

### Verification Method
Each criterion must be verified by UI/UX testing on BOTH environments:

**Environment 1: Local Development**
- URL: http://localhost:3002
- Must pass ALL 15 criteria

**Environment 2: Production (Cloudflare)**
- URL: https://terminal.summitflow.dev
- Requires Cloudflare Access authentication
- Must pass ALL 15 criteria

**Cross-Device Sync Test (for AC-15)**
- Test on desktop browser (local + production)
- Test on mobile browser (production)
- Verify pane layout syncs between devices

**Verification Checklist**
| ID | Local | Production | Cross-Device |
|----|-------|------------|--------------|
| AC-01 | [ ] | [ ] | n/a |
| AC-02 | [ ] | [ ] | n/a |
| AC-03 | [ ] | [ ] | n/a |
| AC-04 | [ ] | [ ] | n/a |
| AC-05 | [ ] | [ ] | n/a |
| AC-06 | [ ] | [ ] | n/a |
| AC-07 | [ ] | [ ] | n/a |
| AC-08 | [ ] | [ ] | n/a |
| AC-09 | [ ] | [ ] | n/a |
| AC-10 | [ ] | [ ] | n/a |
| AC-11 | [ ] | [ ] | n/a |
| AC-12 | [ ] | [ ] | n/a |
| AC-13 | [ ] | [ ] | n/a |
| AC-14 | [ ] | [ ] | n/a |
| AC-15 | [ ] | [ ] | [ ] |

**Task is NOT complete until all checkboxes are marked [x]**

---

## Requirements (IMMUTABLE - from user discussion)

### Core Architecture
- **Max 4 PANES** (not sessions - panes are the unit)
- **Project pane** = 2 sessions bundled (shell + claude, toggled via [Shell]/[Claude] buttons)
- **Ad-hoc pane** = 1 session only (shell, no toggle)
- **Session math:**
  - 4 project panes = 8 sessions max
  - 4 ad-hoc panes = 4 sessions min
  - Mix depends on composition

### Naming Convention
- Project panes: "SummitFlow", "SummitFlow [2]", "SummitFlow [3]", "SummitFlow [4]"
- Ad-hoc panes: "Ad-Hoc Terminal", "Ad-Hoc Terminal [2]", "Ad-Hoc Terminal [3]", "Ad-Hoc Terminal [4]"
- Multiple panes of same project ARE allowed

### Dropdown Behavior
- **Single mode:** Select which pane to view
- **Split/Grid mode:** Selecting a different pane SWAPS positions (current pane swaps with selected)
- Same mechanism for drag-and-drop swap
- No animation on swap

### Reset/Close Behavior
- **Reset (per-pane):** Resets ONLY the visible session (shell OR claude, whichever showing)
- **Close (X button):** Removes ENTIRE pane AND all attached sessions (both shell+claude)
- **Reset All / Close All:** Affects ALL panes, requires confirmation dialog

### Layout Modes
- Single, Horizontal Split, Vertical Split, 2x2 Grid ONLY
- Remove 3x3 and 4x4 grid modes (DONE in task 1)

### At-Limit UX
- When 4 panes exist: Disable [+] button with tooltip "Maximum 4 terminals. Close one to add more."

### Empty State
- Auto-create default ad-hoc pane when 0 panes exist
- Must work in ALL view modes (single, split, grid)

### Persistence (CRITICAL)
- Full DB persistence
- Pane layout syncs across devices/browsers
- Page refresh = same pane layout restored

---

## Database Schema Changes Required

### Current Schema (verified 2026-01-09)

**terminal_sessions:**
- id: uuid (PK, auto-generated)
- name: text (NOT NULL)
- user_id: text (nullable)
- project_id: text (nullable)
- working_dir: text (nullable)
- display_order: integer (default 0)
- is_alive: boolean (default true)
- created_at, last_accessed_at: timestamptz
- last_claude_session: varchar (nullable)
- mode: varchar (default 'shell')
- claude_state: varchar (default 'not_started')
- session_number: integer (default 1)

**terminal_project_settings:**
- project_id: varchar (PK)
- enabled: boolean (default false)
- display_order: integer (default 0)
- created_at, updated_at: timestamptz
- active_mode: varchar (default 'shell')

### Migration Plan (FINAL)

```sql
-- Step 1: Create terminal_panes table
CREATE TABLE terminal_panes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pane_type VARCHAR(10) NOT NULL CHECK (pane_type IN ('project', 'adhoc')),
    project_id VARCHAR(255),  -- NULL for adhoc panes
    pane_order INTEGER NOT NULL DEFAULT 0,
    pane_name VARCHAR(255),  -- e.g., "SummitFlow [2]" or "Ad-Hoc Terminal"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Add pane_id to terminal_sessions
ALTER TABLE terminal_sessions ADD COLUMN pane_id UUID REFERENCES terminal_panes(id) ON DELETE CASCADE;

-- Step 3: Create index
CREATE INDEX idx_terminal_sessions_pane_id ON terminal_sessions(pane_id);
CREATE INDEX idx_terminal_panes_project_id ON terminal_panes(project_id);
CREATE INDEX idx_terminal_panes_order ON terminal_panes(pane_order);

-- Step 4: Migrate existing data (run in Python script for complex logic)
-- See migration script in terminal/storage/migrations/migrate_to_panes.py
```

### Data Migration Logic (Python)

```python
# Pseudocode for migration:
# 1. Get all existing sessions
# 2. Group project sessions by (project_id, mode) - pair shell+claude with same session_number
# 3. For each project session pair:
#    - Create pane with pane_type='project', project_id, pane_name=project_name + badge
#    - Update both sessions to reference this pane_id
# 4. For each ad-hoc session (project_id is NULL):
#    - Create pane with pane_type='adhoc', pane_name=session.name
#    - Update session to reference this pane_id
# 5. Verify all sessions have pane_id set
```

---

## Task Breakdown

### Phase 1: Database & Backend [COMPLETE]

#### 1.1 Database Migration
- [x] Create terminal_panes table
- [x] Add pane_id column to terminal_sessions
- [x] Migrate existing sessions to panes (group by project_id + session pair)
- [x] Add indexes

#### 1.2 Backend Models
- [x] Create Pane model/dataclass (Pydantic models in api/panes.py)
- [x] Update Session model with pane_id (added to storage layer)

#### 1.3 Backend Storage Layer
- [x] Create pane_crud.py (create_pane, get_pane, list_panes, update_pane, delete_pane)
- [x] Update terminal_crud.py to work with pane_id (via pane_crud.create_pane_with_sessions)
- [x] Add pane_order management functions (swap_pane_positions, update_pane_order)

#### 1.4 Backend API Endpoints
- [x] POST /api/terminal/panes - Create pane (atomically creates sessions)
- [x] GET /api/terminal/panes - List panes with sessions
- [x] GET /api/terminal/panes/count - Get pane count and limit status
- [x] DELETE /api/terminal/panes/{id} - Delete pane and all sessions
- [x] PUT /api/terminal/panes/order - Update pane ordering
- [x] POST /api/terminal/panes/swap - Swap two pane positions

### Phase 2: Frontend Data Layer [IN PROGRESS]

#### 2.1 Types & Interfaces
- [x] Create Pane type (in use-terminal-panes.ts: TerminalPane, PaneSession)
- [x] Update slot.ts for pane-based architecture (PaneSlot, paneToSlot, panesToSlots)
- [ ] Update TerminalSession type with pane_id (optional - sessions now accessed via panes)

#### 2.2 API Hooks
- [x] Create use-terminal-panes.ts hook
- [ ] Update use-terminal-sessions.ts for pane awareness (optional - can coexist)
- [ ] Update use-project-terminals.ts to derive from panes (optional - panes replace this)

#### 2.3 State Management
- [ ] Update use-terminal-tabs-state.ts for pane-based slots
- [ ] Update use-slot-ordering.ts to persist to DB (may be unnecessary - panes already ordered)
- [ ] Remove localStorage-based ordering

### Phase 3: Frontend Components [NOT STARTED]

#### 3.1 Slot/Pane Derivation
- [ ] Rewrite terminalSlots derivation (one slot per pane, not per project)
- [ ] Update getSlotPanelId to use pane_id

#### 3.2 Dropdown Swap Behavior
- [ ] Update TerminalSwitcher.tsx with paneId prop
- [ ] Implement swap-on-select for split/grid modes
- [ ] Wire swapPanes to DB persistence

#### 3.3 Reset/Close Handlers
- [ ] Fix handleSlotReset - only visible session
- [ ] Fix handleSlotClose - delete entire pane + all sessions
- [ ] Add confirmation dialogs for Reset All / Close All

#### 3.4 Naming Updates
- [ ] Update ad-hoc naming to "Ad-Hoc Terminal [n]"
- [ ] Ensure project pane naming uses badge correctly

#### 3.5 At-Limit UX
- [ ] Disable [+] button when paneCount >= 4
- [ ] Add tooltip "Maximum 4 terminals. Close one to add more."
- [ ] Update TerminalManagerModal with limit warning

#### 3.6 Empty State Fix
- [ ] Debug auto-create in split/grid modes
- [ ] Ensure works in all layout modes

#### 3.7 GlobalActionMenu in All Modes
- [ ] Ensure kebab menu visible in UnifiedTerminalHeader
- [ ] Wire Reset All / Close All through all layout modes

### Phase 4: UI/UX Polish (frontend-design) [NOT STARTED]

#### 4.1 Pane Header Design
- [ ] Review/update UnifiedTerminalHeader design
- [ ] Mode toggle [Shell]/[Claude] styling
- [ ] Disabled state styling for [+] at limit

#### 4.2 Modal Design
- [ ] Review/update TerminalManagerModal
- [ ] At-limit warning styling
- [ ] Confirmation dialog design for Reset All / Close All

#### 4.3 Swap Animation (none - instant)
- [ ] Verify no animation on swap
- [ ] Ensure instant visual feedback

### Phase 5: Testing & Verification [NOT STARTED]

#### 5.1 Manual Test Cases
- [ ] Grid modes: Only single, split (H/V), 2x2 available
- [ ] Multiple project panes: Can create SummitFlow, SummitFlow [2], etc.
- [ ] Dropdown swap: In split/grid, selecting different pane swaps positions
- [ ] Drag swap: Dragging panes swaps them (same mechanism as dropdown)
- [ ] Reset: Only resets visible session (shell or claude)
- [ ] Close (X): Removes entire pane + all attached sessions
- [ ] Reset All / Close All: Confirmation dialog appears, then affects all panes
- [ ] Ad-hoc naming: Shows "Ad-Hoc Terminal", "Ad-Hoc Terminal [2]"
- [ ] At limit: [+] disabled with tooltip at 4 panes
- [ ] Empty state: Auto-creates in single, split, AND grid modes
- [ ] Persistence: Refresh page, same pane layout restored. Works across devices.

#### 5.2 Cross-Device Test
- [ ] Test on desktop browser
- [ ] Test on mobile browser
- [ ] Verify sync between devices

---

## Current Progress

### Completed Tasks
1. [x] Remove 3x3 and 4x4 grid modes (Phase 0 - done in earlier session)
   - Updated frontend/lib/constants/terminal.ts
   - Updated frontend/lib/hooks/use-available-layouts.ts
   - Updated frontend/components/LayoutModeButton.tsx
   - Updated frontend/components/GridLayout.tsx

2. [x] Database & Backend (Phase 1 - done in session 2)
   - Created terminal_panes table with migration script
   - Migrated 35 sessions into 30 panes (grouped by project_id + session_number)
   - Created pane_crud.py storage layer with full CRUD + swap + ordering
   - Created api/panes.py with all REST endpoints
   - Backend tested and verified working

### Current Task
**Phase 2: Frontend Data Layer** - IN PROGRESS

### Next Actions
1. Update use-terminal-tabs-state.ts to use panes hook
2. Wire pane operations (swap, delete, mode toggle) through components
3. Test pane-based UI rendering

---

## Files Modified (Running List)

### Phase 0 (Grid modes removal)
- frontend/lib/constants/terminal.ts - Removed grid-3x3, grid-4x4 types
- frontend/lib/hooks/use-available-layouts.ts - Removed 3x3, 4x4 from GRID_LAYOUTS
- frontend/components/LayoutModeButton.tsx - Removed 3x3, 4x4 options
- frontend/components/GridLayout.tsx - Simplified getGridDimensions

### Phase 1 (Backend)
- terminal/storage/migrations/__init__.py - Created
- terminal/storage/migrations/001_create_panes.py - Created (migration script)
- terminal/storage/pane_crud.py - Created (CRUD operations for panes)
- terminal/storage/schema.py - Added TERMINAL_PANES_TABLE schema
- terminal/storage/__init__.py - Added pane exports
- terminal/api/panes.py - Created (REST API endpoints)
- terminal/main.py - Added panes router

### Phase 2 (Frontend Data)
- frontend/lib/hooks/use-terminal-panes.ts - Created (React Query hook for panes API)
- frontend/lib/utils/slot.ts - Added PaneSlot types and paneToSlot conversion

### Phase 3 (Frontend Components)
- (none yet)

### Phase 4 (UI/UX)
- (none yet)

---

## Session Log

### Session 1 (2026-01-09)
- Analyzed NEXT_SESSION_FIX.md - found incorrect assumptions
- Clarified requirements with user via questions
- Established correct architecture: 4 panes max, pane-based (not session-based)
- Completed grid mode removal (3x3, 4x4)
- Started exploring codebase for instance-based slots
- User correctly identified need for ground-up implementation, not bandaids
- Created this session state file for proper tracking

### Session 2 (2026-01-09)
- Completed Phase 1: Database & Backend
- Created terminal_panes table with migration 001_create_panes.py
- Migrated 35 existing sessions into 30 panes
- Created pane_crud.py with full CRUD + swap + ordering
- Created api/panes.py with REST endpoints
- All API endpoints tested and working
- Started Phase 2: Frontend Data Layer
- Created use-terminal-panes.ts hook (React Query + mutations)
- Updated slot.ts with PaneSlot types and conversion functions
- Frontend builds successfully

### Session 3 (NEXT)
- Continue Phase 2: Update use-terminal-tabs-state.ts to use panes
- Wire pane operations through component handlers
- Begin Phase 3: Component integration
