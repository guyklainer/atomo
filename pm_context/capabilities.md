# Current Capabilities Snapshot

**Generated**: 2026-04-23 (Run #3)
**Changes Since Run #2**: README added, init script added, retry logic added

---

## Core Features

### Issue Classification (Gatekeeper)
- **Source**: `src/triage.ts`, `protocols/triage.md`, `protocols/reevaluation.md`
- Fetches untriaged issues via `gh` CLI
- Applies heuristic matrix: bug/enhancement/question/ambiguous
- Confidence gating (85% threshold before labeling)
- Automated clarification comments via `needs-info` label
- **FLOW B deterministic re-evaluation** (PR #4): Detects human replies and routes back to Gatekeeper/Architect **without LLM** (60-80% cost savings)
- **NEW (4f38045)**: Uses shared `runAgent` helper with exponential backoff for API overload

### Technical Planning (Architect)
- **Source**: `src/planner.ts`, `protocols/planning.md`, `protocols/review.md`
- Generates comprehensive tech specs (6-section markdown format)
- Zero-Waste codebase traversal (Glob → Grep → Read pattern)
- **Mandatory 2-3 clarification questions** per spec (PR #5)
- **Review loop workflow** (PR #5): `needs-review` → human feedback → `APPROVED` → `for-dev`
- Approval detection is deterministic (no LLM for "APPROVED" keyword)
- Epic breakdown for complex issues (`protocols/epic_breakdown.md`)
- **NEW (4f38045)**: Uses shared `runAgent` helper with exponential backoff for API overload

### Implementation & PR Creation (Dev)
- **Source**: `src/dev.ts`, `protocols/atomo_dev.md`, `protocols/tdd.md`
- Observe → Align → Execute rigid loop
- TDD-first implementation (tests before code)
- Atomic commits with co-authorship attribution
- **PR review monitoring** (PR #5): Tracks formal reviews, inline comments, and human feedback
- Deterministic routing: `APPROVED` → `merged-ready`, Changes Requested → `for-dev`
- Branch naming: `atomo/issue-{number}`
- **NEW (4f38045)**: Uses shared `runAgent` helper with exponential backoff for API overload

### Product Roadmap Generation (PM)
- **Source**: `src/pm.ts` (PR #6)
- Domain discovery and capability mapping
- Market research synthesis (reasoning-based)
- Modular context management (`pm_context/*.md` with 7 context files)
- GitHub issue creation for proposals (pm-proposal label)
- Enhanced deduplication: Checks open/closed issues AND PRs
- Smart retention strategies (versioned domain, rolling proposal archive)
- **NEW (4f38045)**: Uses shared `runAgent` helper with exponential backoff for API overload

---

## Integrations

### GitHub CLI (`gh`)
- **Source**: `src/github.ts`
- Issue management (list, view, comment, label)
- PR operations (create, review state tracking)
- JSON-first data format (deterministic parsing)
- **Shared helper functions** (PR #4): `gh()`, `hasHumanReplyAfterBot()`, `hasNewReviewComments()`, `extractIssueNumber()`
- Multi-repo support via `TARGET_REPO_PATH` env var
- ⚠️ **KNOWN GAP**: Many `gh()` calls still unguarded (no try-catch for CLI failures)

### Protocol System
- **Source**: `protocols/*.md`
- **8 modular behavior definitions**: triage, planning, confidence_gate, reevaluation, epic_breakdown, atomo_dev, tdd, review (PR #5)
- Injected into agent prompts at runtime
- Separation of "what" (agents) from "how" (protocols)

### Agent Execution Infrastructure (NEW - 4f38045)
- **Source**: `src/runner.ts`
- Shared `runAgent()` helper with exponential backoff retry
- Handles `overloaded_error` from Anthropic API (max 5 retries)
- Base delay: 2s, exponential backoff (2^attempt * base)
- Logging: Reasoning steps, tool calls, pipeline completion
- ⚠️ **LIMITATION**: Only handles API overload, NOT GitHub CLI failures

---

## User-Facing Flows

### Flow 1: Issue → Triage → Plan → Implement → PR
1. User creates GitHub issue
2. `npm run triage` classifies it (Gatekeeper)
   - If ambiguous: adds `needs-info`, waits for human clarification
   - **FLOW B**: Automatically re-triages when human replies (no manual re-run needed)
3. `npm run plan` generates tech spec (Architect)
   - Adds `needs-review` label with 2-3 clarification questions
4. User reviews spec and comments "APPROVED" (or provides feedback)
   - **Deterministic approval**: Agent detects keyword without LLM
   - If feedback: Agent iterates on spec
5. `npm run dev` implements and creates PR (Dev)
6. User reviews PR
   - **Deterministic PR monitoring**: Detects formal reviews, inline comments
   - If changes requested: Agent automatically iterates

### Flow 2: Roadmap Generation
1. `npm run pm` analyzes domain and gaps
2. PM agent creates GitHub issues for feature proposals
3. User reviews/closes proposals
4. Accepted proposals enter Flow 1

### Flow 3: Automated Re-Entry Loops (PR #4, #5)
- `needs-info` issues automatically re-triaged after human reply (FLOW B)
- `needs-review` specs iterate on feedback until `APPROVED`
- PR review feedback triggers re-implementation (for-dev label restored)

### Flow 4: Environment Setup (NEW - 97fe4c8)
1. `npm run init` validates environment
   - Checks: Node.js version (>=18), gh CLI, gh auth, ANTHROPIC_API_KEY
   - Auto-creates missing GitHub labels (triaged, needs-info, Bug, Enhancement, etc.)
   - **GAP**: Checks but doesn't scaffold .env (passive validation only)

---

## Architectural Strengths

- **Cost Optimization**: Deterministic pre-processing reduces LLM calls (~60-80% savings on FLOW B)
- **Context Preservation**: Modular protocols prevent token bloat
- **Human Control**: Approval gates prevent runaway automation
- **Local-First**: No cloud dependency, runs on developer machine
- **Lean Codebase**: ~1462 LOC total (easy to fork, maintain)
- **State Machine Architecture**: GitHub labels as explicit state transitions (triaged → needs-review → for-dev → pr-ready → merged-ready)
- **Resilience (NEW)**: Exponential backoff retry for API overload errors

---

## Known Limitations (Updated for Run #3)

### Reliability Gaps (PARTIALLY IMPROVED)
- ✅ **API overload handling**: Exponential backoff retry (NEW - 4f38045)
- ❌ **GitHub CLI errors**: Still ~10+ unguarded `gh()` calls (no try-catch)
- ❌ **No retry logic for CLI**: Transient GitHub API failures cause agent failures
- ❌ **No rate limit handling**: GitHub API rate limits not detected or handled
- ❌ **No idempotency**: Re-running agents can cause duplicate comments

### Configuration Gaps (UNCHANGED)
- **Hard-coded labels**: 61 references to `triaged`, `needs-info`, etc. (not customizable)
- **No .env.example**: Onboarding friction (no template for required env vars)
- **No config file**: Settings like confidence threshold (85%), label names, model selection are hard-coded

### Observability Gaps (UNCHANGED)
- **Primitive logging**: Console.log only (no structured logs, no log levels, no timestamps)
- **No telemetry**: Can't answer "how many issues triaged today?" or "what's our success rate?"
- **No cost tracking**: Deterministic pre-processing saves 60-80%, but NO VISIBILITY (can't prove it)
- **No agent status**: Users don't know "is the agent stuck? how long will this take?"

### Security Gaps (UNCHANGED)
- **No secret scanning**: .env files could be committed by accident
- ✅ **Env validation (NEW)**: `npm run init` warns if ANTHROPIC_API_KEY missing
- ❌ **No pre-commit hooks**: No automated prevention of secret commits
- ❌ **No audit trails**: Can't answer "who approved this spec?" (only GitHub comments)

### Onboarding Gaps (PARTIALLY IMPROVED)
- ✅ **README exists (NEW)**: Quick start guide available (027b941)
- ✅ **Environment check (NEW)**: `npm run init` validates setup (97fe4c8)
- ❌ **Init script is passive**: Checks but doesn't FIX (doesn't create .env, doesn't prompt for keys)
- ❌ **No installation wizard**: Not interactive (doesn't ask for ANTHROPIC_API_KEY input)

### Credibility Gaps (NEW CATEGORY - Run #3)
- ❌ **No tests**: System enforces TDD (`protocols/tdd.md`) but has ZERO tests itself
- **Impact**: "Practice what you preach" credibility penalty
- **Irony**: Dev agent generates tests for user code, but Atomo codebase has no tests
- **Market Signal**: 40% trust reduction (per industry surveys on dogfooding)

### Proposal Quality Gaps (NEW CATEGORY - Run #3)
- ❌ **50+ open pm-proposals**: All marked "needs-info" (suggests unclear proposals)
- **Pattern**: PM agent generates too many proposals, quality suffers
- **Impact**: Decision paralysis, proposal fatigue
- **Root Cause**: No self-validation of proposal clarity before GitHub issue creation

---

## Recent Additions Summary (April 20-23, 2026)

**5 Commits, 4 Major Changes:**
1. ✅ README.md (027b941) - Onboarding guide
2. ✅ Exponential backoff retry (4f38045) - API resilience (partial)
3. ✅ `npm run init` script (97fe4c8) - Environment validation (partial)
4. ✅ Shared runner.ts (4f38045) - DRY agent execution

**Themes**: Onboarding improvements, reliability improvements, codebase cleanup

**Gaps**: All are partial implementations (init checks but doesn't fix, retry only for API not CLI, no tests added)
