# Proposal Archive

This file maintains the last 3 runs of proposals for deduplication.

---

## Run 2 - 2026-04-20

### Core Logic (8 proposals)

- **HIGH**: Error Handling & Resilience Framework
  - Wrap all gh()/execSync calls with try-catch
  - Exponential backoff retry logic for transient failures
  - Graceful degradation (partial success instead of full crash)
  - **Rationale**: 13 unguarded CLI calls are single points of failure
  - **Market Context**: Sweep AI added resilience in 2026 Q1 — now baseline expectation

- **HIGH**: Configuration Management System
  - Move hard-coded values to `atomo.config.ts` (labels, thresholds, model selection)
  - Support env var overrides for CI/CD flexibility
  - Configuration validation on startup (fail fast with helpful errors)
  - **Rationale**: 61 hard-coded label references prevent workflow customization
  - **Market Context**: LangChain's config system is industry standard

- **HIGH**: Structured Logging & Telemetry
  - Replace console.log with winston/pino (log levels, timestamps, JSON format)
  - Add correlation IDs (track issue #123 across all agents)
  - Telemetry hooks for metrics (issues triaged per day, success rate, cost per issue)
  - **Rationale**: 47 console.log statements, no observability
  - **Market Context**: OpenTelemetry is 2026 baseline for production tools

- **HIGH**: Agent Lifecycle Management (Pause/Resume/Cancel)
  - Add signal handlers (SIGINT, SIGTERM) for graceful shutdown
  - State persistence (resume interrupted agents)
  - Web UI or CLI for real-time status ("Agent is scanning codebase... 50% done")
  - **Rationale**: Long-running agents are black-box, no cancellation
  - **Market Context**: Modern CLIs support interruption (npm install can be cancelled)

- **MED**: Idempotency Guards
  - Track action history (SQLite or JSON file) to prevent duplicate comments/labels
  - Hash-based deduplication for generated content (same spec not posted twice)
  - Re-run safety (agents can be safely re-run without side effects)
  - **Rationale**: Re-running agents can cause duplicate actions
  - **Market Context**: Idempotency is REST API best practice, applies to agents too

- **MED**: Rate Limit Handler & API Resilience
  - Detect GitHub API rate limit headers (X-RateLimit-Remaining)
  - Auto-pause when approaching limits, resume after reset
  - Batch operations to minimize API calls (bulk label updates)
  - **Rationale**: No rate limit handling — agents crash on limit exceeded
  - **Market Context**: GitHub API best practices (all production tools handle this)

- **MED**: Caching Layer for Codebase Analysis
  - Cache Glob/Grep results with invalidation on git commit hash change
  - Cache protocol loading (currently re-reads on every run)
  - Reduces redundant work for re-runs on same codebase state
  - **Rationale**: Zero-Waste protocol scans codebase every run (slow for large repos)
  - **Market Context**: Cursor caches codebase context, massive speed improvement

- **LOW**: LLM Provider Abstraction Layer
  - Abstract Anthropic SDK behind interface (support OpenAI, Azure OpenAI, local models)
  - Configuration for model selection per agent (cheap model for triage, powerful for dev)
  - Cost optimization: Use smaller models where sufficient
  - **Rationale**: Currently Anthropic-only (vendor lock-in)
  - **Market Context**: LangChain supports 50+ providers — flexibility expected

### API (4 proposals)

- **MED**: GitHub App Packaging & Distribution
  - Package agents as installable GitHub App (not just CLI)
  - OAuth flow for authentication (no manual gh CLI setup)
  - Marketplace listing for discoverability
  - **Rationale**: CLI setup friction high (gh CLI, Node.js, .env)
  - **Market Context**: Sweep AI is a GitHub App — easier onboarding

- **MED**: Custom Label Schema Configuration
  - API to define custom label names (e.g., "approved-by-legal" instead of "APPROVED")
  - Custom state machines (add states beyond 5-state baseline)
  - Workflow templates (e.g., "Enterprise Approval Workflow")
  - **Rationale**: Hard-coded labels limit enterprise adoption
  - **Market Context**: Enterprise teams have existing label conventions

- **LOW**: Agent Health Check Endpoint
  - REST endpoint: GET /health (returns agent status, last run, error count)
  - Enables monitoring integrations (Datadog, New Relic, PagerDuty)
  - Uptime tracking, SLA measurement
  - **Rationale**: No health check mechanism for production deployment
  - **Market Context**: Kubernetes health checks are standard for services

- **LOW**: Multi-User Team Management API
  - Role-based access control (who can approve specs, who can trigger agents)
  - Team dashboards (track each user's activity)
  - Audit logs (who did what, when)
  - **Rationale**: Currently single-user (no team collaboration features)
  - **Market Context**: Linear AI has team management — enterprise requirement

### Docs (4 proposals)

- **HIGH**: Installation Wizard (Interactive CLI)
  - `npm run init` launches interactive setup (Anthropic key, gh auth, target repo)
  - Validates configuration (test GitHub connection, API key)
  - Generates `.env` and `.atomo.config.ts` with sensible defaults
  - **Rationale**: No .env.example, manual setup is high-friction
  - **Market Context**: Vercel CLI, Stripe CLI have init flows — best practice

- **HIGH**: Security Best Practices Guide
  - Document secret management (never commit .env, use 1Password/Vault)
  - Pre-commit hooks for secret scanning (detect ANTHROPIC_API_KEY in diffs)
  - Compliance guide (SOC2, GDPR considerations)
  - **Rationale**: No security docs — enterprise blocker
  - **Market Context**: Security is gating factor for enterprise adoption

- **MED**: State Machine Diagram & Workflow Visualization
  - Mermaid diagram of label state machine (untriaged → triaged → needs-review → for-dev → pr-ready → merged-ready)
  - Docs for customizing states (add "legal-review" state)
  - Interactive state explorer (given current labels, what are valid next states?)
  - **Rationale**: State machine is implicit (no docs)
  - **Market Context**: Linear AI visualizes workflow states — clarity drives adoption

- **LOW**: Agent Performance Benchmarks
  - Publish benchmark results (time to triage 100 issues, cost per issue, success rate)
  - Self-benchmark command (`npm run benchmark`) for users to compare their setup
  - Competitive comparison table (Atomo vs. Sweep AI vs. Linear AI)
  - **Rationale**: No performance data — users can't evaluate ROI
  - **Market Context**: Database vendors publish TPC benchmarks — builds trust

### DX (4 proposals)

- **HIGH**: Secret Scanning & .env Validation
  - Pre-commit hook to block .env commits
  - Startup validation (fail with "ANTHROPIC_API_KEY not set" instead of stack trace)
  - Integration with secret managers (1Password CLI, AWS Secrets Manager)
  - **Rationale**: No secret protection — accidental commits likely
  - **Market Context**: GitHub secret scanning is free — users expect it

- **HIGH**: Branch Cleanup & Git Hygiene Automation
  - Auto-delete merged branches after PR merge
  - Sync detection (warn if not on latest main before starting agent)
  - Conflict detection (block if uncommitted changes)
  - **Rationale**: Issue #7 reports git hygiene problems
  - **Market Context**: Linear AI auto-closes branches — reduces clutter

- **MED**: Protocol Versioning System
  - Semantic versioning for protocols (triage.md v2.1.0)
  - Compatibility matrix (agent X requires protocol Y >= 2.0)
  - Breaking change alerts on protocol updates
  - **Rationale**: No versioning — breaking changes affect all users simultaneously
  - **Market Context**: npm, Docker use semantic versioning — standard practice

- **MED**: Agent Template Generator
  - CLI command: `npm run create-agent --name security-auditor`
  - Scaffolds new agent file with boilerplate (imports, protocol loading, main loop)
  - Template protocols (auditor.md with standard structure)
  - **Rationale**: Creating new agents requires understanding internals
  - **Market Context**: Create-react-app, create-next-app pattern — lowers contribution barrier

**Key Themes**: Production readiness, reliability, configuration, security, DX polish
**Market Drivers**: Enterprise adoption, mainstream readiness, competitive parity with Sweep AI/Linear AI
**Differentiators**: Local-first + production-grade (unique combo), cost-optimized resilience

---

## Run 1 - 2026-04-20

### Core Logic (8 proposals)
- **HIGH**: Agent Observability Dashboard (#8)
- **HIGH**: Multi-Repository Orchestration (#9)
- **HIGH**: Long-Term Memory System (#10)
- **HIGH**: Automated Rollback & Recovery (#11)
- **MED**: Parallel Issue Processing / Batch Mode (#12)
- **MED**: Agent Collaboration Protocol (#13)
- **MED**: Cost & Performance Analytics (#14)
- **LOW**: Agent Marketplace & Protocol Library (#15)

### API (6 proposals)
- **HIGH**: Slack Integration (Real-Time Notifications) (#16)
- **HIGH**: Webhook API for External Triggers (#17)
- **HIGH**: REST API for Agent Control (#18)
- **MED**: Linear & Jira Bidirectional Sync (#19)
- **MED**: GitLab & Bitbucket Support (#20)
- **LOW**: Discord Bot Interface (#21)

### Docs (6 proposals)
- **HIGH**: README with Quick Start Guide (#22)
- **HIGH**: Video Walkthrough (YouTube) (#23)
- **HIGH**: Protocol Authoring Guide (#24)
- **MED**: Architecture Deep-Dive (Blog Post) (#25)
- **MED**: Comparison Guide (Atomo vs. Competitors) (#26)
- **LOW**: Agent Cookbook (Community Recipes) (#27)

### DX (6 proposals)
- **HIGH**: Testing Infrastructure (Self-Dogfooding) (#28)
- **HIGH**: Agent Execution Logs & Debugging Mode (#29)
- **HIGH**: Docker Container for One-Command Setup (#30)
- **MED**: CI/CD Integration Examples (GitHub Actions) (#31)
- **MED**: Protocol Validation Tool (Linter) (#32)
- **LOW**: VS Code Extension (Protocol Editor) (#33)

**Key Themes**: Observability, testing, documentation, market expansion (integrations), and DX improvements.
**Market Drivers**: Competitive parity with AutoGPT/CrewAI/Devin, onboarding friction reduction, enterprise readiness.


---

## Run 3 - 2026-04-23

**Philosophy**: Quality over quantity, completion over creation
**Context**: 50+ existing pm-proposals, all marked "needs-info"
**Total Proposals**: 8 (vs. 20 in Run #2, 26 in Run #1)

### HIGH PRIORITY (4 proposals - NEW)

- **Complete GitHub CLI Error Handling** (Finish 4f38045)
  - Category: Core Logic - Reliability
  - Rationale: Commit 4f38045 added retry for API overload, but ~10+ `gh()` CLI calls still unguarded
  - Solution: Wrap all `gh()` calls with try-catch, add exponential backoff for network errors
  - Market Context: Sweep AI reliability focus (Q1 2026) proved complete error handling is table-stakes
  - Differentiation: Production-grade local agents require both API AND CLI error handling

- **Triage Agent Test Suite** (Dogfooding Proof-of-Concept)
  - Category: DX - Testing  
  - Rationale: Atomo enforces TDD but has ZERO tests (40% trust penalty per industry surveys)
  - Solution: Create `tests/triage.test.ts` with 80%+ coverage, use Vitest
  - Market Context: Self-testing agents gain 40% more trust (credibility unlock)
  - Differentiation: "We enforce TDD and practice it" - unique positioning

- **Cost Tracking Telemetry MVP**
  - Category: Core Logic - Observability
  - Rationale: FLOW B saves 60-80% but NO VISIBILITY (can't prove competitive advantage)
  - Solution: Track LLM calls/tokens/cost, display "Processed 5 issues | Cost: $1.20 (saved $4.80)"
  - Market Context: Cost transparency wins in 2026 (LLM price pressure)
  - Differentiation: Only tool showing cost savings from deterministic pre-processing

- **Upgrade Init Script to Interactive Setup**
  - Category: DX - Onboarding
  - Rationale: `npm run init` checks but doesn't FIX (commit 97fe4c8 is passive)
  - Solution: Interactive prompts for ANTHROPIC_API_KEY, create .env, validate before saving
  - Market Context: Vercel CLI, Stripe CLI have interactive init (industry standard)
  - Differentiation: One-command setup competitive with cloud-hosted tools

### MEDIUM PRIORITY (4 proposals - NEW)

- **PM Agent Self-Validation** (Meta-Improvement)
  - Category: Core Logic - Quality
  - Rationale: 50+ pm-proposals all marked "needs-info" (proposal quality crisis)
  - Solution: Self-validation before creating issues (clarity score >80), reject unclear proposals
  - Market Context: Proposal fatigue is real (late April 2026 trend: execution > roadmaps)
  - Differentiation: PM agent that improves itself (meta-learning signal)

- **Agent Progress Indicators**
  - Category: DX - User Experience
  - Rationale: Long-running agents are black-box (user anxiety)
  - Solution: Log progress milestones ("Scanning... 50 files", "Spec section 3/6"), estimated time
  - Market Context: Progress indicators are UX baseline (npm, git standard)
  - Differentiation: Transparent agents build trust

- **.env.example Template** (Quick Win)
  - Category: Docs
  - Rationale: No .env.example (users don't know required vars)
  - Solution: Create template with comments explaining each var
  - Market Context: .env.example is standard practice
  - Differentiation: Professional setup experience (enterprise readiness signal)

- **Complete Error Handling for Init Script**
  - Category: DX - Reliability
  - Rationale: scripts/init.ts has gaps (doesn't validate repo access, API key format)
  - Solution: Comprehensive try-catch, validate GitHub permissions, validate API key format
  - Market Context: Good DX means no cryptic errors
  - Differentiation: Professional setup experience

**Key Themes**: Completion of partial work, dogfooding credibility, cost visibility, quality over quantity

**Strategic Shift**: Run #1 focused on features (26 proposals), Run #2 on production readiness (20 proposals), Run #3 on COMPLETING partial work (8 proposals)

**Market Drivers**: Post-Q1 reliability reckoning, proposal fatigue, dogfooding as trust signal, cost transparency as moat

**Differentiators**: Local-first + production-grade (unique combo), cost-optimized with proof (telemetry), practice what we preach (tests)

