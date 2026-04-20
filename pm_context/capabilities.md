# Current Capabilities Snapshot

**Generated**: 2026-04-20 (Run #2)

## Core Features

### Issue Classification (Gatekeeper)
- **Source**: `src/triage.ts`, `protocols/triage.md`, `protocols/reevaluation.md`
- Fetches untriaged issues via `gh` CLI
- Applies heuristic matrix: bug/enhancement/question/ambiguous
- Confidence gating (85% threshold before labeling)
- Automated clarification comments via `needs-info` label
- **FLOW B deterministic re-evaluation** (NEW - PR #4): Detects human replies and routes back to Gatekeeper/Architect **without LLM** (60-80% cost savings)

### Technical Planning (Architect)
- **Source**: `src/planner.ts`, `protocols/planning.md`, `protocols/review.md`
- Generates comprehensive tech specs (6-section markdown format)
- Zero-Waste codebase traversal (Glob → Grep → Read pattern)
- **Mandatory 2-3 clarification questions** per spec (NEW - PR #5)
- **Review loop workflow** (NEW - PR #5): `needs-review` → human feedback → `APPROVED` → `for-dev`
- Approval detection is deterministic (no LLM for "APPROVED" keyword)
- Epic breakdown for complex issues (`protocols/epic_breakdown.md`)

### Implementation & PR Creation (Dev)
- **Source**: `src/dev.ts`, `protocols/atomo_dev.md`, `protocols/tdd.md`
- Observe → Align → Execute rigid loop
- TDD-first implementation (tests before code)
- Atomic commits with co-authorship attribution
- **PR review monitoring** (NEW - PR #5): Tracks formal reviews, inline comments, and human feedback
- Deterministic routing: `APPROVED` → `merged-ready`, Changes Requested → `for-dev`
- Branch naming: `atomo/issue-{number}`

### Product Roadmap Generation (PM)
- **Source**: `src/pm.ts` (NEW - PR #6)
- Domain discovery and capability mapping
- Market research synthesis (reasoning-based)
- Modular context management (`pm_context/*.md` with 7 context files)
- GitHub issue creation for proposals (pm-proposal label)
- Enhanced deduplication: Checks open/closed issues AND PRs
- Smart retention strategies (versioned domain, rolling proposal archive)

## Integrations

### GitHub CLI (`gh`)
- **Source**: `src/github.ts`
- Issue management (list, view, comment, label)
- PR operations (create, review state tracking)
- JSON-first data format (deterministic parsing)
- **Shared helper functions** (NEW - PR #4): `gh()`, `hasHumanReplyAfterBot()`, `hasNewReviewComments()`, `extractIssueNumber()`
- Multi-repo support via `TARGET_REPO_PATH` env var

### Protocol System
- **Source**: `protocols/*.md`
- **8 modular behavior definitions**: triage, planning, confidence_gate, reevaluation, epic_breakdown, atomo_dev, tdd, review (NEW - PR #5)
- Injected into agent prompts at runtime
- Separation of "what" (agents) from "how" (protocols)

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

### Flow 3: Automated Re-Entry Loops (NEW - PR #4, #5)
- `needs-info` issues automatically re-triaged after human reply (FLOW B)
- `needs-review` specs iterate on feedback until `APPROVED`
- PR review feedback triggers re-implementation (for-dev label restored)

## Architectural Strengths

- **Cost Optimization**: Deterministic pre-processing reduces LLM calls (~60-80% savings on FLOW B)
- **Context Preservation**: Modular protocols prevent token bloat
- **Human Control**: Approval gates prevent runaway automation
- **Local-First**: No cloud dependency, runs on developer machine
- **Single Codebase**: ~1448 LOC total (lean, maintainable)
- **State Machine Architecture** (NEW): GitHub labels as explicit state transitions (triaged → needs-review → for-dev → pr-ready → merged-ready)

## Known Limitations (Identified in Run #2)

### Reliability Gaps
- **No error handling**: 13 `gh()` / `execSync` calls with no try-catch (crashes on CLI failure)
- **No retry logic**: Transient GitHub API failures cause agent failures
- **No rate limit handling**: GitHub API rate limits not detected or handled
- **No idempotency**: Re-running agents can cause duplicate comments

### Configuration Gaps
- **Hard-coded labels**: 61 references to `triaged`, `needs-info`, etc. (not customizable)
- **No .env.example**: Onboarding friction (no template for required env vars)
- **No config file**: Settings like confidence threshold (85%), label names, model selection are hard-coded

### Observability Gaps
- **Primitive logging**: Console.log only (no structured logs, no log levels, no timestamps)
- **No telemetry**: Can't answer "how many issues triaged today?" or "what's our success rate?"
- **No agent status**: Users don't know "is the agent stuck? how long will this take?"

### Security Gaps
- **No secret scanning**: .env files could be committed by accident
- **No .env validation**: Missing `ANTHROPIC_API_KEY` causes cryptic errors
- **No audit trails**: Can't answer "who approved this spec?" (only GitHub comments)

### Git Workflow Gaps
- **No branch cleanup**: Merged PRs leave stale branches (issue #7 references this)
- **No sync detection**: Agent doesn't check if it's on latest main before starting
- **No conflict handling**: Concurrent runs could cause conflicts

### User Experience Gaps
- **No installation wizard**: Manual .env setup, gh CLI authentication, repo path configuration
- **No agent cancellation**: Once started, agents run to completion (no pause/resume/cancel)
- **No progress indicators**: Long-running agents are black-box
