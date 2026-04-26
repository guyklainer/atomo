# TECH_SPEC_75: Lock WIP Issues

**Priority Score: 8.89** (I=4, C=5, E=2.25)  
**Confidence Score: 100%**

## Issue Reference
- **Number**: #75
- **Title**: Lock WIP issues
- **Type**: Enhancement
- **Description**: Prevent concurrent agent instances from working on the same issue by implementing a label-based locking mechanism with 30-minute TTL.

---

## Root Cause / Requirements

**Problem:**
Multiple instances of agents (planner, dev) can currently run simultaneously and pick the same issue from the queue, resulting in:
- Duplicate work (e.g., two Dev agents creating PRs for the same issue)
- Race conditions in label management (both agents modifying labels)
- Wasted API tokens and compute time
- Potential git conflicts if both agents work on overlapping files

**Requirements:**
1. **Lock Acquisition**: When an agent starts working on an issue, mark it as "work in progress"
2. **Lock Validation**: Before starting work, check if another agent already holds the lock
3. **TTL Enforcement**: Locks expire after 30 minutes to handle crashed/interrupted agents
4. **Automatic Cleanup**: Successful agent runs release locks automatically
5. **Visibility**: Locks should be visible in GitHub UI (via labels)
6. **Future-Proof**: Instructions for new agents to respect lock protocol

---

## Priority Calculation

### Impact (I = 4 / 5)
- **Affected Users**: All users running multiple agent instances (orchestrator use case from #82)
- **Severity**: HIGH — prevents duplicate work, race conditions, and wasted resources
- **Observable Benefit**: Zero duplicate PRs, deterministic queue processing

### Confidence (C = 5 / 5)
- **Root Cause**: Perfectly clear — no concurrency control exists today
- **Solution Clarity**: Well-defined (label + timestamp metadata)
- **Technical Risk**: LOW — label operations are atomic via GitHub API
- **Clarification**: TTL duration confirmed (30 min)

### Ease/Effort (E = 2.25 / 5)
- **New Files**: 1 (`src/lock.ts` ~120 LOC)
- **Modified Files**: 3 (planner.ts, dev.ts, github.ts for label creation)
- **Complexity**: MEDIUM — requires timestamp parsing, TTL validation logic
- **Testing**: LOW — can test with parallel `npm run dev` instances
- **Dependencies**: None — uses existing `gh` CLI infrastructure

**Formula**: P = (I × C) / E = (4 × 5) / 2.25 = **8.89** → **High Priority**

---

## Files Changed

### New Files

#### 1. `src/lock.ts` (~120 LOC)
**Purpose**: Centralized lock management utilities

**Exports**:
```typescript
export interface LockMetadata {
  issueNumber: number;
  agentName: string;
  acquiredAt: string; // ISO 8601 timestamp
  isExpired: boolean;
}

export function acquireLock(issueNumber: number, agentName: string, cwd?: string): {
  success: boolean;
  message: string;
};

export function validateLock(issueNumber: number, agentName: string, cwd?: string): {
  locked: boolean;
  metadata?: LockMetadata;
  message: string;
};

export function releaseLock(issueNumber: number, cwd?: string): {
  success: boolean;
  message: string;
};
```

**Key Logic**:

1. **`acquireLock()`**:
   ```typescript
   // 1. Check if issue has `wip` label
   // 2. If yes, parse lock comment for timestamp
   // 3. If lock is < 30min old, return { success: false, message: "Locked by <agent>" }
   // 4. If lock is >= 30min old, log stale lock warning, proceed to step 5
   // 5. Add `wip` label: gh issue edit <number> --add-label wip
   // 6. Post lock metadata comment:
   //    "🤖 **[Lock]** Acquired by <agentName> at <timestamp>"
   // 7. Return { success: true, message: "Lock acquired" }
   ```

2. **`validateLock()`**:
   ```typescript
   // 1. Fetch issue: gh issue view <number> --json labels,comments
   // 2. Check if `wip` label exists
   // 3. If no `wip` label: return { locked: false, message: "No lock" }
   // 4. Find most recent lock comment matching pattern: 🤖 **[Lock]** Acquired by
   // 5. Parse timestamp from comment body
   // 6. Calculate age: now - acquiredAt
   // 7. If age >= 30min: return { locked: true, metadata: {..., isExpired: true} }
   // 8. If age < 30min: return { locked: true, metadata: {..., isExpired: false} }
   ```

3. **`releaseLock()`**:
   ```typescript
   // 1. Remove `wip` label: gh issue edit <number> --remove-label wip
   // 2. Post release comment: "🤖 **[Lock]** Released by <agentName>"
   // 3. Return { success: true, message: "Lock released" }
   ```

**Error Handling**:
- All `gh` CLI calls wrapped in try/catch
- If label removal fails, log warning but don't throw (idempotent cleanup)
- If lock validation fails (malformed comment, missing timestamp), treat as unlocked

---

### Modified Files

#### 2. `src/planner.ts` (add lock check)
**Location**: After deterministic pre-processing, before LLM invocation

**Changes**:
```typescript
// Import lock utilities
import { acquireLock, releaseLock } from './lock.js';

// In main execution flow (after REVIEW flow, before PLANNING):
const reviewResult = handleReviewIssues();

if (reviewResult.outcome === 'feedback') {
  // Lock check for review iteration
  const lock = acquireLock(reviewResult.issueNumber, 'planner', targetCwd);
  if (!lock.success) {
    console.log(`[Planner] ${lock.message}. Exiting.`);
    process.exit(0); // Graceful exit — another planner instance is working on this
  }
  
  try {
    // ... existing LLM invocation for review feedback
    await runAgent('planner', buildReviewPrompt(reviewResult.issue), options);
  } finally {
    releaseLock(reviewResult.issueNumber, targetCwd);
  }
}

// Similar pattern for new triaged issues:
const issue = ghTarget('issue view <number> --json ...');

const lock = acquireLock(issue.number, 'planner', targetCwd);
if (!lock.success) {
  console.log(`[Planner] ${lock.message}. Exiting.`);
  process.exit(0);
}

try {
  // ... confidence gate, spec generation, LLM invocation
  await runAgent('planner', buildPlanningPrompt(issue), options);
} finally {
  releaseLock(issue.number, targetCwd);
}
```

**Rationale**: Lock before LLM invocation to prevent duplicate planning work. Release in `finally` block to ensure cleanup even if agent fails.

---

#### 3. `src/dev.ts` (add lock check)
**Location**: After PR review deterministic flow, before dev work

**Changes**:
```typescript
// Import lock utilities
import { acquireLock, releaseLock } from './lock.js';

// After PR review flow, before dev work:
const issue = selectHighestPriorityIssue();

const lock = acquireLock(issue.number, 'dev', targetCwd);
if (!lock.success) {
  console.log(`[Dev] ${lock.message}. Exiting.`);
  process.exit(0);
}

try {
  // ... existing dev agent LLM invocation
  const { worktreePath } = setupAgentWorktree('dev', targetCwd);
  await runAgent('dev', buildDevPrompt(issue), { ...options, cwd: worktreePath });
  cleanupAgentWorktree(worktreePath, targetCwd);
} finally {
  releaseLock(issue.number, targetCwd);
}
```

**Rationale**: Dev agent runs can take 5-15 minutes; lock prevents duplicate PR creation.

---

#### 4. Create `wip` Label (one-time setup)
**Method**: Add to repository programmatically or manually

**Option A (Programmatic — recommended)**:
Add to `src/lock.ts` initialization:
```typescript
export function ensureWipLabelExists(cwd?: string): void {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  try {
    // Check if wip label exists
    const labels = JSON.parse(
      execSync('gh api repos/:owner/:repo/labels --jq ".[].name"', {
        encoding: 'utf-8', cwd: targetCwd
      })
    );
    
    if (!labels.includes('wip')) {
      execSync(
        'gh api repos/:owner/:repo/labels -f name=wip -f color=FFA500 -f description="Agent is actively working on this issue"',
        { cwd: targetCwd, stdio: 'pipe' }
      );
      console.log('[Lock] Created `wip` label.');
    }
  } catch (error) {
    console.warn('[Lock] Could not create wip label:', error);
  }
}
```

Call `ensureWipLabelExists()` in `acquireLock()` before adding the label.

**Option B (Manual)**:
```bash
gh api repos/:owner/:repo/labels \
  -f name=wip \
  -f color=FFA500 \
  -f description="Agent is actively working on this issue"
```

---

## Pattern Discovery

### Existing Lock/Concurrency Patterns in Codebase

**1. Worktree Isolation** (src/github.ts:426-495)
- **Pattern**: `setupAgentWorktree()` creates unique git worktrees per agent run
- **Scope**: Prevents git state conflicts, but doesn't prevent queue conflicts
- **Relation**: Worktrees handle *file-level* isolation; this lock handles *issue-level* isolation

**2. Label State Machine** (throughout src/)
- **Pattern**: Labels define workflow states (triaged → for-dev → pr-ready)
- **Atomicity**: `gh issue edit --add-label` is atomic via GitHub API
- **Relation**: `wip` label fits naturally into existing state machine

**3. Timestamp-Based Detection** (src/github.ts:88-117)
- **Pattern**: `hasHumanReplyAfterBot()` uses `createdAt` timestamps
- **Precedent**: Comment timestamps already used for temporal logic
- **Relation**: Lock TTL reuses same timestamp parsing approach

**4. Deterministic Pre-Processing** (src/planner.ts:69, src/dev.ts:53)
- **Pattern**: Pre-LLM checks short-circuit execution if no work is needed
- **Relation**: Lock check is another deterministic gate (runs before LLM)

---

## Implementation Pseudo-Code

### Step 1: Create Lock Utilities (src/lock.ts)

```typescript
import { execSync } from 'child_process';
import type { GitHubIssue } from './github.js';

const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LOCK_COMMENT_PATTERN = /🤖 \*\*\[Lock\]\*\* Acquired by (.+) at (.+)/;

export interface LockMetadata {
  issueNumber: number;
  agentName: string;
  acquiredAt: string;
  isExpired: boolean;
}

function gh(command: string, cwd?: string): any {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  const result = execSync(`gh ${command}`, {
    encoding: 'utf-8',
    cwd: targetCwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return command.includes('--json') ? JSON.parse(result) : result;
}

function parseLockComment(comments: GitHubIssue['comments']): LockMetadata | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const match = comments[i].body.match(LOCK_COMMENT_PATTERN);
    if (match) {
      const agentName = match[1];
      const acquiredAt = match[2];
      const age = Date.now() - new Date(acquiredAt).getTime();
      return {
        issueNumber: 0, // Filled by caller
        agentName,
        acquiredAt,
        isExpired: age >= LOCK_TTL_MS
      };
    }
  }
  return null;
}

export function acquireLock(issueNumber: number, agentName: string, cwd?: string): {
  success: boolean;
  message: string;
} {
  try {
    ensureWipLabelExists(cwd);
    
    // Step 1: Check current lock state
    const issue: GitHubIssue = gh(`issue view ${issueNumber} --json number,labels,comments`, cwd);
    const hasWip = issue.labels.some(l => l.name === 'wip');
    
    if (hasWip) {
      const metadata = parseLockComment(issue.comments);
      if (metadata && !metadata.isExpired) {
        return {
          success: false,
          message: `Locked by ${metadata.agentName} (acquired ${metadata.acquiredAt})`
        };
      }
      
      if (metadata && metadata.isExpired) {
        console.warn(`[Lock] Stale lock detected (age: ${Math.floor((Date.now() - new Date(metadata.acquiredAt).getTime()) / 60000)} min). Re-acquiring...`);
      }
    }
    
    // Step 2: Acquire lock
    const timestamp = new Date().toISOString();
    gh(`issue edit ${issueNumber} --add-label wip`, cwd);
    gh(`issue comment ${issueNumber} --body "🤖 **[Lock]** Acquired by ${agentName} at ${timestamp}"`, cwd);
    
    console.log(`[Lock] Acquired lock on issue #${issueNumber} for ${agentName}`);
    return { success: true, message: 'Lock acquired' };
    
  } catch (error: any) {
    console.error(`[Lock] Failed to acquire lock on issue #${issueNumber}:`, error.message);
    return { success: false, message: `Lock acquisition failed: ${error.message}` };
  }
}

export function validateLock(issueNumber: number, agentName: string, cwd?: string): {
  locked: boolean;
  metadata?: LockMetadata;
  message: string;
} {
  try {
    const issue: GitHubIssue = gh(`issue view ${issueNumber} --json labels,comments`, cwd);
    const hasWip = issue.labels.some(l => l.name === 'wip');
    
    if (!hasWip) {
      return { locked: false, message: 'No lock present' };
    }
    
    const metadata = parseLockComment(issue.comments);
    if (!metadata) {
      return { locked: false, message: 'Lock label present but no metadata comment found (treating as unlocked)' };
    }
    
    metadata.issueNumber = issueNumber;
    
    if (metadata.isExpired) {
      return {
        locked: true,
        metadata,
        message: `Lock expired (age: ${Math.floor((Date.now() - new Date(metadata.acquiredAt).getTime()) / 60000)} min)`
      };
    }
    
    return {
      locked: true,
      metadata,
      message: `Locked by ${metadata.agentName} at ${metadata.acquiredAt}`
    };
    
  } catch (error: any) {
    console.error(`[Lock] Failed to validate lock on issue #${issueNumber}:`, error.message);
    return { locked: false, message: `Validation failed: ${error.message}` };
  }
}

export function releaseLock(issueNumber: number, cwd?: string): {
  success: boolean;
  message: string;
} {
  try {
    gh(`issue edit ${issueNumber} --remove-label wip`, cwd);
    console.log(`[Lock] Released lock on issue #${issueNumber}`);
    return { success: true, message: 'Lock released' };
  } catch (error: any) {
    // Non-fatal: label might already be removed
    console.warn(`[Lock] Failed to release lock on issue #${issueNumber}:`, error.message);
    return { success: false, message: `Release failed: ${error.message}` };
  }
}

function ensureWipLabelExists(cwd?: string): void {
  try {
    const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
    const labels: string = execSync(
      'gh api repos/:owner/:repo/labels --jq ".[].name"',
      { encoding: 'utf-8', cwd: targetCwd, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    if (!labels.includes('wip')) {
      execSync(
        'gh api repos/:owner/:repo/labels -f name=wip -f color=FFA500 -f description="Agent is actively working on this issue"',
        { cwd: targetCwd, stdio: 'pipe' }
      );
      console.log('[Lock] Created `wip` label.');
    }
  } catch (error) {
    // Non-fatal: manual label creation is acceptable fallback
    console.warn('[Lock] Could not auto-create wip label. Please create manually.');
  }
}
```

---

### Step 2: Integrate Lock Check into Planner

**File**: `src/planner.ts`

**Location 1** (Review Feedback Flow):
```typescript
// Line ~112 (after feedback detection)
console.log(`[REVIEW] Issue #${issue.number}: Feedback detected → Delegating to LLM for spec iteration.`);

// ADD LOCK CHECK HERE:
const lock = acquireLock(issue.number, 'planner', targetCwd);
if (!lock.success) {
  console.log(`[Planner] ${lock.message}. Exiting.`);
  return { outcome: 'locked', issueNumber: issue.number };
}

try {
  return { outcome: 'feedback', issueNumber: issue.number, issue };
} finally {
  releaseLock(issue.number, targetCwd);
}
```

**Location 2** (New Triaged Issue Flow):
```typescript
// Line ~250 (after fetching triaged issue, before LLM)
const issue: GitHubIssue = ghTarget(`issue view ${issueNumber} --json number,title,body,labels,comments`);

// ADD LOCK CHECK HERE:
const lock = acquireLock(issue.number, 'planner', targetCwd);
if (!lock.success) {
  console.log(`[Planner] ${lock.message}. Exiting.`);
  process.exit(0);
}

try {
  // ... existing spec generation logic
  await runAgent('planner', SYSTEM_PROMPT, options);
} finally {
  releaseLock(issue.number, targetCwd);
}
```

---

### Step 3: Integrate Lock Check into Dev Agent

**File**: `src/dev.ts`

**Location**: After issue selection, before LLM invocation (line ~200)

```typescript
const issue = selectHighestPriorityIssue();
if (!issue) {
  // ... existing no-issue handling
}

// ADD LOCK CHECK HERE:
const lock = acquireLock(issue.number, 'dev', targetCwd);
if (!lock.success) {
  console.log(`[Dev] ${lock.message}. Exiting.`);
  process.exit(0);
}

try {
  const { worktreePath } = setupAgentWorktree('dev', targetCwd);
  // ... existing LLM invocation
  await runAgent('dev', buildDevPrompt(issue), { ...options, cwd: worktreePath });
  cleanupAgentWorktree(worktreePath, targetCwd);
} finally {
  releaseLock(issue.number, targetCwd);
}
```

---

### Step 4: Update Agent Instructions (CLAUDE.md)

**File**: `CLAUDE.md` (or protocol file for future agents)

Add section:

```markdown
## Work-In-Progress Lock Protocol

All long-running agents (planner, dev) MUST acquire a WIP lock before processing an issue:

1. **Import**: `import { acquireLock, releaseLock } from './lock.js';`
2. **Acquire**: Before starting work, call `acquireLock(issueNumber, agentName, cwd)`
3. **Check Result**: If `success: false`, exit gracefully (another agent is working on this issue)
4. **Release**: Use `try/finally` to ensure `releaseLock()` is called even if agent fails

**Example**:
```typescript
const lock = acquireLock(issue.number, 'my-agent', targetCwd);
if (!lock.success) {
  console.log(`[MyAgent] ${lock.message}. Exiting.`);
  process.exit(0);
}

try {
  // ... do work
} finally {
  releaseLock(issue.number, targetCwd);
}
```

**TTL**: Locks expire after 30 minutes. If an agent crashes, the next run will re-acquire the stale lock.
```

---

## Testing Strategy

### Manual Testing

**Test 1: Basic Lock Acquisition**
```bash
# Terminal 1
npm run dev

# Terminal 2 (start immediately while Terminal 1 is running)
npm run dev

# Expected: Terminal 2 exits with "Locked by dev" message
```

**Test 2: TTL Expiration**
```bash
# Manually acquire a lock with old timestamp:
gh issue edit 1 --add-label wip
gh issue comment 1 --body "🤖 **[Lock]** Acquired by test-agent at 2026-04-26T00:00:00.000Z"

# Wait a moment, then run:
npm run dev

# Expected: Dev agent logs "Stale lock detected... Re-acquiring"
```

**Test 3: Lock Release**
```bash
# Run agent to completion
npm run dev

# Check issue labels
gh issue view <number> --json labels

# Expected: `wip` label is removed
```

**Test 4: Orchestrator Integration (depends on #82)**
```bash
# Start orchestrator
npm run watch

# Create 3 new issues
gh issue create --title "Test 1" --body "..." --label triaged
gh issue create --title "Test 2" --body "..." --label triaged
gh issue create --title "Test 3" --body "..." --label triaged

# Expected: Orchestrator processes them sequentially (or up to MAX_CONCURRENT=3)
# No duplicate work, each issue locked while being processed
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent crashes mid-run | `wip` label remains for 30min, then next run re-acquires |
| Manual label removal | Lock check sees no `wip`, treats as unlocked (safe) |
| Malformed lock comment | `parseLockComment()` returns null, treats as unlocked |
| Clock skew (local vs GitHub server time) | ISO timestamps are timezone-agnostic (UTC), minor skew acceptable |
| Orchestrator runs 5 agents simultaneously | Each grabs a different issue (or exits if all locked) |

---

## Deployment Notes

### Label Creation

**Before first run**, ensure `wip` label exists:
```bash
gh api repos/:owner/:repo/labels \
  -f name=wip \
  -f color=FFA500 \
  -f description="Agent is actively working on this issue"
```

Or rely on automatic creation via `ensureWipLabelExists()` (runs on first `acquireLock()` call).

### Backward Compatibility

- **No breaking changes**: Existing agents continue to work (no lock check = no lock enforcement)
- **Gradual rollout**: Add lock checks to planner/dev first, then triage/PM later if needed
- **Manual override**: If lock is stuck, remove `wip` label manually: `gh issue edit <number> --remove-label wip`

### Monitoring

**Lock metrics to watch**:
- Frequency of "Locked by" exits (indicates concurrent runs)
- Stale lock warnings (indicates agent crashes)
- Lock acquisition failures (might indicate configuration issues)

Can be tracked via Reviewer agent events (add lock events to telemetry).

---

## Open Questions / Clarification Needed

**(These will be posted with the spec for review approval)**

### 1. Lock Scope: Where to Add Lock Checks?
**Question**: Should the lock check be added to ALL agents (triage, planner, dev, PM) or only long-running agents (planner, dev)?

**Context**:
- **Triage agent**: Runs in <10 seconds, low risk of collision
- **Planner agent**: Runs 1-3 minutes, medium risk
- **Dev agent**: Runs 5-15 minutes, high risk
- **PM agent**: Runs 2-5 minutes, medium risk

**Options**:
- **Option A**: Only planner + dev (current spec assumption)
- **Option B**: All agents (more overhead but safer)
- **Option C**: Configurable per agent (e.g., ENABLE_LOCK_PLANNER=true in .env)

**Current Assumption**: Option A (planner + dev only, triage is fast enough to skip)

---

### 2. Locked Issue Behavior: Skip or Exit?
**Question**: When an agent encounters a locked issue, should it:

**Options**:
- **Option A**: Exit immediately with graceful message (current spec)
- **Option B**: Skip to next issue in queue (requires multi-issue selection logic)
- **Option C**: Wait/retry after a delay (polling loop)

**Tradeoffs**:
- **Option A** (Exit): Simple, clean separation of runs, works with cron/orchestrator triggers
- **Option B** (Skip): Better resource utilization, but requires planner/dev to handle multiple issues per run
- **Option C** (Wait): Avoids wasted runs, but risks long-running processes if lock is held for 30min

**Current Assumption**: Option A (exit immediately — orchestrator will retry on next poll cycle)

---

### 3. Manual Unlock Command: Emergency Override?
**Question**: Should there be a manual unlock utility (e.g., `npm run unlock <issue-number>`) for emergency situations?

**Use Cases**:
- Agent crashed and lock is blocking next run (before 30min TTL expires)
- User wants to force-stop an agent and immediately re-run
- Debugging/testing scenarios

**Options**:
- **Option A**: Yes, add `npm run unlock <number>` script that calls `releaseLock()`
- **Option B**: No, users can manually remove `wip` label via `gh issue edit <number> --remove-label wip`
- **Option C**: Yes, but warn user about potential race conditions

**Current Assumption**: Option B (manual `gh` command is sufficient, no need for dedicated script)

---

## Success Criteria

| Criterion | Verification Method |
|-----------|---------------------|
| No duplicate PRs when running multiple dev instances | Run 2x `npm run dev` simultaneously → only 1 PR created |
| Locks expire after 30 minutes | Set lock with old timestamp → next run re-acquires |
| Locks are visible in GitHub UI | Check issue labels → `wip` label present during agent run |
| Locks are automatically released on success | Agent completes → `wip` label removed |
| Stale locks are detected and overridden | Lock >30min old → agent logs "Stale lock detected" and proceeds |
| Orchestrator respects locks | 3 issues, 2 agent instances → processed sequentially without duplication |

---

## Related Issues / Dependencies

- **Blocks**: #82 (Auto-Orchestrator) — concurrent agent runs require lock mechanism
- **Related**: PR #74 (Worktrees) — provides git-level isolation, this provides queue-level isolation
- **Enhances**: #79 (Cost Dashboard) — prevents wasted API tokens from duplicate work

---

## References

- [Worktree Implementation](../src/github.ts#L426-L495)
- [Label State Machine Pattern](../src/github.ts#L513-L610)
- [Timestamp-Based Detection](../src/github.ts#L88-L117)
- [Issue #75 Clarification Thread](https://github.com/guyklainer/atomo/issues/75#issuecomment-...)
