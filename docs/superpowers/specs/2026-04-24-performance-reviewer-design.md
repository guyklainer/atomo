# Performance Reviewer Agent — Design Spec
**Date**: 2026-04-24  
**Status**: Approved for implementation

---

## Purpose

An autonomous meta-agent that observes all other Atomo agents over time, detects behavioral and efficiency regressions, and proposes targeted improvements — with minimal noise when the system is healthy.

The reviewer makes agents better and more efficient over time without requiring constant human attention.

---

## Scope & Isolation Constraint

The reviewer operates entirely within the **Atomo repo**. It never creates issues, opens PRs, or writes files in the target repo (`TARGET_REPO_PATH`). All git operations use the Atomo repo's own directory (`atomoCwd = process.cwd()` at reviewer startup, never `TARGET_REPO_PATH`).

Read-only `gh` calls to the target repo (e.g. PR merge rates, spec approval rates) are permitted.

---

## Architecture Overview

```
agents run
    ↓
runner.ts emits structured events
    ↓
logs/events/YYYY-MM-DD.jsonl   ←── machine-readable delta
logs/<agent>/YYYY-MM-DD.log    ←── human-readable (rotated daily)
    ↓
reviewer.ts reads delta (since last_review.json cursor)
    ↓
computes per-agent signals
    ↓
Tier 1 → always write reviewer_context/reports/YYYY-MM-DD.md
Tier 2 → soft nudges → reviewer_context/hints/<agent>.md (overwrite each run)
Tier 3 → threshold crossed → git branch + protocol diff + PR on Atomo repo
    ↓
update reviewer_context/last_review.json
```

---

## New Files

| File | Purpose |
|------|---------|
| `src/reviewer.ts` | Reviewer agent entry point |
| `protocols/reviewer.md` | Behavioral rules, signal definitions, threshold logic |
| `reviewer_context/thresholds.json` | Human-editable threshold configuration |
| `reviewer_context/last_review.json` | Delta cursor — last reviewed timestamp |
| `reviewer_context/reports/YYYY-MM-DD.md` | Generated reports (one per run) |
| `reviewer_context/hints/triage.md` | Soft hints for Gatekeeper (overwritten each run) |
| `reviewer_context/hints/planner.md` | Soft hints for Architect |
| `reviewer_context/hints/dev.md` | Soft hints for Dev Agent |
| `reviewer_context/hints/pm.md` | Soft hints for PM Agent |

## Modified Files

| File | Change |
|------|--------|
| `src/runner.ts` | Emit structured JSONL events + capture token counts from SDK result |
| `src/triage.ts` | Read `reviewer_context/hints/triage.md` at startup |
| `src/planner.ts` | Read `reviewer_context/hints/planner.md` at startup |
| `src/dev.ts` | Read `reviewer_context/hints/dev.md` at startup |
| `src/pm.ts` | Read `reviewer_context/hints/pm.md` at startup |
| `package.json` | Add `"review": "tsx src/reviewer.ts"` script |

---

## Section 1: Data Infrastructure

### 1a. Daily Log Rotation

Each agent run appends to a dated file instead of a single rolling log:

```
logs/triage/2026-04-24.log
logs/planner/2026-04-24.log
logs/dev/2026-04-24.log
logs/pm/2026-04-24.log
```

`runner.ts` determines the date at startup and passes the log path to the write stream. No cron changes needed.

### 1b. Structured JSONL Event Stream

`runner.ts` writes a parallel event stream to `logs/events/YYYY-MM-DD.jsonl`. Each line is one JSON event:

```jsonl
{"ts":"2026-04-24T03:00:01Z","run_id":"tr-001","agent":"triage","event":"run_start"}
{"ts":"2026-04-24T03:00:04Z","run_id":"tr-001","agent":"triage","event":"tool_call","tool":"Bash"}
{"ts":"2026-04-24T03:00:09Z","run_id":"tr-001","agent":"triage","event":"reasoning","chars":840}
{"ts":"2026-04-24T03:00:22Z","run_id":"tr-001","agent":"triage","event":"api_error","type":"overloaded","attempt":1}
{"ts":"2026-04-24T03:00:45Z","run_id":"tr-001","agent":"triage","event":"run_complete","input_tokens":12400,"output_tokens":3200,"duration_ms":44000,"status":"ok"}
```

Token counts come from the SDK's `result` message in the `query()` stream — already emitted, not currently captured. Model pricing used for cost estimates is defined in `reviewer_context/thresholds.json` and should be updated when the model changes.

**Event types:**
- `run_start` — agent name, run_id, timestamp
- `tool_call` — tool name, run_id
- `reasoning` — character count of reasoning block, run_id
- `api_error` — error type, attempt number, run_id
- `run_complete` — input_tokens, output_tokens, duration_ms, status (`ok` | `error`)

---

## Section 2: Reviewer Agent

### Trigger

```bash
npm run review        # on-demand
# also runs nightly via cron
```

### Delta Mechanism

`reviewer_context/last_review.json` tracks the cursor:
```json
{ "last_reviewed_at": "2026-04-24T03:00:00Z" }
```

On each run the reviewer reads only JSONL events after `last_reviewed_at`, computes signals, writes output, then updates the cursor. If no events exist since last run, exits immediately — no report, no noise.

### Reviewer Protocol (`protocols/reviewer.md`)

Defines:
- Signal computation formulas (exact, not heuristic)
- Threshold evaluation logic
- PR trigger rules and cooldown enforcement
- Hint file format and content constraints
- Report format

---

## Section 3: Signals

All signals are computed over a configurable window (default values shown).

### Gatekeeper (Triage)
| Signal | Formula | Window |
|--------|---------|--------|
| `needs_info_rate` | issues with `needs-info` label added / issues_processed (via `gh`, read-only) | 7d |
| `tokens_per_issue` | total_tokens / issues_processed | 7d |
| `tool_calls_per_issue` | tool_call events / issues_processed | 7d |
| `error_rate` | api_error events / run_count | 7d |
| `reasoning_verbosity` | avg chars per reasoning block | 7d |
| `run_completion_rate` | ok runs / total runs | 7d |

### Architect (Planner)
| Signal | Formula | Window | Source |
|--------|---------|--------|--------|
| `first_pass_approval_rate` | specs approved without feedback / total specs | 14d | GitHub (read-only) |
| `tokens_per_spec` | total_tokens / specs_written | 7d | JSONL |
| `tool_calls_per_spec` | tool_call events / specs_written | 7d | JSONL |
| `feedback_loop_depth` | avg comment rounds before APPROVED | 14d | GitHub (read-only) |
| `error_rate` | api_error events / run_count | 7d | JSONL |

### Dev Agent
| Signal | Formula | Window | Source |
|--------|---------|--------|--------|
| `pr_merge_rate` | merged PRs / opened PRs | 30d | GitHub (read-only) |
| `tokens_per_pr` | total_tokens / PRs_opened | 14d | JSONL |
| `tool_call_ratio` | read tool_calls / write tool_calls | 7d | JSONL — reads: `Read`, `Grep`, `Glob`, `Bash` (non-mutating); writes: `Edit`, `Write`, `Bash` (git/gh commands) |
| `error_rate` | api_error events / run_count | 7d | JSONL |
| `run_completion_rate` | ok runs / total runs | 7d | JSONL |

### PM Agent
| Signal | Formula | Window | Source |
|--------|---------|--------|--------|
| `proposal_pass_rate` | passed_validation / total_proposals | 7d | pm_context logs |
| `tokens_per_proposal` | total_tokens / proposals_generated | 7d | JSONL |
| `resurrection_rate` | resurrected proposals / revalidation_runs | 14d | pm_context/revalidation_log.md |
| `self_critique_trigger_rate` | phase0_runs / total_runs | 30d | pm_context/evolution.log |
| `error_rate` | api_error events / run_count | 7d | JSONL |

### Cross-cutting (all agents)
| Signal | Formula | Window |
|--------|---------|--------|
| `cost_per_run_usd` | (input_tokens × $0.003 + output_tokens × $0.015) / 1000 | 7d |
| `p95_duration_ms` | 95th percentile run duration | 7d |

---

## Section 4: Threshold Configuration

`reviewer_context/thresholds.json` — human-editable:

```json
{
  "triage": {
    "needs_info_rate":    { "max": 0.35, "window": "7d" },
    "tokens_per_issue":   { "max": 6000, "window": "7d" },
    "error_rate":         { "max": 0.20, "window": "7d" }
  },
  "planner": {
    "first_pass_approval_rate": { "min": 0.50, "window": "14d" },
    "tokens_per_spec":          { "max": 25000, "window": "7d" },
    "feedback_loop_depth":      { "max": 2.0, "window": "14d" }
  },
  "dev": {
    "pr_merge_rate":      { "min": 0.70, "window": "30d" },
    "tokens_per_pr":      { "max": 60000, "window": "14d" },
    "error_rate":         { "max": 0.20, "window": "7d" }
  },
  "pm": {
    "proposal_pass_rate": { "min": 0.30, "window": "7d" },
    "tokens_per_proposal":{ "max": 15000, "window": "7d" }
  },
  "all": {
    "run_completion_rate":{ "min": 0.90, "window": "7d" },
    "cost_per_run_usd":   { "max": 2.00, "window": "7d" }
  },
  "model_pricing": {
    "input_per_1k_tokens": 0.003,
    "output_per_1k_tokens": 0.015,
    "note": "Update when model changes. Values are USD."
  }
}
```

---

## Section 5: Three-Tier Output

### Tier 1 — Report (always)

`reviewer_context/reports/YYYY-MM-DD.md`:

```markdown
# Atomo Performance Review — 2026-04-24
**Delta**: 2026-04-17 → 2026-04-24 | **Runs analyzed**: 14

## Summary
✅ Gatekeeper — healthy
⚠️ Architect — first_pass_approval_rate: 0.33 (threshold: 0.50, window: 14d)
✅ Dev — healthy
✅ PM — healthy

## Signal Detail

### Architect
| Signal | Value | Threshold | Status |
|--------|-------|-----------|--------|
| first_pass_approval_rate | 0.33 | ≥0.50 | ⚠️ BELOW |
| tokens_per_spec | 18,200 | ≤25,000 | ✅ |
| feedback_loop_depth | 2.4 rounds | ≤2.0 | ⚠️ ABOVE |

**Observation**: Clarifying questions in 3 of 5 specs were too vague — humans replied
"what do you mean?" in each case. Specs required 2+ rounds before approval.

## Cost Summary
| Agent | Runs | Avg input tokens | Avg output tokens | Est. cost/run |
|-------|------|-----------------|-------------------|---------------|
| Triage | 5 | 9,800 | 2,400 | $0.07 |
| Architect | 3 | 14,200 | 5,600 | $0.13 |
| Dev | 2 | 28,100 | 10,300 | $0.24 |
| PM | 4 | 8,900 | 2,300 | $0.06 |

## Actions Taken
→ PR opened: `review/2026-04-24` — proposed change to `protocols/planning.md`
→ Hint updated: `reviewer_context/hints/planner.md`
```

### Tier 2 — Hint Files (soft nudge, no human review)

Written when a signal shows a pattern below threshold but above the PR trigger level, OR when the PR is already open and a reminder helps. Max 5 bullets. Overwritten each run.

`reviewer_context/hints/planner.md`:
```markdown
# Reviewer Hints — 2026-04-24
- Clarifying questions should be answerable with a concrete choice or example.
  Avoid: "How should errors be handled?" 
  Prefer: "Should auth errors redirect to /login or return a 401?"
- Last 3 specs averaged 2.4 feedback rounds. Aim for 1.
```

Each agent loads its hint file at startup alongside its protocol, treating hints as supplemental guidance. Hints are not rules — the protocol takes precedence.

**Hint cleared when:** a PR is opened addressing the same signal (no redundant nudging).

### Tier 3 — Protocol PR (threshold crossed)

One PR per reviewer run, even if multiple signals are flagged (bundled). Branch: `review/YYYY-MM-DD`.

PR body structure:
```markdown
## What triggered this
[Signal name]: [value] over [window] (threshold: [threshold])
Evidence: [2-3 concrete observations from log/GitHub data]

## Proposed change
`protocols/<file>.md` — [Section name]

Before:
> [exact current text]

After:
> [proposed replacement]

## Expected outcome
- [Specific behavioral change expected]
- [Which signal should recover and in how many runs]

## Cooldown
This signal suppressed for 14 days after merge.
```

**Fatigue guards:**
1. **Window averaging** — signals evaluated over days, not single runs
2. **14-day cooldown** — once a PR is opened for a signal, that signal is suppressed for 14 days unless it worsens by >20%
3. **Bundle** — multiple threshold breaches → one PR, not multiple
4. **Delta cursor** — if no new runs since last review, exits with no output

---

## Section 6: Reviewer Protocol Rules

Defined in `protocols/reviewer.md`, the reviewer LLM follows these rules:

1. **Read delta only** — never re-process events before `last_reviewed_at`
2. **Compute before concluding** — show signal values in the report before stating any observation
3. **Propose surgical edits** — protocol PRs change the minimum text necessary; no rewrites
4. **Never touch target repo** — all git/gh write operations use `atomoCwd`
5. **Read-only GitHub calls** — `gh` calls to target repo use `--json` flags only, no mutations
6. **Respect cooldown** — check `reviewer_context/last_review.json` for active cooldowns before opening PRs
7. **Hint constraints** — hints must be ≤5 bullets, concrete and actionable, not repeating protocol text verbatim
8. **Exit cleanly if no delta** — if no JSONL events since last run, write nothing, update cursor, exit

---

## Implementation Order

1. **runner.ts** — JSONL event emission + token capture (unblocks all signal collection)
2. **Log rotation** — daily dated files (low risk, enables delta)
3. **`reviewer_context/` structure** — create dirs, seed `thresholds.json`, seed `last_review.json`
4. **`protocols/reviewer.md`** — behavioral rules for the reviewer LLM
5. **`src/reviewer.ts`** — the agent itself
6. **Agent hint loading** — add hint file reads to triage, planner, dev, pm
7. **`package.json`** — add `review` script
8. **Cron schedule** — add nightly reviewer trigger

---

## Success Criteria

**After first run:**
- Report generated with signal values for all agents
- No false-positive PRs opened on first run (thresholds need a window of data)
- Hint files written if patterns detected

**After 1 week:**
- Signal trends visible across daily reports
- At least one threshold evaluation happening with real window data
- No PRs opened on target repo

**After 1 month:**
- At least one protocol PR opened, reviewed, and merged
- Agent behavior measurably shifts after protocol change
- Reviewer runs invisibly on healthy weeks
