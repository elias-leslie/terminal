# Fix: spec_it → task_it → do_it Pipeline

## Problem Statement

The spec.json → task pipeline is broken. When creating tasks from specs:

1. **spec_it** creates detailed spec.json with gaps, goals, decisions, criteria
2. **task_it** ignores most of this data, creates orphan tasks with no capability links
3. **do_it** executes tasks mechanically without verifying criteria
4. **Result**: Rich spec context is lost, tasks are just step checklists

When a user runs `/clear` and starts `/do_it`, the agent only sees:
- Task title, description, objective (text blobs)
- Subtask descriptions
- Step instructions (strings)

The agent does NOT see:
- Why decisions were made
- What criteria must be met
- What gaps are being addressed
- What the spirit/anti-patterns are

## Root Cause

The SummitFlow data model ALREADY supports this:

```
Project
├── Components (logical areas)
│   └── Capabilities (what system can do)
│       └── Acceptance Criteria (how to verify)
├── Tasks (work items)
│   └── capability_id FK ← EXISTS BUT NOT USED
├── Evidence (proof)
└── Explorer (file/db/api index)
```

But the skills don't use it:
- spec_it writes spec.json file only, doesn't create DB entities
- task_it skips capability creation, creates tasks with `capability_id: null`
- do_it doesn't verify capability criteria

## Solution

### Phase 1: Update spec_it to Create DB Entities

**File:** `~/.claude/skills/spec_it/SKILL.md`

After writing spec.json, spec_it must also:

```bash
# 1. Create components from spec.components
curl -X POST "/api/projects/{id}/components/batch" \
  -d '{"items": [
    {"component_id": "terminal-switcher", "name": "TerminalSwitcher", "description": "..."}
  ]}'

# 2. Create capabilities from spec.gaps (one capability per gap)
curl -X POST "/api/projects/{id}/capabilities/batch" \
  -d '{"items": [
    {
      "capability_id": "tsd-pane-swap",
      "name": "TSD Dropdown Pane Swapping",
      "component_id": <component-db-id>,
      "description": "gap-002: TSD dropdown enables pane swapping in grid/split",
      "rationale": "Decision dec-005: Data swap chosen over visual swap for persistence"
    }
  ]}'

# 3. Create criteria from spec.goals[].criteria
curl -X POST "/api/projects/{id}/capabilities/{cap-id}/criteria/batch" \
  -d '{"items": [
    {"criterion": "Selecting terminal performs data swap - exchanges orderedSlotIds", "category": "correctness"},
    {"criterion": "Order persists across layout mode changes", "category": "correctness"}
  ]}'

# 4. Update spec.json with DB IDs for traceability
{
  "gaps": [
    {"id": "gap-002", "capability_id": "cap-xxx-xxx", ...}
  ]
}
```

**Add to spec_it Phase 4 (Specification):**

```markdown
### Step 4.5: Create Database Entities (MANDATORY)

After writing spec.json, create corresponding DB entities:

1. **Components**: One per spec.components entry
   - component_id: kebab-case from component name
   - Link to spec: store spec.components[].id in description

2. **Capabilities**: One per spec.gaps entry
   - capability_id: derived from gap title
   - component_id: from spec.gaps[].files[0] mapping
   - rationale: include relevant spec.decisions

3. **Criteria**: From spec.goals[].criteria
   - Map each goal to its capability (gap → capability)
   - category: correctness (default), performance, security, quality

4. **Update spec.json**: Add capability_id to each gap for traceability

Output:
- Components created: N
- Capabilities created: N
- Criteria created: N
- spec.json updated with capability IDs
```

### Phase 2: Update task_it to Require Capability Links

**File:** `~/.claude/skills/task_it/SKILL.md`

task_it must:
1. Query existing capabilities (Step 3 - ENFORCE, don't skip)
2. FAIL if no capabilities exist for the project
3. REQUIRE capability_id on every feature task
4. Include capability criteria in task output

**Add enforcement to Step 8:**

```markdown
### Step 8: Create Tasks (ENFORCE CAPABILITY LINKAGE)

Before creating tasks:
```bash
# Check capabilities exist
caps=$(curl -s "/api/projects/{id}/capabilities" | jq length)
if [ "$caps" -eq 0 ]; then
  echo "ERROR: No capabilities found. Run /spec_it first to create capabilities."
  exit 1
fi
```

When creating tasks:
```json
{
  "title": "...",
  "capability_id": "<REQUIRED - must link to capability>",
  "objective": "<from capability.description>",
  "acceptance_criteria": "<from capability.criteria - denormalized for do_it>"
}
```

The `acceptance_criteria` field should contain the capability's criteria
so do_it can verify without additional API calls.
```

### Phase 3: Update do_it to Verify Criteria

**File:** `~/.claude/skills/do_it/SKILL.md`

do_it must:
1. Read task.acceptance_criteria at start
2. Display criteria to agent before execution
3. Verify each criterion before marking task complete
4. Block completion if criteria not verified

**Add to do_it initialization:**

```markdown
### Step 0: Load Context (BEFORE any execution)

1. Read task: `st --compact show <task-id>`
2. Read acceptance_criteria from task
3. Read capability if linked: `st capability show <capability-id>`
4. Display to agent:

```
TASK: <title>
OBJECTIVE: <objective>

ACCEPTANCE CRITERIA (must ALL be verified before completion):
  [ ] Criterion 1
  [ ] Criterion 2
  [ ] Criterion 3

SPIRIT (what to AVOID): <spirit_anti if present>
```

Keep criteria visible throughout execution.
```

**Add to do_it completion:**

```markdown
### Step N: Verify Criteria (BEFORE marking complete)

For each acceptance criterion:
1. How was this verified? (test, manual check, code review)
2. What evidence exists?
3. Mark criterion as verified: `st criterion verify <task-id> <criterion-id> --by <method>`

If ANY criterion cannot be verified:
- DO NOT mark task complete
- List unverified criteria
- Ask user: continue working, defer criterion, or mark task blocked

```bash
# Check all criteria verified
unverified=$(st criterion list --task <id> --unverified | jq length)
if [ "$unverified" -gt 0 ]; then
  echo "ERROR: $unverified criteria not verified. Cannot complete task."
  exit 1
fi
```
```

### Phase 4: API Enforcement (Optional but Recommended)

**File:** `~/summitflow/backend/app/api/tasks.py`

Add validation:

```python
@router.post("/tasks")
async def create_task(task: TaskCreate):
    if task.task_type == "feature" and not task.capability_id:
        raise HTTPException(400, "Feature tasks require capability_id. Run /spec_it first.")
    # ... rest of creation

@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str):
    task = await get_task(task_id)
    if task.capability_id:
        unverified = await get_unverified_criteria(task.capability_id, task_id)
        if unverified:
            raise HTTPException(400, f"Cannot complete: {len(unverified)} criteria not verified")
    # ... rest of completion
```

## Verification

After implementing, this flow should work:

```bash
# 1. Create spec (also creates capabilities + criteria)
/spec_it "new feature description"
# Output: spec.json + 5 capabilities + 12 criteria created

# 2. Create tasks (linked to capabilities)
/task_it
# Output: task-xxx linked to capability cap-yyy
# Output: 12 acceptance criteria loaded from capability

# 3. Execute task (verifies criteria)
/do_it task-xxx
# Shows: ACCEPTANCE CRITERIA at start
# Before complete: Verifies all 12 criteria
# Blocks if any unverified

# 4. Fresh session can see everything
/clear
/do_it task-xxx
# Still sees: criteria, capability link, full context
```

## Files to Modify

| File | Change |
|------|--------|
| `~/.claude/skills/spec_it/SKILL.md` | Add Phase 4.5: Create DB entities |
| `~/.claude/skills/task_it/SKILL.md` | Enforce capability linkage in Step 8 |
| `~/.claude/skills/do_it/SKILL.md` | Add Step 0 (load criteria) and Step N (verify criteria) |
| `~/summitflow/backend/app/api/tasks.py` | Add validation (optional) |

## Success Criteria

1. `st capability list` returns capabilities after `/spec_it`
2. `st --compact show <task>` shows `capability_id` (not null)
3. `/do_it` displays acceptance criteria before starting
4. `/do_it` blocks completion if criteria unverified
5. Fresh session with only task-id can access full context via capability link

## Anti-Patterns to Avoid

- DO NOT add more fields to tasks - use capability linkage
- DO NOT store criteria as JSON blobs - use normalized criteria table
- DO NOT skip capability creation - enforce at API level
- DO NOT allow orphan tasks for feature work

## Related Files

- Spec that triggered this: `/home/kasadis/terminal/spec/terminal-ui-overhaul-spec.json`
- Example orphan task: `task-0e4bffb9` (has no capability_id)
- SummitFlow API: `~/summitflow/backend/app/api/`
- Skills directory: `~/.claude/skills/`
