# Performance Reviewer Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a meta-agent that observes all Atomo agents via structured event logs, computes per-agent performance signals, and emits reports + soft hints + protocol-change PRs — staying silent on healthy weeks.

**Architecture:** `runner.ts` gains a parallel JSONL event write path (run_start, tool_call, reasoning, api_error, run_complete) alongside daily-dated human-readable logs. A new `reviewer.ts` entry point reads the JSONL delta since its last run, pre-aggregates raw event counts in TypeScript, passes aggregated stats to a reviewer LLM that writes the report, overwrites hint files, and opens a PR on the Atomo repo when a signal crosses its configured threshold. Three-tier output (report / hints / PR) with window-based averaging and 14-day cooldown per signal prevents alert fatigue.

**Tech Stack:** TypeScript (ESM), `@anthropic-ai/claude-agent-sdk`, Node.js `fs`/`path`/`assert`, `gh` CLI (read-only calls to target repo), git CLI (Atomo repo only)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/runner.ts` | Add JSONL event emission, daily-dated log files, token capture |
| Create | `src/reviewer.ts` | Reviewer entry point — delta read, pre-aggregation, LLM invocation |
| Create | `protocols/reviewer.md` | Reviewer LLM behavioral protocol |
| Create | `reviewer_context/thresholds.json` | Human-editable signal thresholds + model pricing |
| Create | `reviewer_context/last_review.json` | Delta cursor + active cooldowns |
| Create | `reviewer_context/hints/triage.md` | Soft hints for Gatekeeper (seeded empty) |
| Create | `reviewer_context/hints/planner.md` | Soft hints for Architect (seeded empty) |
| Create | `reviewer_context/hints/dev.md` | Soft hints for Dev Agent (seeded empty) |
| Create | `reviewer_context/hints/pm.md` | Soft hints for PM Agent (seeded empty) |
| Create | `scripts/verify-events.ts` | Verification script: checks JSONL output after a run |
| Modify | `src/triage.ts` | Load and inject `reviewer_context/hints/triage.md` |
| Modify | `src/planner.ts` | Load and inject `reviewer_context/hints/planner.md` |
| Modify | `src/dev.ts` | Load and inject `reviewer_context/hints/dev.md` |
| Modify | `src/pm.ts` | Load and inject `reviewer_context/hints/pm.md` |
| Modify | `package.json` | Add `"review": "tsx src/reviewer.ts"` script |

---

## Task 1: Verification Script (write first — TDD)

**Files:**
- Create: `scripts/verify-events.ts`

- [ ] **Step 1.1: Write the verification script**

```typescript
// scripts/verify-events.ts
// Run after any agent run to verify JSONL event output is correct.
// Usage: npx tsx scripts/verify-events.ts logs/events/YYYY-MM-DD.jsonl triage
import fs from 'fs';
import assert from 'assert';

const [,, jsonlPath, agentName] = process.argv;
if (!jsonlPath || !agentName) {
  console.error('Usage: npx tsx scripts/verify-events.ts <jsonl-path> <agent-name>');
  process.exit(1);
}

if (!fs.existsSync(jsonlPath)) {
  console.error(`FAIL: JSONL file not found: ${jsonlPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n').filter(Boolean);
const events = lines.map((l, i) => {
  try { return JSON.parse(l); }
  catch { console.error(`FAIL: Invalid JSON on line ${i + 1}: ${l}`); process.exit(1); }
});

const agentEvents = events.filter((e: any) => e.agent === agentName);

assert(agentEvents.length > 0, `No events found for agent "${agentName}"`);

const startEvents = agentEvents.filter((e: any) => e.event === 'run_start');
assert(startEvents.length > 0, 'Missing run_start event');
assert(typeof startEvents[0].run_id === 'string', 'run_start missing run_id');
assert(typeof startEvents[0].ts === 'string', 'run_start missing ts');

const completeEvents = agentEvents.filter((e: any) => e.event === 'run_complete');
assert(completeEvents.length > 0, 'Missing run_complete event');
const complete = completeEvents[0];
assert(typeof complete.duration_ms === 'number', 'run_complete missing duration_ms');
assert(complete.status === 'ok' || complete.status === 'error', 'run_complete invalid status');
assert('input_tokens' in complete, 'run_complete missing input_tokens');
assert('output_tokens' in complete, 'run_complete missing output_tokens');

const toolEvents = agentEvents.filter((e: any) => e.event === 'tool_call');
toolEvents.forEach((e: any) => {
  assert(typeof e.tool === 'string', 'tool_call missing tool name');
  assert(typeof e.run_id === 'string', 'tool_call missing run_id');
});

const reasoningEvents = agentEvents.filter((e: any) => e.event === 'reasoning');
reasoningEvents.forEach((e: any) => {
  assert(typeof e.chars === 'number', 'reasoning missing chars');
});

console.log(`✅ PASS: ${agentEvents.length} events for "${agentName}" — structure valid`);
console.log(`   run_start: ${startEvents.length}, tool_calls: ${toolEvents.length}, reasoning: ${reasoningEvents.length}, run_complete: ${completeEvents.length}`);
```

- [ ] **Step 1.2: Run it — confirm it fails (no JSONL file yet)**

```bash
npx tsx scripts/verify-events.ts logs/events/$(date +%Y-%m-%d).jsonl triage
```

Expected output: `FAIL: JSONL file not found: logs/events/YYYY-MM-DD.jsonl`

- [ ] **Step 1.3: Commit the verification script**

```bash
git add scripts/verify-events.ts
git commit -m "test: add JSONL event structure verification script"
```

---

## Task 2: Enhance runner.ts — JSONL Events + Daily Log Rotation

**Files:**
- Modify: `src/runner.ts`

- [ ] **Step 2.1: Write the new runner.ts**

Replace the entire contents of `src/runner.ts` with:

```typescript
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const atomoCwd = path.join(__dirname, '..');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getNow(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendEvent(jsonlPath: string, event: Record<string, unknown>): void {
  fs.appendFileSync(jsonlPath, JSON.stringify(event) + '\n', 'utf-8');
}

function isOverloadedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('overloaded_error');
}

export async function runAgent(agentName: string, prompt: string, options: Options) {
  const today = getTodayString();
  const runId = `${agentName.slice(0, 3).toLowerCase()}-${Date.now()}`;
  const startTime = Date.now();

  // Set up daily log paths (scoped to Atomo repo, never TARGET_REPO_PATH)
  const logDir = path.join(atomoCwd, 'logs', agentName);
  const eventsDir = path.join(atomoCwd, 'logs', 'events');
  ensureDir(logDir);
  ensureDir(eventsDir);

  const logPath = path.join(logDir, `${today}.log`);
  const jsonlPath = path.join(eventsDir, `${today}.jsonl`);

  // log() writes to both stdout (for cron capture) and the dated log file
  function log(line: string): void {
    console.log(line);
    fs.appendFileSync(logPath, line + '\n', 'utf-8');
  }

  log(`[${agentName}] Starting Pipeline...`);
  appendEvent(jsonlPath, {
    ts: getNow(), run_id: runId, agent: agentName, event: 'run_start',
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = query({ prompt, options });

      for await (const message of stream) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              log(`[Reasoning]: ${block.text}`);
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'reasoning', chars: block.text.length,
              });
            } else if (block.type === 'tool_use') {
              log(`[Tool Call]: Initiating ${block.name}...`);
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'tool_call', tool: block.name,
              });
            }
          }
        } else if (message.type === 'result') {
          log(`[${agentName}] Pipeline execution complete.`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = (message as any).usage ?? null;
          appendEvent(jsonlPath, {
            ts: getNow(), run_id: runId, agent: agentName,
            event: 'run_complete',
            input_tokens: usage?.input_tokens ?? null,
            output_tokens: usage?.output_tokens ?? null,
            duration_ms: Date.now() - startTime,
            status: 'ok',
          });
        }
      }
      return;

    } catch (error) {
      if (isOverloadedError(error) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log(`[${agentName}] API overloaded. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'api_error', type: 'overloaded', attempt,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        log(`[${agentName}] encountered an error: ${String(error)}`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'run_complete',
          input_tokens: null, output_tokens: null,
          duration_ms: Date.now() - startTime,
          status: 'error',
        });
        return;
      }
    }
  }
}
```

- [ ] **Step 2.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3: Run a real agent to generate JSONL (use triage — cheapest)**

```bash
npm run triage 2>&1 | tail -5
```

Expected: `[Gatekeeper] Pipeline execution complete.` or `[Gatekeeper] No untriaged issues found. Skipping LLM invocation.`

- [ ] **Step 2.4: Verify the dated log file was created**

```bash
ls logs/triage/
```

Expected: `2026-04-24.log` (today's date)

- [ ] **Step 2.5: Run the verification script**

```bash
npx tsx scripts/verify-events.ts logs/events/$(date +%Y-%m-%d).jsonl Gatekeeper
```

Expected: `✅ PASS: N events for "Gatekeeper" — structure valid`

Note: If triage skipped the LLM (no untriaged issues), the JSONL will still have a `run_start` — but no `run_complete` from the LLM path. In that case, confirm the dated log exists and the JSONL file has at least a `run_start` event. The verification script check is for a full LLM run.

- [ ] **Step 2.6: Commit**

```bash
git add src/runner.ts
git commit -m "feat: add JSONL event stream and daily log rotation to runner"
```

---

## Task 3: Seed reviewer_context Directory

**Files:**
- Create: `reviewer_context/thresholds.json`
- Create: `reviewer_context/last_review.json`
- Create: `reviewer_context/hints/triage.md`
- Create: `reviewer_context/hints/planner.md`
- Create: `reviewer_context/hints/dev.md`
- Create: `reviewer_context/hints/pm.md`
- Create: `reviewer_context/reports/.gitkeep`

- [ ] **Step 3.1: Create thresholds.json**

Create `reviewer_context/thresholds.json`:

```json
{
  "triage": {
    "needs_info_rate":    { "max": 0.35, "window_days": 7 },
    "tokens_per_issue":   { "max": 6000, "window_days": 7 },
    "tool_calls_per_issue": { "max": 15, "window_days": 7 },
    "error_rate":         { "max": 0.20, "window_days": 7 }
  },
  "planner": {
    "first_pass_approval_rate": { "min": 0.50, "window_days": 14 },
    "tokens_per_spec":          { "max": 25000, "window_days": 7 },
    "tool_calls_per_spec":      { "max": 40, "window_days": 7 },
    "feedback_loop_depth":      { "max": 2.0, "window_days": 14 }
  },
  "dev": {
    "pr_merge_rate":      { "min": 0.70, "window_days": 30 },
    "tokens_per_pr":      { "max": 60000, "window_days": 14 },
    "error_rate":         { "max": 0.20, "window_days": 7 }
  },
  "pm": {
    "proposal_pass_rate": { "min": 0.30, "window_days": 7 },
    "tokens_per_proposal":{ "max": 15000, "window_days": 7 },
    "error_rate":         { "max": 0.20, "window_days": 7 }
  },
  "all": {
    "run_completion_rate":{ "min": 0.90, "window_days": 7 },
    "cost_per_run_usd":   { "max": 2.00, "window_days": 7 }
  },
  "model_pricing": {
    "input_per_1k_tokens": 0.003,
    "output_per_1k_tokens": 0.015,
    "note": "USD. Update when model changes."
  },
  "pr_cooldown_days": 14,
  "pr_worsening_threshold": 0.20
}
```

- [ ] **Step 3.2: Create last_review.json**

Create `reviewer_context/last_review.json`:

```json
{
  "last_reviewed_at": "2026-01-01T00:00:00.000Z",
  "cooldowns": {}
}
```

Note: `last_reviewed_at` is intentionally set to the past so the first reviewer run processes all available JSONL history.

- [ ] **Step 3.3: Create empty hint files**

Create `reviewer_context/hints/triage.md`:
```markdown
# Reviewer Hints — (none yet)
No behavioral hints from the reviewer. Running normally.
```

Create `reviewer_context/hints/planner.md`:
```markdown
# Reviewer Hints — (none yet)
No behavioral hints from the reviewer. Running normally.
```

Create `reviewer_context/hints/dev.md`:
```markdown
# Reviewer Hints — (none yet)
No behavioral hints from the reviewer. Running normally.
```

Create `reviewer_context/hints/pm.md`:
```markdown
# Reviewer Hints — (none yet)
No behavioral hints from the reviewer. Running normally.
```

- [ ] **Step 3.4: Create reports directory placeholder**

```bash
mkdir -p reviewer_context/reports
touch reviewer_context/reports/.gitkeep
```

- [ ] **Step 3.5: Type-check and commit**

```bash
npx tsc --noEmit
git add reviewer_context/
git commit -m "feat: seed reviewer_context directory structure"
```

---

## Task 4: Write protocols/reviewer.md

**Files:**
- Create: `protocols/reviewer.md`

- [ ] **Step 4.1: Create the reviewer protocol**

Create `protocols/reviewer.md`:

````markdown
# Atomo Performance Reviewer Protocol

**Version**: 1.0

You are the Atomo Performance Reviewer. You observe all other Atomo agents over time,
detect behavioral and efficiency regressions, and propose targeted improvements.

## Isolation Constraint (CRITICAL)

You operate ENTIRELY within the Atomo repo. You MUST NOT create issues, open PRs, push
branches, or write any files in the target repo (`TARGET_REPO_PATH`).

All git/gh WRITE operations: use `atomoCwd` (the Atomo repo path, passed to you in the prompt).
GitHub READ-ONLY calls to target repo (e.g. `gh issue list`, `gh pr list`): permitted.

---

## Input

Your prompt contains:
1. **Pre-aggregated event stats** — per-agent counts already extracted from JSONL delta
2. **Delta window** — start and end timestamps
3. **Thresholds** — from `reviewer_context/thresholds.json`
4. **Active cooldowns** — signals currently suppressed
5. **atomoCwd** — absolute path to the Atomo repo

---

## STEP 1: Parse Aggregated Stats

Read the pre-aggregated stats from your prompt. They are provided in this format per agent:

```
Agent: <name>
  runs: N
  ok_runs: N
  error_runs: N
  total_input_tokens: N
  total_output_tokens: N
  tool_calls_by_name: { Bash: N, Read: N, ... }
  reasoning_chars_total: N
  reasoning_block_count: N
  api_errors: N
  durations_ms: [N, N, ...]
```

---

## STEP 2: Compute Signals

Compute the following for each agent using ONLY the provided aggregated stats + GitHub
read-only calls. Show your work in your reasoning.

### Gatekeeper (agent name "Gatekeeper")
- `run_completion_rate` = ok_runs / runs
- `error_rate` = api_errors / runs
- `tokens_per_run` = (total_input_tokens + total_output_tokens) / runs
- `tool_calls_per_run` = sum(tool_calls_by_name values) / runs
- `reasoning_verbosity` = reasoning_chars_total / reasoning_block_count (or 0 if no blocks)
- `needs_info_rate` = fetch from target repo: `gh issue list --search "is:open label:needs-info" --json number` count / `gh issue list --search "label:triaged" --json number` count (read-only, target repo)
- `cost_per_run_usd` = ((total_input_tokens/1000 * input_price) + (total_output_tokens/1000 * output_price)) / runs
- `p95_duration_ms` = sort durations_ms, take value at index floor(N * 0.95)

### Architect (agent name "Architect")
- `run_completion_rate`, `error_rate`, `tokens_per_run`, `tool_calls_per_run`, `cost_per_run_usd`, `p95_duration_ms` — same formulas as Gatekeeper
- `first_pass_approval_rate` = fetch from target repo: count of specs with APPROVED in comments on first bot comment / total specs (use `gh issue list --search "label:needs-review" --json number,comments` — read-only)
- `feedback_loop_depth` = average number of comment rounds before APPROVED across recent specs

### Dev (agent name "AtomoDev" or "Dev")
- `run_completion_rate`, `error_rate`, `tokens_per_run`, `tool_calls_per_run`, `cost_per_run_usd`, `p95_duration_ms` — same formulas
- `pr_merge_rate` = fetch from target repo: `gh pr list --state merged --json number` count in window / `gh pr list --state all --json number,createdAt` count in window (read-only)
- `tool_call_ratio` = read_tools / write_tools where:
  - read_tools = tool_calls_by_name.Read + tool_calls_by_name.Grep + tool_calls_by_name.Glob
  - write_tools = tool_calls_by_name.Edit + tool_calls_by_name.Write

### PM (agent name "PM" or "pm")
- `run_completion_rate`, `error_rate`, `tokens_per_run`, `tool_calls_per_run`, `cost_per_run_usd`, `p95_duration_ms` — same formulas
- `proposal_pass_rate` = use Read tool on `pm_context/rejected_proposals.md` (in atomoCwd) to count rejections in window / estimate total proposals
- `resurrection_rate` = use Read tool on `pm_context/revalidation_log.md` to count resurrected proposals / revalidation runs

---

## STEP 3: Evaluate Thresholds

For each signal with a threshold defined, compare computed value against threshold.
Skip any signal that has an active cooldown (from the cooldowns map in your prompt).

Mark each signal: ✅ (healthy) | ⚠️ (below/above threshold).

---

## STEP 4: Write Report (ALWAYS)

Use the Write tool to create `{atomoCwd}/reviewer_context/reports/{YYYY-MM-DD}.md`:

```markdown
# Atomo Performance Review — {DATE}
**Delta**: {start} → {end} | **Runs analyzed**: {total_runs}

## Summary
{one line per agent: ✅ Agent — healthy | ⚠️ Agent — {signal}: {value} (threshold: {threshold})}

## Signal Detail
{For each agent: table of signals with value, threshold, status}
{For ⚠️ agents: Observation paragraph citing specific evidence}

## Cost Summary
| Agent | Runs | Avg input tokens | Avg output tokens | Est. cost/run |
...

## Actions Taken
{list: hints updated, PR opened, or "None — all signals healthy"}
```

---

## STEP 5: Write Hint Files (Tier 2)

For each agent with ⚠️ signals NOT covered by a cooldown:
- Write a hint file to `{atomoCwd}/reviewer_context/hints/{agent_short_name}.md`
- `agent_short_name`: Gatekeeper → triage, Architect → planner, AtomoDev/Dev → dev, PM → pm

Hint file rules:
- Maximum 5 bullet points
- Each bullet: one concrete, actionable sentence
- Do NOT repeat protocol text verbatim
- Do NOT include scoring tables or thresholds — just behavioral guidance
- Format:

```markdown
# Reviewer Hints — {DATE}
- {specific behavioral nudge}
- {specific behavioral nudge}
```

For agents with no ⚠️ signals, write:
```markdown
# Reviewer Hints — {DATE}
No behavioral hints. Running normally.
```

---

## STEP 6: Open Protocol PR (Tier 3 — only if threshold crossed AND no active cooldown)

If any signal crossed its threshold (⚠️) AND that signal has no active cooldown:

### 6a. Identify the protocol file to change

| Agent | Threshold signals → Protocol file |
|-------|-----------------------------------|
| Gatekeeper | `protocols/triage.md` |
| Architect | `protocols/planning.md` |
| Dev | `protocols/atomo_dev.md` |
| PM | `protocols/pm.ts` (via pm_self_improvement.md) |
| Cross-cutting | `protocols/confidence_gate.md` or relevant file |

### 6b. Read the protocol file

Use the Read tool on `{atomoCwd}/protocols/{file}`.

### 6c. Propose a surgical edit

Identify the minimum text change that addresses the behavioral pattern.
Do NOT rewrite sections. Change only the text that needs to change.

### 6d. Create a branch and commit the change

```bash
git -C {atomoCwd} checkout -b review/{YYYY-MM-DD}
```

Use the Edit tool to make the surgical change to the protocol file.

```bash
git -C {atomoCwd} add protocols/{file}
git -C {atomoCwd} commit -m "review: {one-line description of change}"
```

### 6e. Open a PR on the Atomo repo

```bash
gh pr create \
  --repo {atomo_repo_slug} \
  --head review/{YYYY-MM-DD} \
  --title "review: {signal} — {agent} ({value} vs threshold {threshold})" \
  --body "## What triggered this
Signal: {signal} = {value} over {window_days}d (threshold: {threshold})
Evidence: {2-3 sentences citing specific log/GitHub data}

## Proposed change
\`protocols/{file}\` — {Section name}

Before:
> {exact old text}

After:
> {exact new text}

## Expected outcome
- {specific behavioral change}
- Signal should recover within {N} runs

## Cooldown
This signal suppressed for 14 days after merge."
```

All protocol changes for this review run go into ONE PR, ONE branch. If multiple agents have threshold violations, bundle all changes into the single `review/{YYYY-MM-DD}` branch.

---

## STEP 7: Update Delta Cursor

Use the Write tool to update `{atomoCwd}/reviewer_context/last_review.json`:

```json
{
  "last_reviewed_at": "{end_timestamp_ISO}",
  "cooldowns": {
    "{agent}.{signal}": "{now + 14 days ISO}",
    ...existing cooldowns that haven't expired...
  }
}
```

Only add cooldowns for signals where you opened a PR in STEP 6.
Remove cooldowns whose expiry date is in the past.

---

## Exit Condition

If no JSONL events exist since `last_reviewed_at` (pre-aggregated stats are all zeros/empty),
output: `[Reviewer] No delta since last run. Exiting.` and stop. Do NOT write a report or update the cursor.
````

- [ ] **Step 4.2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4.3: Commit**

```bash
git add protocols/reviewer.md
git commit -m "feat: add reviewer LLM behavioral protocol"
```

---

## Task 5: Add Hint Loading to All Four Agents

**Files:**
- Modify: `src/triage.ts`
- Modify: `src/planner.ts`
- Modify: `src/dev.ts`
- Modify: `src/pm.ts`

Pattern: add a `loadHint()` helper and inject the hint into the existing system prompt string.

- [ ] **Step 5.1: Add hint loading to triage.ts**

After the existing `loadProtocol` function definition (line 12), add:

```typescript
const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const TRIAGE_HINT = loadHint('triage');
```

Then in the `SYSTEM_PROMPT` string, after `${CONFIDENCE_PROTO}` and before the closing backtick, add:

```
${TRIAGE_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${TRIAGE_HINT}` : ''}
```

- [ ] **Step 5.2: Add hint loading to planner.ts**

After the existing `loadProtocol` function definition, add:

```typescript
const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const PLANNER_HINT = loadHint('planner');
```

Find the system prompt string in planner.ts and add before the closing backtick:

```
${PLANNER_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${PLANNER_HINT}` : ''}
```

- [ ] **Step 5.3: Add hint loading to dev.ts**

After the existing `const __dirname = ...` setup, add:

```typescript
const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const DEV_HINT = loadHint('dev');
```

Find the system prompt string in dev.ts and add before the closing backtick:

```
${DEV_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${DEV_HINT}` : ''}
```

- [ ] **Step 5.4: Add hint loading to pm.ts**

After `const CLAUDE_MD = fs.readFileSync(...)`, add:

```typescript
const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const PM_HINT = loadHint('pm');
```

Find the system prompt string in pm.ts and add before the closing backtick:

```
${PM_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${PM_HINT}` : ''}
```

- [ ] **Step 5.5: Type-check all four files**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.6: Verify triage still runs**

```bash
npm run triage 2>&1 | tail -3
```

Expected: normal triage output (no errors about missing hint files).

- [ ] **Step 5.7: Commit**

```bash
git add src/triage.ts src/planner.ts src/dev.ts src/pm.ts
git commit -m "feat: inject reviewer hints into all agent prompts"
```

---

## Task 6: Write src/reviewer.ts

**Files:**
- Create: `src/reviewer.ts`

The reviewer entry point:
1. Reads `last_review.json` for the delta cursor
2. Reads all JSONL event files whose date is ≥ the cursor
3. Pre-aggregates events into per-agent stats (TypeScript math — no LLM involved)
4. Detects if delta is empty → exits early
5. Builds a prompt with aggregated stats + thresholds + cooldowns + atomoCwd
6. Calls `runAgent()` — LLM handles interpretation, report writing, hint writing, optional PR

- [ ] **Step 6.1: Write reviewer.ts**

Create `src/reviewer.ts`:

```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const atomoCwd = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface JsonlEvent {
  ts: string;
  run_id: string;
  agent: string;
  event: 'run_start' | 'tool_call' | 'reasoning' | 'api_error' | 'run_complete';
  tool?: string;
  chars?: number;
  type?: string;
  attempt?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  duration_ms?: number;
  status?: 'ok' | 'error';
}

interface AgentStats {
  agentName: string;
  runs: number;
  okRuns: number;
  errorRuns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallsByName: Record<string, number>;
  reasoningCharsTotal: number;
  reasoningBlockCount: number;
  apiErrors: number;
  durationMs: number[];
}

// ─────────────────────────────────────────────────────────────────
// JSONL delta reader
// ─────────────────────────────────────────────────────────────────

function readDeltaEvents(since: string): JsonlEvent[] {
  const eventsDir = path.join(atomoCwd, 'logs', 'events');
  if (!fs.existsSync(eventsDir)) return [];

  const sinceDate = new Date(since);
  const allEvents: JsonlEvent[] = [];

  const files = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort(); // chronological

  for (const file of files) {
    const fileDateStr = file.replace('.jsonl', ''); // YYYY-MM-DD
    const fileDate = new Date(fileDateStr + 'T00:00:00.000Z');
    // Skip files that are entirely before the since date (whole-day optimization)
    if (fileDate < new Date(sinceDate.toISOString().slice(0, 10) + 'T00:00:00.000Z')) continue;

    const content = fs.readFileSync(path.join(eventsDir, file), 'utf-8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const event: JsonlEvent = JSON.parse(line);
        if (new Date(event.ts) > sinceDate) {
          allEvents.push(event);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return allEvents;
}

// ─────────────────────────────────────────────────────────────────
// Pre-aggregation
// ─────────────────────────────────────────────────────────────────

function aggregateByAgent(events: JsonlEvent[]): Record<string, AgentStats> {
  const stats: Record<string, AgentStats> = {};

  // Track open run_ids to pair run_start → run_complete
  const openRuns = new Set<string>();

  for (const event of events) {
    const name = event.agent;
    if (!stats[name]) {
      stats[name] = {
        agentName: name,
        runs: 0,
        okRuns: 0,
        errorRuns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallsByName: {},
        reasoningCharsTotal: 0,
        reasoningBlockCount: 0,
        apiErrors: 0,
        durationMs: [],
      };
    }
    const s = stats[name]!;

    switch (event.event) {
      case 'run_start':
        s.runs++;
        openRuns.add(event.run_id);
        break;
      case 'tool_call':
        if (event.tool) {
          s.toolCallsByName[event.tool] = (s.toolCallsByName[event.tool] ?? 0) + 1;
        }
        break;
      case 'reasoning':
        s.reasoningCharsTotal += event.chars ?? 0;
        s.reasoningBlockCount++;
        break;
      case 'api_error':
        s.apiErrors++;
        break;
      case 'run_complete':
        if (event.status === 'ok') s.okRuns++;
        else s.errorRuns++;
        s.totalInputTokens += event.input_tokens ?? 0;
        s.totalOutputTokens += event.output_tokens ?? 0;
        if (event.duration_ms != null) s.durationMs.push(event.duration_ms);
        openRuns.delete(event.run_id);
        break;
    }
  }

  return stats;
}

function formatStats(stats: Record<string, AgentStats>): string {
  if (Object.keys(stats).length === 0) return '(no agent runs in delta)';

  return Object.values(stats).map(s => {
    const toolBreakdown = Object.entries(s.toolCallsByName)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return [
      `Agent: ${s.agentName}`,
      `  runs: ${s.runs}`,
      `  ok_runs: ${s.okRuns}`,
      `  error_runs: ${s.errorRuns}`,
      `  total_input_tokens: ${s.totalInputTokens}`,
      `  total_output_tokens: ${s.totalOutputTokens}`,
      `  tool_calls_by_name: { ${toolBreakdown || 'none'} }`,
      `  reasoning_chars_total: ${s.reasoningCharsTotal}`,
      `  reasoning_block_count: ${s.reasoningBlockCount}`,
      `  api_errors: ${s.apiErrors}`,
      `  durations_ms: [${s.durationMs.join(', ')}]`,
    ].join('\n');
  }).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

(async () => {
  const lastReviewPath = path.join(atomoCwd, 'reviewer_context', 'last_review.json');
  const thresholdsPath = path.join(atomoCwd, 'reviewer_context', 'thresholds.json');
  const reviewerProtoPath = path.join(atomoCwd, 'protocols', 'reviewer.md');

  const lastReview = JSON.parse(fs.readFileSync(lastReviewPath, 'utf-8')) as {
    last_reviewed_at: string;
    cooldowns: Record<string, string>;
  };
  const thresholds = fs.readFileSync(thresholdsPath, 'utf-8');
  const reviewerProto = fs.readFileSync(reviewerProtoPath, 'utf-8');

  const since = lastReview.last_reviewed_at;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  console.log(`[Reviewer] Reading delta since ${since}...`);
  const events = readDeltaEvents(since);

  if (events.length === 0) {
    console.log('[Reviewer] No delta since last run. Exiting.');
    return;
  }

  const stats = aggregateByAgent(events);
  const statsStr = formatStats(stats);
  const cooldownsStr = JSON.stringify(lastReview.cooldowns, null, 2);

  // Determine Atomo repo slug for gh pr create
  let repoSlug = '';
  try {
    const { execSync } = await import('child_process');
    const remote = execSync('git -C ' + atomoCwd + ' remote get-url origin', { encoding: 'utf-8' }).trim();
    // Parse slug from https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    repoSlug = match ? match[1]! : '';
  } catch {
    repoSlug = '(unknown — use gh pr create without --repo flag)';
  }

  const PROMPT = `
You are the Atomo Performance Reviewer.

## Your Task

Analyze the performance delta for all Atomo agents and produce the three-tier output
defined in your protocol: report, hint files, and optionally a protocol PR.

## atomoCwd (Atomo repo path — use for ALL write/git operations)
${atomoCwd}

## Atomo repo slug (for gh pr create --repo)
${repoSlug}

## Delta Window
- From: ${since}
- To: ${now}
- Report date: ${today}

## Pre-Aggregated Event Stats
${statsStr}

## Thresholds
${thresholds}

## Active Cooldowns (signals suppressed until their expiry date)
${cooldownsStr}

---

## Your Protocol

${reviewerProto}
`;

  await runAgent('Reviewer', PROMPT, {
    model: 'claude-sonnet-4-6',
    tools: ['Read', 'Write', 'Edit', 'Bash'],
    allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
  });
})().catch(console.error);
```

- [ ] **Step 6.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/reviewer.ts
git commit -m "feat: add reviewer agent entry point with JSONL pre-aggregation"
```

---

## Task 7: Add npm review Script + .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore` (or create)

- [ ] **Step 7.1: Add review script to package.json**

In `package.json`, add `"review"` to the scripts block:

```json
{
  "scripts": {
    "triage": "tsx src/triage.ts",
    "plan": "tsx src/planner.ts",
    "dev": "tsx src/dev.ts",
    "pm": "tsx src/pm.ts",
    "review": "tsx src/reviewer.ts",
    "init": "tsx scripts/init.ts",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

- [ ] **Step 7.2: Ensure logs/ and reviewer_context/reports/ are gitignored appropriately**

Check if `.gitignore` exists:

```bash
cat .gitignore 2>/dev/null || echo "(no .gitignore)"
```

Add these lines if not already present (keep `reviewer_context/` tracked except reports):

```
# Daily agent logs (large, generated)
logs/

# Generated reviewer reports
reviewer_context/reports/
```

Note: `reviewer_context/thresholds.json`, `last_review.json`, and `hints/` stay tracked — they are config and state.

- [ ] **Step 7.3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7.4: Commit**

```bash
git add package.json .gitignore
git commit -m "feat: add npm run review script and gitignore logs"
```

---

## Task 8: End-to-End Smoke Test

- [ ] **Step 8.1: Run the reviewer for the first time**

```bash
npm run review 2>&1 | tee /tmp/reviewer-smoke.log
```

Expected outcomes (one of):
- If JSONL events exist: `[Reviewer] Reading delta since 2026-01-01T00:00:00.000Z...` followed by LLM reasoning, followed by report written to `reviewer_context/reports/YYYY-MM-DD.md`
- If no events yet: `[Reviewer] No delta since last run. Exiting.`

If no events exist, run triage first to generate some:
```bash
npm run triage && npm run review
```

- [ ] **Step 8.2: Verify report was created**

```bash
ls reviewer_context/reports/
```

Expected: `2026-04-24.md` (today's date)

- [ ] **Step 8.3: Verify hint files were updated**

```bash
head -3 reviewer_context/hints/triage.md
```

Expected: `# Reviewer Hints — 2026-04-24` (or whatever today is)

- [ ] **Step 8.4: Verify last_review.json was updated**

```bash
cat reviewer_context/last_review.json
```

Expected: `last_reviewed_at` is close to now (within the last few minutes), no longer `2026-01-01`.

- [ ] **Step 8.5: Verify no PRs were opened on target repo**

```bash
gh pr list --repo $(git remote get-url origin | sed 's/.*github.com[/:]//' | sed 's/.git$//') --head "review/"
```

Expected: any PR opened should be on the Atomo repo, not the target repo.

- [ ] **Step 8.6: Run reviewer a second time — verify it exits early (no new delta)**

```bash
npm run review
```

Expected: `[Reviewer] No delta since last run. Exiting.` — the cursor was updated, no re-processing.

- [ ] **Step 8.7: Final commit**

```bash
git add reviewer_context/last_review.json reviewer_context/hints/
git commit -m "chore: update reviewer state after first run"
```

---

## Summary of Signal Coverage

| Signal | Source | Computed by |
|--------|--------|-------------|
| `run_completion_rate` | JSONL | TypeScript pre-aggregation |
| `error_rate` | JSONL | TypeScript pre-aggregation |
| `tokens_per_run` | JSONL (SDK result) | TypeScript pre-aggregation |
| `tool_calls_per_run` | JSONL | TypeScript pre-aggregation |
| `reasoning_verbosity` | JSONL | TypeScript pre-aggregation |
| `cost_per_run_usd` | JSONL + thresholds pricing | LLM (simple math from agg stats) |
| `p95_duration_ms` | JSONL | LLM (from pre-aggregated array) |
| `needs_info_rate` | GitHub (target, read-only) | LLM via gh |
| `first_pass_approval_rate` | GitHub (target, read-only) | LLM via gh |
| `feedback_loop_depth` | GitHub (target, read-only) | LLM via gh |
| `pr_merge_rate` | GitHub (target, read-only) | LLM via gh |
| `proposal_pass_rate` | `pm_context/rejected_proposals.md` | LLM via Read |
| `resurrection_rate` | `pm_context/revalidation_log.md` | LLM via Read |
