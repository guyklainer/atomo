# Current Capabilities Snapshot

**Generated**: 2026-04-20

## Core Features

### Issue Classification (Gatekeeper)
- **Source**: `src/triage.ts`, `protocols/triage.md`
- Fetches untriaged issues via `gh` CLI
- Applies heuristic matrix: bug/enhancement/question/ambiguous
- Confidence gating (85% threshold before labeling)
- Automated clarification comments via `needs-info` label
- FLOW B deterministic re-evaluation (human reply detection)

### Technical Planning (Architect)
- **Source**: `src/planner.ts`, `protocols/planning.md`, `protocols/review.md`
- Generates comprehensive tech specs (6-section markdown format)
- Zero-Waste codebase traversal (Glob → Grep → Read pattern)
- Mandatory 2-3 clarification questions per spec
- Review loop workflow: `needs-review` → human feedback → `APPROVED` → `for-dev`
- Epic breakdown for complex issues (`protocols/epic_breakdown.md`)

### Implementation & PR Creation (Dev)
- **Source**: `src/dev.ts`, `protocols/atomo_dev.md`, `protocols/tdd.md`
- Observe → Align → Execute rigid loop
- TDD-first implementation (tests before code)
- Atomic commits with co-authorship attribution
- PR review monitoring and feedback iteration
- Branch naming: `atomo/issue-{number}`

### Product Roadmap Generation (PM)
- **Source**: `src/pm.ts`
- Domain discovery and capability mapping
- Market research synthesis (reasoning-based)
- Modular context management (`pm_context/*.md`)
- GitHub issue creation for proposals
- Deduplication against closed issues/PRs

## Integrations

### GitHub CLI (`gh`)
- **Source**: `src/github.ts`
- Issue management (list, view, comment, label)
- PR operations (create, review state tracking)
- JSON-first data format (deterministic parsing)
- Target repository support via `TARGET_REPO_PATH` env var

### Protocol System
- **Source**: `protocols/*.md`
- 8 modular behavior definitions (triage, planning, confidence_gate, reevaluation, epic_breakdown, atomo_dev, tdd, review)
- Injected into agent prompts at runtime
- Separation of "what" (agents) from "how" (protocols)

## User-Facing Flows

### Flow 1: Issue → Triage → Plan → Implement → PR
1. User creates GitHub issue
2. `npm run triage` classifies it (Gatekeeper)
3. `npm run plan` generates tech spec (Architect)
4. User approves spec via comment
5. `npm run dev` implements and creates PR (Dev)
6. User reviews PR, agent iterates on feedback

### Flow 2: Roadmap Generation
1. `npm run pm` analyzes domain and gaps
2. PM agent creates GitHub issues for feature proposals
3. User reviews/closes proposals
4. Accepted proposals enter Flow 1

### Flow 3: Re-Evaluation Loops
- `needs-info` issues automatically re-triaged after human reply
- `needs-review` specs iterate on feedback until `APPROVED`
- PR review feedback triggers re-implementation

## Architectural Strengths
- **Cost Optimization**: Deterministic pre-processing reduces LLM calls (~60-80% savings)
- **Context Preservation**: Modular protocols prevent token bloat
- **Human Control**: Approval gates prevent runaway automation
- **Local-First**: No cloud dependency, runs on developer machine
- **Single Codebase**: ~1400 LOC total (lean, maintainable)
