# Touch Scrolling Debug Prompt

You are debugging touch scrolling on a mobile terminal (xterm.js) at terminal.summitflow.dev.

## Current State
- `seq 1 200` produces output but touch scrolling doesn't work
- Container has `touchAction: 'none'` (prevents pull-to-refresh)
- `.xterm-viewport` has `touchAction: 'pan-y'` set via JS after terminal init
- Native xterm.js scrollbar is styled and visible (CSS in globals.css)
- Build succeeds, no runtime errors

## What We Know
1. xterm.js GitHub issue #5377 (July 2025): "Limited touch support on mobile devices" - xterm.js has no dedicated touch event handling
2. xterm.js doesn't have native touch scroll handling - relies on browser delivering touch events
3. Previous working solution used tmux copy-mode (Ctrl+B [, then Ctrl+U/D to scroll)
4. The copy-mode approach was removed in commit 489f1d8 to enable "native" scrolling
5. The scrollbar DOES work on desktop with mouse wheel

## Investigation Tasks

### 1. DOM Structure Analysis
In browser DevTools on mobile (or Chrome mobile emulator), inspect the terminal element hierarchy:

```
Expected structure:
.terminal-container (our div)
  └── .xterm (xterm.js root)
       ├── .xterm-viewport (scrollable container - THIS should handle scroll)
       │    └── .xterm-screen (the actual rendered content)
       └── .xterm-helper-textarea (hidden input)
```

Questions to answer:
- Is `.xterm-viewport` actually scrollable (`overflow-y: scroll` or `auto`)?
- What are the COMPUTED `touch-action` values on each element in the chain?
- Is there `scrollHeight > clientHeight` on the viewport (i.e., is there content to scroll)?
- Are touch events reaching the viewport or being captured earlier?

### 2. Verify Our JS Fix is Applied
The JS sets touchAction on `.xterm-viewport` AFTER terminal init. Add debugging:

```typescript
// In Terminal.tsx around line 215-220
const viewport = containerRef.current.querySelector<HTMLElement>(".xterm-viewport");
console.log('[DEBUG] viewport element:', viewport);
console.log('[DEBUG] viewport scrollHeight:', viewport?.scrollHeight);
console.log('[DEBUG] viewport clientHeight:', viewport?.clientHeight);
console.log('[DEBUG] viewport overflow-y:', viewport ? getComputedStyle(viewport).overflowY : 'N/A');
console.log('[DEBUG] viewport touch-action before:', viewport ? getComputedStyle(viewport).touchAction : 'N/A');
if (viewport) {
  viewport.style.touchAction = "pan-y";
  console.log('[DEBUG] viewport touch-action after:', getComputedStyle(viewport).touchAction);
}
```

### 3. CSS Conflicts Check
The inline style might be overridden by CSS. Check:

```bash
# Search for touch-action in all CSS
grep -r "touch-action" frontend/app/
grep -r "touch-action" node_modules/@xterm/xterm/css/

# Check if !important is needed
```

In globals.css, we have scrollbar styling but no touch-action. The xterm.css might have conflicting rules.

### 4. Event Propagation Test
Add a test to see if touch events reach the viewport:

```typescript
// Temporary debug code
const viewport = containerRef.current.querySelector<HTMLElement>(".xterm-viewport");
if (viewport) {
  viewport.addEventListener('touchstart', (e) => console.log('[DEBUG] touchstart on viewport', e), { passive: true });
  viewport.addEventListener('touchmove', (e) => console.log('[DEBUG] touchmove on viewport', e), { passive: true });
}
```

If events don't fire, something higher in the DOM is capturing them.

### 5. The Parent Container Problem
Our container has `touchAction: 'none'`. This might be blocking events from reaching children. CSS `touch-action` is NOT inherited but the browser may still block events at the parent level.

**Hypothesis**: Setting `touchAction: 'none'` on the parent container prevents touch events from ever reaching the viewport child, regardless of the child's touch-action setting.

**Test**: Try removing `touchAction: 'none'` from container entirely and see if scrolling works (pull-to-refresh will also work, but this is diagnostic).

## Alternative Approaches (in order of preference)

### Approach A: Fix Event Propagation
Instead of `touchAction: 'none'` on container, use CSS to prevent pull-to-refresh while allowing scroll:

```css
/* In globals.css */
.terminal-container {
  overscroll-behavior: none; /* Prevents pull-to-refresh */
  /* Do NOT set touch-action: none here */
}

.xterm-viewport {
  touch-action: pan-y !important;
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
}
```

Then in Terminal.tsx, remove the `touchAction: 'none'` line entirely.

### Approach B: Use manipulation instead of none
```typescript
// Instead of touchAction: 'none', use 'manipulation'
// This disables double-tap zoom but allows pan
containerRef.current.style.touchAction = "manipulation";
```

### Approach C: Intercept Touch Events and Scroll Programmatically
If the browser won't scroll the viewport natively, do it ourselves:

```typescript
// In Terminal.tsx mobile setup
const viewport = containerRef.current.querySelector<HTMLElement>(".xterm-viewport");
if (viewport) {
  let startY = 0;
  let lastY = 0;

  const onTouchStart = (e: TouchEvent) => {
    startY = e.touches[0].clientY;
    lastY = startY;
  };

  const onTouchMove = (e: TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const deltaY = lastY - currentY;
    viewport.scrollTop += deltaY;
    lastY = currentY;
    e.preventDefault(); // Prevent any other handling
  };

  containerRef.current.addEventListener('touchstart', onTouchStart, { passive: true });
  containerRef.current.addEventListener('touchmove', onTouchMove, { passive: false });
}
```

### Approach D: FALLBACK - Restore tmux Copy-Mode (Last Resort)
The deleted `use-terminal-scrolling.ts` hook worked reliably. It was removed due to UX concerns but DID work.

How it worked:
1. On touchstart: send `\x02[` (Ctrl+B [) to enter tmux copy-mode
2. On touchmove: track Y delta, send `\x15` (Ctrl+U half-page up) or `\x04` (Ctrl+D half-page down)
3. Threshold of 50px before sending scroll command
4. 10s timeout assumes user exited copy-mode (presses q or types)

Downsides:
- User must press 'q' to exit copy-mode before typing
- Or timeout assumes they exited (can cause state mismatch)
- Not as smooth as native scrolling

To restore, see: `git show 2b6397d^:frontend/lib/hooks/use-terminal-scrolling.ts`

## Files to Examine
- `frontend/components/Terminal.tsx:200-220` - mobile setup code
- `frontend/app/globals.css` - scrollbar CSS, search for touch/scroll
- `node_modules/@xterm/xterm/css/xterm.css` - xterm defaults
- `git show 489f1d8` - commit that added native scrollbar, removed copy-mode
- `git show 2b6397d^:frontend/lib/hooks/use-terminal-scrolling.ts` - the working copy-mode implementation

## Success Criteria
1. Touch swipe on terminal scrolls through output smoothly
2. Pull-to-refresh remains disabled (overscroll-behavior: none)
3. Scrolling to bottom automatically resumes normal input
4. No "q to exit" or modal state required
5. Works on both iOS Safari and Android Chrome
6. Desktop mouse wheel scrolling still works

## Recommended Investigation Order
1. Add debug logging to verify viewport exists and has scrollable content
2. Check computed touch-action values in DevTools
3. Test removing touchAction: 'none' from container (diagnostic only)
4. Try Approach A (CSS-only fix with overscroll-behavior)
5. Try Approach B (manipulation instead of none)
6. Try Approach C (programmatic scroll)
7. Fall back to Approach D (copy-mode) only if all else fails

## Quick Test Commands
```bash
# View current Terminal.tsx mobile setup
sed -n '200,230p' frontend/components/Terminal.tsx

# View the deleted scrolling hook
git show 2b6397d^:frontend/lib/hooks/use-terminal-scrolling.ts

# View the commit that broke things
git show 489f1d8

# Search for touch-action in codebase
grep -rn "touch-action\|touchAction" frontend/
```
