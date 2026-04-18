# Autonomous GitHub Issue Triage & Execution Pipeline
## A Comprehensive Knowledge Document

---

## 1. The Goal

We set out to build a **lean, local, autonomous agent pipeline** that replaces manual developer overhead for GitHub issue management. Rather than relying on a heavy multi-agent cloud framework, we wanted a system that:

1. **Triages** incoming GitHub issues automatically, classifying their type and requesting missing info.
2. **Plans** implementation blueprints by intelligently exploring the target codebase.
3. **Prioritizes** work using objective mathematical scoring.
4. **Executes** the implementation, creating atomic, testable Pull Requests.
5. **Cascades** dependency chains automatically so downstream work unlocks as upstream PRs merge.

The repository is located at `/Users/guyklainer/Developer/triage-agent`. The target destination application repository (the codebase being triaged and modified) is `/Users/guyklainer/Developer/q-li`.

---

## 2. The Tech Stack

- **Runtime:** Node.js v22+ with `tsx` for TypeScript execution (no build step required)
- **Core SDK:** `@anthropic-ai/claude-agent-sdk` — Anthropic's native Node.js agent SDK
- **GitHub CLI:** `gh` — all GitHub interactions happen through the native CLI using structured `--json` flags
- **Language:** TypeScript with strict mode enabled
- **Entry Points:** npm scripts (`npm run triage`, `npm run plan`, `npm run dev`)

---

## 3. The Mindset & Principles

### 3.1 Lean Over Bloated
We repeatedly resisted the temptation to over-engineer. When choosing a model, we asked: "Does this step actually require expensive reasoning?" The Gatekeeper only classifies strings — it uses `claude-haiku`. The Architect and Dev agents do deep reasoning — they use `claude-sonnet`.

### 3.2 Progressive Disclosure
Heavy rules and protocols should **not** be embedded inside the TypeScript system prompt. They make the codebase hard to maintain and cost unnecessary tokens every boot. Instead:
- All protocol rules live in `CLAUDE.md` at the project root.
- The TypeScript agents inject `CLAUDE.md` content dynamically at runtime using Node's `fs.readFileSync`.
- To change how an agent behaves, you edit **only the markdown file**. You never touch the TypeScript.

This is called the **Progressive Disclosure pattern**: the agent is told "the rules are here" rather than receiving all rules immediately.

> **Critical Discovery:** The `cwd` option shifts the SDK's `Glob/Grep/Read` tools to the target repository (e.g. `q-li`). This means if the agent tries to read `CLAUDE.md` using its tools, it would look inside `q-li` — not `triage-agent`. That is why we physically inject `CLAUDE.md` content at Node.js startup time using `fs.readFileSync(path.join(__dirname, '../CLAUDE.md'))`. This is guaranteed and immutable, regardless of where the agent's tools are pointed.

### 3.3 Zero-Waste Codebase Exploration
Every token in the context window costs money. Forcing an agent to `Read` entire source files is catastrophically wasteful. The Zero-Waste Protocol forces the agent to:
1. Use `Glob` to discover the structural boundaries of the codebase (file paths, directory trees)
2. Use `Grep` to execute surgical keyword searches and pinpoint exact line numbers
3. Use `Read` only on specific, targeted lines — never entire files

This preserves the agent's context window for actual reasoning rather than file contents.

### 3.4 Deterministic Inputs via GitHub JSON
Every `gh` CLI command must use the `--json` flag. This converts GitHub's natural language output into structured, machine-parseable JSON. It prevents the agent from hallucinating issue details it mis-read from markdown rendering.

### 3.5 State Machine via GitHub Labels
Rather than maintaining a separate database or config files, we use GitHub Labels as the entire state machine for issue routing. Every label combination is deterministic and auditable right in the GitHub UI. Key labels:

| Label | Meaning |
|---|---|
| `triaged` | Gatekeeper has classified this issue |
| `for-dev` | Architect has written a Tech Spec; ready for Dev agent to pick up |
| `blocked` | This issue has a dependency on another issue that isn't completed yet |
| `needs-repro` | Bug without reproduction steps; waiting for user |
| `needs-triage` | Too ambiguous for classification; waiting for user |
| `needs-info` | Agent confidence < 85%; awaiting targeted human clarification before proceeding. Gatekeeper auto-detects replies and re-evaluates. |
| `pr-ready` | Dev Agent has submitted a PR for this issue |

### 3.6 Zero-Token Orchestration
The question of "which issue should the Dev Agent work on next?" is solved **outside** the LLM. A pure TypeScript `pickHighestPriorityIssue()` function runs before the agent initializes. It fetches all `for-dev` issues via `execSync`, parses ICE Priority Scores using regex, sorts them, and injects the top issue number directly into the system prompt. Total cost: $0.00.

---

## 4. The Three Agents

### 4.1 The Gatekeeper (`npm run triage`)

**File:** `src/triage.ts`  
**Model:** `claude-haiku-4-5` (fast, cheap)  
**Tools:** `Bash` (read-only GitHub access)  
**GitHub Query:** `gh issue list --search "is:open -label:triaged"`

**What it does:**
The Gatekeeper is the cheapest, most restricted agent in the pipeline. It only uses `Bash` to read GitHub issues. It cannot touch the filesystem, read the codebase, or write code.

It runs **two flows on every invocation:**

**Flow A — New issue triage:** Scans `is:open -label:triaged`. Applies the Meta-Prompt Heuristic Matrix to classify the issue:
- **Bug:** Must contain error messages, stack traces, or explicit failure keywords (`"error"`, `"crash"`, `"fail"`, `"broken"`). Checks for presence of reproduction steps.
- **Enhancement:** Requests new functionality with keywords like `"feature"`, `"support"`, `"allow"`, `"enable"`.
- **Question:** Seeks clarification without system failure. Keywords: `"how to"`, `"why"`, `"what"`.
- **Ambiguous:** Fails all criteria above — lacks technical depth.

Before acting, it evaluates a **Confidence Gate** (weighted checklist from `CLAUDE.md`). If score < 85%, it posts one targeted clarifying question and labels `needs-info` instead of proceeding.

**Flow B — needs-info re-evaluation:** Scans `is:open label:needs-info`. For each issue, checks if a human has replied after the last bot comment. If yes: removes `needs-info` and re-evaluates with the new context. If score is now >= 85%, proceeds with normal classification. If still < 85%, posts a follow-up question and re-adds `needs-info`.

After triaging, it outputs a structured JSON block per flow:
```json
{
  "flow": "A",
  "issueNumber": 32,
  "classification": "Enhancement",
  "confidenceScore": 92,
  "action": "labeled" | "needs-info-posted" | "skipped-no-issues",
  "missingReproSteps": false,
  "reasoningSummary": "..."
}
```

**Why the `triaged` label matters:** The next run of the Gatekeeper will see `-label:triaged` in its search, so it will _never_ re-process issues it already handled.

---

### 4.2 The Architect (`npm run plan`)

**File:** `src/planner.ts`  
**Model:** `claude-sonnet-4-5` (deep reasoning)  
**Tools:** `Bash`, `Glob`, `Grep`, `Read`, `Write`  
**GitHub Query:** `gh issue list --search "is:open label:triaged -label:for-dev -label:needs-repro -label:needs-triage -label:needs-info"`

**What it does:**
The Architect is the technical intelligence layer. It picks up issues that have been classified but not yet planned, and produces a complete implementation blueprint by following the **Zero-Waste Protocol** injected from `CLAUDE.md`.

**Step-by-step execution:**
1. **Zero-Waste Codebase Traversal:** Uses `Glob` and `Grep` to surgically locate the files and functions that must change. Never reads entire files.
2. **Confidence Gate (Step 1.5):** Before writing anything, evaluates a weighted checklist (different criteria for Bug vs Enhancement) from `CLAUDE.md`. If score < 85%, posts one targeted question, labels `needs-info`, and exits. The Gatekeeper will re-route the issue back once the human replies.
3. **Skill Discovery:** Explicitly searches the target repo's `.claude/` and `.agents/` directories for existing domain skills or project conventions (e.g., `frontend-design.md`, `api-conventions.md`). These are assimilated into the blueprint.
4. **ICE Prioritization:** Before writing the spec, calculates a Priority Score:
   ```
   P = (I × C) / E
   ```
   - **Impact (I) [1-5]:** How many users does this affect?
   - **Confidence (C) [1-5]:** How definitively did it find the root cause / implementation path?
   - **Effort (E) [1-5]:** How complex is the required implementation? (Higher = harder; dividing by E prioritizes "Quick Wins")
4. **Blueprint Generation:** Writes `docs/plans/TECH_SPEC_<number>.md` in the **destination repository** (not triage-agent). The file must start with the formatted Priority Score: `Priority: 6.0 (I=3, C=4, E=2)`.
5. **Issue Comment:** Attaches the Tech Spec to the GitHub issue via `gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md`.
6. **Atomic Epic Breakdown (for complex issues):** If the issue requires multiple independently-deployable phases, the Architect does NOT write one monolithic spec. It creates separate GitHub child issues per phase and labels them properly:
   - Phase 1 → `for-dev` (unblocked)
   - Phase 2+ → `for-dev,blocked`
   - Each Phase N issue body **must contain** the text `Blocks: #<Phase N+1 issue number>` for forward-link dependency chaining.
   - Each child issue body contains `Parent: #<epic number>` for traceability.
7. **Handoff:** Labels the original issue `for-dev`.

---

### 4.3 The Dev Agent (`npm run dev`)

**File:** `src/dev.ts`  
**Model:** `claude-sonnet-4-5` (deep reasoning + coding)  
**Tools:** `Bash`, `Glob`, `Grep`, `Read`, `Write`  
**GitHub Query (handled by JS pre-fetch):** `gh issue list --search "is:open label:for-dev -label:pr-ready -label:blocked"`

**What it does:**
The Dev Agent is the execution engine. Before it even initializes the expensive LLM, a pure TypeScript pre-fetch function determines what it should work on.

**The JS Prioritization Engine (zero-cost):**
```typescript
function pickHighestPriorityIssue(): GitHubIssue | null {
  // Fetches all for-dev issues via execSync (no LLM involved)
  // Parses "Priority: X.X" from issue body using regex
  // Sorts descending and returns the top candidate
}
```
This means the LLM is **pre-locked** on the highest-priority issue before it generates a single token.

**Step-by-step execution (6-step Dev Method):**
1. **Immutable Onboarding:** Internalizes `CLAUDE.md` rules injected at startup.
2. **Specification Alignment:** Reads the full GitHub issue (all comments are mandatory, especially QA/Code Review feedback) AND reads `docs/plans/TECH_SPEC_<number>.md`.
3. **Skill & Pattern Discovery:** Uses `Glob` to find `.claude/` and `.agents/` directories in the target repo and reads relevant skill files.
4. **Cognitive Simulation (Chain-of-Thought):** Documents the internal implementation plan before touching any file. Cross-references proposed changes against existing system dependencies.
5. **Surgical Implementation:** Uses `Bash/Read/Write/Grep/Glob` to implement the exact changes scoped by the Tech Spec.
6. **Verification & Handoff:**
   - Runs `npx tsc --noEmit`, tests, and linters via `Bash`.
   - If failure: fixes code, re-runs.
   - If success: Creates a new branch `feat/issue-<number>`, commits, and pushes.
   - Creates PR with body: `Resolves #<number>\n\nAutomated PR implementing TECH_SPEC_<number>.md` — GitHub's magic keyword automatically links the PR to the issue and closes it on merge.
   - Labels the issue `pr-ready` and removes `for-dev`.
   - **Dependency Cascade:** Reads the current issue body. If it finds `Blocks: #<number>`, runs `gh issue edit <number> --remove-label blocked` — unblocking the next task in the chain automatically.

**The `for-dev` return loop:** If QA or Code Review rejects a PR, a human labels the issue `for-dev` (removing `pr-ready`). On the next run, the Dev Agent picks it back up, reads ALL new comments (which include the CR/QA feedback), and re-implements accordingly.

---

## 5. The Shared Infrastructure

### 5.1 `src/runner.ts` — The Execution Wrapper
All three agents share a generic execution loop. This keeps each agent file focused purely on its system prompt and model configuration.

```typescript
export async function runAgent(agentName: string, prompt: string, options: Options) {
  const stream = query({ prompt, options });
  for await (const message of stream) {
    // Logs [Reasoning] blocks and [Tool Call] invocations
  }
}
```

### 5.2 `CLAUDE.md` — The Living Protocol Document
This is the single source of truth for all agent behavior rules. It contains:
- **Triage Protocol:** Primary tool usage, data format requirements
- **Zero-Waste Protocol:** Step-by-step codebase exploration rules
- **ICE Prioritization Formula**
- **Atomic Epic Breakdown Protocol:** Rules for creating ordered, dependency-chained child issues
- **Commands:** Quick-reference for all three npm scripts

### 5.3 The `.env` File
Contains `ANTHROPIC_API_KEY` and optionally `TARGET_REPO_PATH`. The `TARGET_REPO_PATH` is critical — it points to the destination repository the Architect and Dev agents operate against. Without this, all agents default to `process.cwd()` (the triage-agent directory itself).

---

## 6. The Complete Label State Machine

```
New Issue Created
      │
      ▼
[Gatekeeper — Flow A: scans "is:open -label:triaged"]
      │
      ├─ Confidence < 85% ──────────────► post clarifying question
      │                                   label: needs-info
      │                                        │
      │              ┌─────────────────────────┘
      │              │
      │   [Gatekeeper — Flow B: scans "is:open label:needs-info"]
      │              │
      │   ├─ No human reply yet ──────────► skip (still waiting)
      │   │
      │   └─ Human replied ──────────────► remove needs-info
      │                                    re-evaluate confidence
      │                                    ├─ >= 85% → back to normal flow ─┐
      │                                    └─ < 85%  → new question          │
      │                                               re-add needs-info      │
      │◄─────────────────────────────────────────────────────────────────────┘
      │
      ├─ If Ambiguous / Missing Repro ──► needs-triage / needs-repro, triaged
      │                                   (Awaits human clarification)
      │
      └─ If classifiable (confidence >= 85%) ──► enhancement/bug/question, triaged
                                              │
                                              ▼
[Architect scans "triaged -label:for-dev -label:needs-repro -label:needs-triage -label:needs-info"]
                                              │
                              ┌───────────────┤
                              │ Confidence < 85%
                              │ post clarifying question
                              │ label: needs-info, EXIT
                              │ (Gatekeeper Flow B handles re-entry)
                              └───────────────┤
                              Confidence >= 85%│
                                    Writes TECH_SPEC.md
                                    Labels `for-dev`
                                              │
                              ┌───────────────┴───────────────┐
                              │ Simple issue                   │ Complex Epic
                              │ One spec, one child issue      │ N atomic child issues
                              │ Phase 1: for-dev               │ Phase 1: for-dev
                              │                                │ Phase 2+: for-dev, blocked
                              └───────────────┬───────────────┘
                                              │
                                              ▼
         [Dev scans "for-dev -blocked -pr-ready" → picks highest ICE score]
                                              │
                                    Implements changes
                                    Creates PR (Resolves #N)
                                    Removes `for-dev`
                                    Adds `pr-ready`
                                    Cascades: removes `blocked` from next task
                                              │
                         ┌────────────────────┴──────────────────────┐
                         │ PR Approved & Merged                       │ PR Rejected (QA/CR)
                         │ GitHub auto-closes issue                   │ Human re-labels: for-dev
                         ▼                                            │
                      DONE ◄──────────────────────────────────────────┘
```

---

## 7. Design Decisions & Tradeoffs

### Why Not Use a Multi-Agent Framework?
We explicitly chose to avoid heavy orchestration frameworks (like LangGraph, CrewAI, AutoGen). These create:
- Opaque token costs
- Fan-out loops that can spin unexpectedly
- External cloud dependencies

Our pipeline is three simple TypeScript scripts you can `cat` and read in 2 minutes. Every decision is auditable.

### Why Use GitHub Labels for State Rather Than a Database?
Labels are:
- **Human-readable** and visible natively in GitHub's UI
- **Zero-infrastructure** — no database, no Redis, no Postgres
- **Human-overridable** — any engineer can manually fix state by changing a label
- **API-accessible** via `gh issue list --search`

### Why Not Let the Dev Agent Pick Its Own Issue?
If the Dev Agent uses its LLM to fetch and select a priority issue, you pay for:
1. Fetching all 20+ issues into context
2. Reasoning about which one to pick
3. Potentially hallucinating a priority order

By solving this with pure Node.js code (`execSync` + `Array.sort()`), it's instantaneous and free.

### Why `Blocks: #<number>` in the Issue Body Instead Of a Graph Database?
The issue body is the dependency manifest. When the Architect creates child issues, the forward-link chain is permanently stored right where the work lives. The Dev Agent only needs to read the issue it's working on to know exactly what it unblocks next. No global queries. No external state.

---

## 8. File Structure

```
triage-agent/
├── src/
│   ├── runner.ts        # Shared Anthropic SDK execution loop
│   ├── triage.ts        # The Gatekeeper agent (Haiku, Bash-only)
│   ├── planner.ts       # The Architect agent (Sonnet, full tools)
│   └── dev.ts           # The Dev agent (Sonnet, JS pre-fetch + full tools)
├── CLAUDE.md            # Living protocol document (all agent rules)
├── AGENT_SPEC.md        # High-level spec for the system
├── package.json         # npm scripts: triage, plan, dev
├── tsconfig.json        # TypeScript configuration
├── .env                 # ANTHROPIC_API_KEY, TARGET_REPO_PATH
└── .gitignore           # Excludes .env, node_modules
```

The **destination repository** (`q-li` or any other) is expected to have:
```
<target-repo>/
├── docs/
│   └── plans/           # TECH_SPEC_<number>.md files written here by Architect
├── .claude/             # Optional: local skill files the Architect/Dev will discover
└── .agents/             # Optional: domain-specific protocol files
```

---

## 9. Running The Pipeline

### Step 1: Setup
```bash
cd /Users/guyklainer/Developer/triage-agent
cp .env.example .env
# Add ANTHROPIC_API_KEY and TARGET_REPO_PATH to .env
npm install
```

### Step 2: Triage new issues
```bash
npm run triage
# Scans for `is:open -label:triaged`
# Classifies and labels the oldest unprocessed issue
```

### Step 3: Plan the work
```bash
npm run plan
# Scans for `is:open label:triaged -label:for-dev`
# Writes TECH_SPEC.md, creates child issues if complex, labels for-dev
```

### Step 4: Execute the work
```bash
npm run dev
# Pre-fetches all for-dev issues, picks highest ICE Priority Score
# Implements code, runs tests, creates PR, unblocks dependencies
```

Run each step repeatedly in a loop (or via cron) to automatically churn through your entire backlog.

---

## 10. Future Extension Points

- **QA Agent (`src/qa.ts`)**: Picks up `pr-ready` issues, checks out the branch, runs e2e tests, labels `qa-approved` or reverts to `for-dev` with feedback comment.
- **Security Agent (`src/security.ts`)**: Triggered specifically for issues touching auth/db. Could scan the diff for PII violations before labeling `pr-ready`.
- **Reviewer Agent**: Reads a PR diff and posts a structured code review as a GitHub comment.
- **Prioritization Heuristic Tuning**: Adjust the ICE weights in `CLAUDE.md` without touching any code. For example, you could add a `Time-Sensitivity (T)` multiplier: `P = (I × C × T) / E`.

---

*This document captures the full architectural journey, design philosophy, and implementation details of the Autonomous GitHub Issue Triage & Execution Pipeline built in conversation between Guy Klainer and Antigravity (Google DeepMind), April 2026.*
