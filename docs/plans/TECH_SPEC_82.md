# TECH_SPEC_82: Auto-Orchestrator - Hands-Free Issue → PR Pipeline

**Priority Score: 5.33** (I=4, C=4, E=3)  
**Issue**: #82  
**Type**: Enhancement  
**Status**: Ready for Review

---

## Requirements

From issue #82:

**Core Problem:**
Users must manually trigger each agent in sequence (triage → plan → dev), creating:
- 4 min/issue in context switching overhead
- Error-prone workflow (skipping steps, forgetting to check state)
- Not scalable (30+ manual decisions for 10 issues)
- Deployment blocker (can't run on cron/CI without auto-triggering)

**Expected Behavior:**
Run `npm run watch` once → orchestrator polls GitHub → auto-triggers agents based on label state → hands-off automation.

**Configuration Requirements:**
- Poll interval (default: 5 min)
- Which agents to auto-run (triage/plan/dev - each toggleable)
- Max concurrent agents (default: 3, for rate limit protection)
- Dry-run mode for testing

**Safety Requirements:**
- Prevent double-execution of same agent
- Graceful shutdown on Ctrl+C (finish current, don't start new)
- Max concurrency enforcement (3 simultaneous agents)
- Transparent logging (show polling activity)

---

## Root Cause Analysis

**Current State:**
- Agents (triage.ts, planner.ts, dev.ts) are independent CLI commands
- Users manually check GitHub issue states
- Users manually decide which agent to run next
- No automation layer exists

**Gap:**
Need polling loop that:
1. Queries GitHub for issues in different states
2. Spawns appropriate agents based on label state machine
3. Manages concurrency and graceful shutdown
4. Logs activity for observability

---

## Pattern Discovery

**Existing Agent Patterns** (from codebase scan):

1. **Agent Entry Points** (triage.ts, planner.ts, dev.ts):
   - All follow pattern: async IIFE wrapping `runAgent()` call
   - Include deterministic pre-checks (e.g., `hasUntriagedIssues()`)
   - Execute via npm scripts: `"triage": "tsx src/triage.ts"`
   - Self-contained - no external parameters needed

2. **GitHub Querying** (from src/github.ts:38, src/planner.ts:192):
   - Use `gh()` helper from github.ts
   - Query pattern: `gh issue list --search "is:open label:X -label:Y" --limit N --json fields`
   - Label state machine:
     * `NOT:triaged` → trigger Gatekeeper (triage.ts)
     * `triaged -label:needs-review -label:for-dev -label:needs-info` → trigger Architect (planner.ts)
     * `for-dev -label:pr-ready -label:blocked` → trigger Dev (dev.ts)

3. **Concurrency via Worktrees** (src/github.ts:426-476):
   - `setupAgentWorktree(agentName)` creates isolated workspace
   - Unique random ID: `atomo-{agentName}-{runId}` (e.g., `atomo-Planner-a3f8c2`)
   - Different agents can run in parallel (different directories)
   - Cleanup: `cleanupAgentWorktree(worktreePath)`

4. **Process Spawning Patterns** (Node.js child_process):
   - Use `spawn()` for long-running processes (better than `execSync` for agents)
   - Track child process PIDs
   - Listen for 'exit' event to know when complete
   - `stdio: 'inherit'` passes through agent logs to orchestrator console

5. **Signal Handling** (Node.js process events):
   - `process.on('SIGINT', handler)` intercepts Ctrl+C
   - Set shutdown flag, wait for children to exit
   - No existing signal handlers in codebase (new pattern for orchestrator)

---

## Target Files

### Files to CREATE:
1. **src/orchestrator.ts** (~250 LOC) — Main polling loop and agent spawner

### Files to MODIFY:
1. **package.json** — Add `"watch": "tsx src/orchestrator.ts"` script
2. **.env.example** — Add orchestrator configuration section
3. **README.md** — Add "Automated Mode" section documenting `npm run watch`

### Files to READ (for context):
- src/triage.ts, src/planner.ts, src/dev.ts — Understand agent entry points
- src/github.ts — Reuse gh() helper
- src/runner.ts — Understand runAgent() flow (for logging compatibility)

---

## Implementation Roadmap

### Phase 1: Core Orchestrator Structure

**1.1 Create src/orchestrator.ts skeleton**

```typescript
import 'dotenv/config';
import { spawn } from 'child_process';
import { gh } from './github.js';

// Configuration from .env
const POLL_INTERVAL_MS = parseInt(process.env.ORCHESTRATOR_POLL_INTERVAL || '300000', 10); // 5 min
const AUTO_TRIAGE = process.env.ORCHESTRATOR_AUTO_TRIAGE !== 'false'; // default true
const AUTO_PLAN = process.env.ORCHESTRATOR_AUTO_PLAN !== 'false'; // default true
const AUTO_DEV = process.env.ORCHESTRATOR_AUTO_DEV === 'true'; // default false (safety)
const MAX_CONCURRENT = parseInt(process.env.ORCHESTRATOR_MAX_CONCURRENT || '3', 10);
const DRY_RUN = process.argv.includes('--dry-run');

// Track running agents
const runningAgents = new Set<number>(); // Set of child PIDs
let shutdownRequested = false;

async function main() {
  console.log('[Orchestrator] Starting in', DRY_RUN ? 'DRY-RUN' : 'LIVE', 'mode');
  console.log(`[Orchestrator] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[Orchestrator] Auto-triage: ${AUTO_TRIAGE}, Auto-plan: ${AUTO_PLAN}, Auto-dev: ${AUTO_DEV}`);
  console.log(`[Orchestrator] Max concurrent agents: ${MAX_CONCURRENT}`);
  
  // Install signal handler for graceful shutdown
  process.on('SIGINT', handleShutdown);
  
  // Start polling loop
  await pollLoop();
}

main().catch(console.error);
```

**1.2 Implement polling loop**

```typescript
async function pollLoop() {
  while (!shutdownRequested) {
    try {
      await pollAndTrigger();
    } catch (error) {
      console.error('[Orchestrator] Poll cycle error:', error);
    }
    
    // Wait for next poll (unless shutdown requested)
    if (!shutdownRequested) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  
  console.log('[Orchestrator] Shutdown requested. Waiting for running agents to complete...');
  await waitForRunningAgents();
  console.log('[Orchestrator] All agents complete. Exiting gracefully.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**1.3 Implement shutdown handler**

```typescript
function handleShutdown() {
  if (shutdownRequested) {
    console.log('[Orchestrator] Force shutdown (Ctrl+C again). Exiting immediately.');
    process.exit(1);
  }
  
  console.log('[Orchestrator] Shutdown requested (Ctrl+C). Will finish current agents and exit.');
  console.log('[Orchestrator] Press Ctrl+C again to force-quit.');
  shutdownRequested = true;
}

async function waitForRunningAgents() {
  while (runningAgents.size > 0) {
    console.log(`[Orchestrator] Waiting for ${runningAgents.size} agent(s) to complete...`);
    await sleep(5000); // Check every 5 seconds
  }
}
```

---

### Phase 2: GitHub Polling & Agent Triggering

**2.1 Query GitHub for issues needing agents**

```typescript
async function pollAndTrigger() {
  console.log(`[Orchestrator] Polling GitHub... (${new Date().toISOString()})`);
  
  // Query 1: Untriaged issues (for Gatekeeper)
  let untriagedCount = 0;
  if (AUTO_TRIAGE) {
    const untriaged = gh('issue', 'list', '--search', 'is:open -label:triaged -label:for-dev', '--limit', '50', '--json', 'number');
    untriagedCount = untriaged.length;
    if (untriagedCount > 0) {
      console.log(`[Orchestrator] Found ${untriagedCount} untriaged issue(s)`);
      await triggerAgent('triage', 'Gatekeeper', untriagedCount);
    }
  }
  
  // Query 2: Triaged issues needing planning (for Architect)
  let triagedCount = 0;
  if (AUTO_PLAN) {
    const triaged = gh('issue', 'list', '--search', 'is:open label:triaged -label:for-dev -label:needs-review -label:needs-info', '--limit', '50', '--json', 'number');
    triagedCount = triaged.length;
    if (triagedCount > 0) {
      console.log(`[Orchestrator] Found ${triagedCount} triaged issue(s) needing planning`);
      await triggerAgent('plan', 'Architect', triagedCount);
    }
  }
  
  // Query 3: Approved issues ready for dev (for Dev Agent)
  let approvedCount = 0;
  if (AUTO_DEV) {
    const approved = gh('issue', 'list', '--search', 'is:open label:for-dev -label:pr-ready -label:blocked', '--limit', '50', '--json', 'number');
    approvedCount = approved.length;
    if (approvedCount > 0) {
      console.log(`[Orchestrator] Found ${approvedCount} approved issue(s) ready for dev`);
      await triggerAgent('dev', 'Dev', approvedCount);
    }
  }
  
  if (untriagedCount === 0 && triagedCount === 0 && approvedCount === 0) {
    console.log('[Orchestrator] No issues found. Idling...');
  }
}
```

**2.2 Implement agent spawning with concurrency control**

```typescript
async function triggerAgent(npmScript: string, agentName: string, issueCount: number) {
  // Check shutdown flag
  if (shutdownRequested) {
    console.log(`[Orchestrator] Skipping ${agentName} (shutdown requested)`);
    return;
  }
  
  // Check concurrency limit
  if (runningAgents.size >= MAX_CONCURRENT) {
    console.log(`[Orchestrator] Concurrency limit reached (${MAX_CONCURRENT}). Skipping ${agentName} for now.`);
    return;
  }
  
  // Dry-run mode: log only
  if (DRY_RUN) {
    console.log(`[Orchestrator] [DRY-RUN] Would trigger: npm run ${npmScript} (${issueCount} issue(s))`);
    return;
  }
  
  // Spawn agent as child process
  console.log(`[Orchestrator] Triggering ${agentName} (npm run ${npmScript})...`);
  const child = spawn('npm', ['run', npmScript], {
    stdio: 'inherit', // Pass through logs to orchestrator console
    env: process.env,
  });
  
  const pid = child.pid!;
  runningAgents.add(pid);
  console.log(`[Orchestrator] ${agentName} started (PID: ${pid}). Running agents: ${runningAgents.size}/${MAX_CONCURRENT}`);
  
  // Listen for exit
  child.on('exit', (code, signal) => {
    runningAgents.delete(pid);
    if (code === 0) {
      console.log(`[Orchestrator] ${agentName} completed successfully (PID: ${pid}). Running agents: ${runningAgents.size}/${MAX_CONCURRENT}`);
    } else {
      console.error(`[Orchestrator] ${agentName} failed with code ${code} (PID: ${pid})`);
    }
  });
  
  child.on('error', (error) => {
    runningAgents.delete(pid);
    console.error(`[Orchestrator] ${agentName} spawn error (PID: ${pid}):`, error);
  });
}
```

---

### Phase 3: Configuration & Documentation

**3.1 Update .env.example**

Add section after existing ANTHROPIC_API_KEY:

```bash
# -----------------------------------------------------------------------------
# OPTIONAL: Auto-Orchestrator Configuration
# -----------------------------------------------------------------------------
# Enable hands-free automation: npm run watch
# Orchestrator polls GitHub and auto-triggers agents based on issue labels

# Poll interval in milliseconds (default: 300000 = 5 minutes)
ORCHESTRATOR_POLL_INTERVAL=300000

# Auto-trigger Gatekeeper for untriaged issues (default: true)
ORCHESTRATOR_AUTO_TRIAGE=true

# Auto-trigger Architect for triaged issues (default: true)
ORCHESTRATOR_AUTO_PLAN=true

# Auto-trigger Dev for approved issues (default: false - requires manual approval)
ORCHESTRATOR_AUTO_DEV=false

# Max concurrent agents (default: 3 - prevents API rate limits)
ORCHESTRATOR_MAX_CONCURRENT=3
```

**3.2 Update package.json scripts**

Add after existing `"release"` script:

```json
"watch": "tsx src/orchestrator.ts"
```

**3.3 Update README.md**

Add section after "Commands":

```markdown
### Automated Mode (Hands-Free)

For continuous automation, run the orchestrator in watch mode:

```bash
npm run watch
```

The orchestrator will:
- Poll GitHub every 5 minutes (configurable via `ORCHESTRATOR_POLL_INTERVAL`)
- Auto-trigger agents based on issue labels
- Run up to 3 agents concurrently (configurable via `ORCHESTRATOR_MAX_CONCURRENT`)
- Gracefully shutdown on Ctrl+C (finish current agents, don't start new)

**Configuration** (in `.env`):
- `ORCHESTRATOR_AUTO_TRIAGE=true` — Auto-run Gatekeeper for untriaged issues
- `ORCHESTRATOR_AUTO_PLAN=true` — Auto-run Architect for triaged issues
- `ORCHESTRATOR_AUTO_DEV=false` — Manual Dev trigger (safety default)

**Dry-run mode** (test without executing agents):
```bash
npm run watch -- --dry-run
```

**Deployment**: See issue #80 for running orchestrator in cron/systemd/GitHub Actions.
```

---

## Edge Cases & Error Handling

1. **Agent Failure**: Child process exits with non-zero code → log error, continue orchestrator
2. **API Rate Limits**: Enforced by MAX_CONCURRENT (default: 3) + existing retry logic in runAgent()
3. **Double Execution**: Prevented by concurrency tracking (runningAgents Set) + agent pre-checks (e.g., hasUntriagedIssues())
4. **Shutdown During Agent Run**: Orchestrator waits indefinitely for current agents (or user force-quits with Ctrl+C twice)
5. **Configuration Parse Errors**: Use parseInt() with defaults, warn if invalid
6. **GitHub CLI Unavailable**: `gh()` will throw → caught in poll cycle, logged, retry on next interval

---

## Testing Strategy

**Manual Testing:**
1. Create 3 untriaged issues
2. Run `npm run watch -- --dry-run` → verify it logs "Would trigger: npm run triage (3 issues)"
3. Run `npm run watch` (live mode) → verify it spawns triage agent
4. Verify logs show PID tracking and completion messages
5. Press Ctrl+C once → verify "Shutdown requested" message, waits for agent
6. Press Ctrl+C twice → verify force-quit

**Integration Testing:**
1. Create issue pipeline: untriaged → triaged → for-dev
2. Run orchestrator with AUTO_TRIAGE=true, AUTO_PLAN=true, AUTO_DEV=false
3. Verify issue moves through triage → planning → stops at for-dev (awaits manual approval)
4. Manually comment "APPROVED" on issue
5. Set AUTO_DEV=true, restart orchestrator
6. Verify dev agent triggers and creates PR

**Concurrency Testing:**
1. Create 5 untriaged issues
2. Set MAX_CONCURRENT=2
3. Run orchestrator
4. Verify only 2 agents run simultaneously (check PID count in logs)
5. Verify 3rd agent waits until first completes

---

## Rollout Plan

**Phase 1: Merge & Document** (Issue #82)
- Merge orchestrator.ts implementation
- Update .env.example, package.json, README.md
- Default: AUTO_DEV=false (safety - requires manual approval)

**Phase 2: User Testing** (Beta)
- Maintainers test on real repos with AUTO_TRIAGE=true, AUTO_PLAN=true
- Collect feedback on poll intervals, concurrency limits
- Monitor for edge cases (crashes, deadlocks)

**Phase 3: Full Automation** (After #80 Deployment Guide)
- Document cron/systemd/GitHub Actions setup
- Enable AUTO_DEV=true for trusted repos
- Full hands-off automation unlocked

---

## Success Metrics

1. ✅ User creates 10 issues → gets 10 PRs with **ZERO manual `npm run` commands** (only `npm run watch` once)
2. ✅ Orchestrator runs for 24 hours without crashes
3. ✅ Concurrency limit enforced (never exceeds MAX_CONCURRENT)
4. ✅ Graceful shutdown completes within 30 seconds for short agents, indefinitely for long agents
5. ✅ Dry-run mode accurately predicts which agents would trigger
6. ✅ Enables #80 Deployment Guide (cron/CI examples)

---

## Dependencies & Blockers

**Dependencies:**
- Node.js child_process (built-in)
- Existing agents (triage.ts, planner.ts, dev.ts) - already implemented
- GitHub CLI (gh) - already used throughout codebase

**Blockers:**
- None (all dependencies exist)

**Prerequisite for:**
- Issue #80: Deployment Playbook (needs orchestrator for cron/CI examples)

---

## Risk Assessment

**Low Risk:**
- Reuses existing agent entry points (no changes to agents)
- Child process spawning is standard Node.js pattern
- Concurrency via Set tracking is simple and reliable
- Dry-run mode allows safe testing

**Medium Risk:**
- Signal handling (SIGINT) is new pattern for this codebase
  * Mitigation: Force-quit on second Ctrl+C (escape hatch)
- Indefinite wait on graceful shutdown could frustrate users
  * Mitigation: Clear messaging ("Press Ctrl+C again to force-quit")

**High Risk:**
- None

---

## Alternative Approaches Considered

**Approach 1: Webhook-based (REJECTED)**
- Trigger agents via GitHub webhooks on issue label changes
- **Cons**: Requires external server, breaks local-first architecture, privacy concerns
- **Why Rejected**: Violates core Atomo principle (local-first, no data leaves machine)

**Approach 2: Cron Jobs (REJECTED)**
- Run each agent separately via cron (e.g., `*/5 * * * * npm run triage`)
- **Cons**: No concurrency control, no unified shutdown, 3 separate cron entries, no dry-run mode
- **Why Rejected**: Less maintainable, harder to configure

**Approach 3: Direct runAgent() Calls (REJECTED)**
- Orchestrator imports and calls runAgent() directly (bypass triage.ts/planner.ts/dev.ts)
- **Cons**: Duplicates agent configuration logic, tightly couples orchestrator to agent internals
- **Why Rejected**: Less maintainable, violates separation of concerns

**Selected Approach: Child Process Spawning**
- ✅ Reuses existing agent entry points (no duplication)
- ✅ Clean separation (orchestrator = scheduler, agents = workers)
- ✅ Easy concurrency tracking via PID Set
- ✅ Standard Node.js pattern (spawn, signal handling)

---

## Open Questions for Review

(These will be addressed in clarification questions - see STEP 2)
