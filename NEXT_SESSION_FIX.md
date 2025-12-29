# Terminal UI Bug Fix - Continue From Here

## The Problem
Terminal displays garbage characters ("eeeeeeeeee...llllllllll...") at the top on startup. This causes:
1. Visual garbage on screen
2. Selection/highlight misalignment (garbage takes buffer space)
3. Poor user experience

## Root Cause Analysis
The garbage comes from tmux sending escape sequences when attaching to a session. These sequences (like `\e[?1000l` for mouse disable) are partially rendered as characters "e" and "l".

## What Was Tried (and failed)
1. Font loading delays - didn't help
2. Garbage filtering in `ws.onmessage` - didn't work
3. `term.clear()` and Ctrl+L after connect - timing issues
4. Adding `term.writeln("Connected to terminal session...")` - build timing issue

## Current State
- Source file `/home/kasadis/terminal/frontend/components/Terminal.tsx` has the fix (line 305: `term.writeln`)
- Build at `~/terminal/frontend/.next` may be stale
- Service may be serving old build

## To Fix This Issue

### Step 1: Verify and rebuild properly
```bash
# Check source has the fix
grep -n "Connected to terminal session" ~/terminal/frontend/components/Terminal.tsx

# Clean and rebuild
cd ~/terminal/frontend
rm -rf .next
npm run build

# Verify fix is in build
grep -r "Connected to terminal session" .next/static/chunks/

# Restart service
systemctl --user restart summitflow-terminal-frontend

# Verify served content has fix
curl -s http://localhost:3002/ | head -5  # Should work
```

### Step 2: If writeln fix doesn't work, try backend fix
The real fix may need to be in the backend - don't send tmux output until after resize:

File: `~/terminal/terminal/api/terminal.py`

Option A: Clear tmux screen after attaching
```python
# After _spawn_pty_for_tmux(), send clear:
os.write(master_fd, b'\x1b[2J\x1b[H')  # Clear screen, home cursor
```

Option B: Wait for resize before reading
```python
# Don't start output_task until first resize received
# Buffer output until resize, then send
```

### Step 3: Test with browser automation
```bash
node ~/.claude/skills/browser-automation/scripts/screenshot.js \
  "http://localhost:3002/?project=terminal" /tmp/test.png true
```
Then read the screenshot to verify.

## Key Files
- Frontend: `~/terminal/frontend/components/Terminal.tsx`
- Backend: `~/terminal/terminal/api/terminal.py`
- Service: `summitflow-terminal-frontend` (systemd user service)

## Learnings Added
See `~/.claude/rules/learned-patterns.md`:
- Never kill tmux sessions without permission
- Always rebuild AFTER code changes, verify with grep
