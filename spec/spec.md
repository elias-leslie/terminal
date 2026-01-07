# Terminal Grid Layout Specification

**Status:** Complete | **Last Updated:** 2026-01-06

## Objective

Developer can implement grid layout without further clarification.

## Overview

Add grid layout modes (2x2, 3x3, 4x4) to the terminal app. Users can display multiple terminal sessions in a square grid arrangement with drag-and-drop reordering. Grid options are viewport-aware and hidden on smaller screens.

## Current State

```
┌─────────────────────────────────────────┐
│ LayoutMode: single | horizontal | vertical │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────┐   ┌─────┬─────┐            │
│  │ Single  │   │ H   │ H   │ Horizontal │
│  │  Pane   │   │ 1   │ 2   │   Split    │
│  └─────────┘   └─────┴─────┘            │
│                                         │
│  ┌──────────────┐                       │
│  │   V1  │  V2  │   Vertical Split      │
│  └──────────────┘                       │
│                                         │
│  Library: react-resizable-panels (1D)   │
│  Max panes: 4                           │
│  Mobile: Single pane only               │
└─────────────────────────────────────────┘
```

## Desired State

```
┌─────────────────────────────────────────┐
│ LayoutMode: single | horizontal | vertical │
│           | grid-2x2 | grid-3x3 | grid-4x4 │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────┬─────┐   ┌───┬───┬───┐          │
│  │  1  │  2  │   │ 1 │ 2 │ 3 │  Grid    │
│  ├─────┼─────┤   ├───┼───┼───┤  Modes   │
│  │  3  │  4  │   │ 4 │ 5 │ 6 │          │
│  └─────┴─────┘   ├───┼───┼───┤          │
│     2x2          │ 7 │ 8 │ 9 │          │
│                  └───┴───┴───┘          │
│                      3x3                │
│                                         │
│  Features:                              │
│  - Fixed equal-size cells               │
│  - Drag-and-drop reordering             │
│  - Viewport-aware availability          │
│  - CSS Grid (2D)                        │
└─────────────────────────────────────────┘
```

## Key Gaps

- **No grid layout modes** - LayoutMode type lacks grid options
- **No CSS Grid rendering** - Current splits are 1D only
- **No drag-and-drop** - Slot order is fixed
- **No viewport filtering** - All options shown regardless of screen size

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Square grids only (2x2, 3x3, 4x4) | Simpler UI, predictable layouts |
| Auto-fill + drag reordering | Balance simplicity and control |
| Fixed equal-size cells | Simpler than resizable, consistent UX |
| Breakpoints: 1280/1920/2560px | 80-column minimum per cell (~640px) |
| CSS Grid over nested panels | 2D layout, simpler for equal cells |
| @dnd-kit with rectSortingStrategy | Already in deps, designed for grids |

## Implementation Plan

### Phase 1: Constants & Types
- Add `GRID_MIN_WIDTHS`, `GRID_CELL_COUNTS` to `terminal.ts`
- Extend `LayoutMode` type with grid modes
- Add grid icons to `LayoutModeButton.tsx`

### Phase 2: Hooks
- Create `use-available-layouts.ts` (viewport-aware filtering)
- Create `use-slot-ordering.ts` (drag-and-drop state)

### Phase 3: Components
- Create `GridCell.tsx` (terminal + drag handle)
- Create `GridLayout.tsx` (CSS Grid + DnD context)

### Phase 4: Integration
- Add grid render branch to `TerminalTabs.tsx`
- Wire up ordering state and auto-downgrade
- Filter dropdown options by available layouts

### Phase 5: UI Polish
- Style cells, hover states, drag indicators
- Use `/frontend-design` for final polish

## Files Summary

**Modify:**
- `frontend/lib/constants/terminal.ts`
- `frontend/components/LayoutModeButton.tsx`
- `frontend/components/TerminalTabs.tsx`
- `frontend/components/TabBar.tsx`

**Create:**
- `frontend/lib/hooks/use-available-layouts.ts`
- `frontend/lib/hooks/use-slot-ordering.ts`
- `frontend/components/GridCell.tsx`
- `frontend/components/GridLayout.tsx`

## Next Steps

1. Run `/task_it terminal-grid-layout` to generate implementation task
2. Execute with `/do_it`
3. Use `/frontend-design` for Phase 5 polish

---
**Confidence:** 88/100 | **Verified:** 2026-01-06

### Confidence Breakdown
| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 23/25 | All requirements captured |
| Accuracy | 24/25 | File paths verified, patterns from codebase |
| Clarity | 18/20 | Clear phases, diagrams included |
| User Alignment | 13/15 | All user decisions incorporated |
| Decision Quality | 10/15 | Trade-offs documented, rationale clear |
