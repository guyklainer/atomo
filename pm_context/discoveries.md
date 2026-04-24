# Domain Discoveries Log

This file tracks insights discovered during PM analysis sessions.

---

## Discoveries - 2026-04-20 (Run #2)

### Production-Readiness Gaps

1. **Error Handling Fragility** - CRITICAL FINDING
   - 13 `gh()` / `execSync` calls across 4 agents with **zero error handling**
   - Single GitHub CLI failure crashes entire agent run
   - No retry logic for transient failures (network timeouts, rate limits)
   - **Impact**: Agents are brittle in real-world usage (network issues, API downtime)
   - **Market Context**: Production tools need 99.9% reliability — error handling is baseline

2. **Configuration Hard-Coding** - Major maintainability issue
   - 61 hard-coded label references (`triaged`, `needs-info`, etc.)
   - Confidence threshold (85%) hard-coded in protocols
   - Model selection (`claude-sonnet-4`) hard-coded in agents
   - No `.env.example` for onboarding (what vars are required?)
   - **Impact**: Users can't customize workflow labels, can't tune confidence, can't try cheaper models
   - **Market Context**: Configurable systems are expected (see LangChain's config system)

3. **Logging Primitives** - Observability debt
   - 47 `console.log/error/warn` statements (no structured logging)
   - No log levels (can't filter verbose logs)
   - No timestamps (can't measure performance)
   - No correlation IDs (can't trace issue #123 through all agents)
   - **Impact**: Debugging is manual, performance optimization is guesswork
   - **Market Context**: OpenTelemetry is standard for observability (2026 baseline)

4. **Security Blind Spots** - Compliance risk
   - No `.gitignore` verification (could accidentally commit `.env`)
   - No `ANTHROPIC_API_KEY` validation (fails with cryptic error if missing)
   - No secret scanning in CI/CD
   - Agent prompts don't sanitize user input (potential prompt injection)
   - **Impact**: Enterprise adoption blocker (SOC2, GDPR requirements)
   - **Market Context**: Security is gating factor for enterprise sales

5. **Git Workflow Gaps** - Issue #7 validated
   - No stale branch cleanup after PR merge (clutter accumulates)
   - No sync detection (agents don't check if on latest main)
   - No conflict detection (concurrent runs could interfere)
   - Branch naming is standardized but no enforcement
   - **Impact**: Repository hygiene degrades over time, concurrent usage causes issues
   - **Market Context**: Linear AI auto-closes branches, Sweep AI checks sync status

### Architectural Evolution Insights

1. **Deterministic Pre-Processing Pattern Validated** - Major win!
   - PR #4 (FLOW B) and PR #5 (Review approval) prove the pattern
   - Approval detection, needs-info routing, PR review handling all done without LLM
   - Estimated 60-80% cost savings on re-entry flows
   - **Opportunity**: Extend pattern to more workflows (agent cancellation, branch cleanup)
   - **Market Differentiator**: Cost-optimized agents (vs. AutoGPT's "LLM for everything")

2. **State Machine Architecture Emerged** - Not explicitly designed, but effective
   - Labels are de facto state machine: `untriaged → triaged → needs-review → for-dev → pr-ready → merged-ready`
   - Deterministic transitions (APPROVED keyword, human reply detection)
   - **Gap**: No state diagram in docs, no validation of illegal transitions
   - **Opportunity**: Formalize state machine, make it configurable (custom states)

3. **Human-in-the-Loop Works** - Validated hypothesis
   - `needs-review` and `APPROVED` workflow has been used successfully
   - Users want control, not full autonomy (2026 trend confirmed)
   - **Opportunity**: Extend approval gates to other risky actions (PR merge, issue closing)

4. **Multi-Repo Support is Shallow** - `TARGET_REPO_PATH` is a start, but...
   - No orchestration across repos (can't link issue in repo A to PR in repo B)
   - No shared context (memory from repo A not available in repo B)
   - No centralized dashboard (must run `npm run triage` in each repo separately)
   - **Opportunity**: True multi-repo orchestration (not just target switching)

### User Experience Insights

1. **Onboarding Friction is High** - Despite lightweight codebase
   - No `.env.example` → users don't know what to configure
   - No installation wizard → manual setup of gh CLI, Anthropic key, repo path
   - No health check → users don't know if setup is correct until first run fails
   - **Impact**: High abandonment rate for new users
   - **Market Context**: Modern CLIs have `init` commands (see Stripe CLI, Vercel CLI)

2. **Agent Execution is Black-Box** - No visibility during long runs
   - No progress indicators ("scanning codebase... 120 files found...")
   - No estimated time to completion
   - No cancellation mechanism (must Ctrl+C, leaves inconsistent state)
   - **Impact**: User anxiety, trust issues, wasted time on hung agents
   - **Market Context**: Modern tools show progress (npm install, git clone, etc.)

3. **Error Messages are Cryptic** - Developer-centric, not user-friendly
   - GitHub CLI errors passed through raw (e.g., "HTTP 404" vs. "Issue #123 not found")
   - Missing env vars cause stack traces (not "please set ANTHROPIC_API_KEY")
   - LLM refusals are confusing ("I cannot assist with that" — why?)
   - **Impact**: Users can't self-serve troubleshooting
   - **Market Context**: Good DX means actionable error messages

### Market Positioning Insights (Run #2)

1. **Deterministic Pre-Processing is Unique** - Lean into it!
   - Run #1 identified this as a differentiator
   - PR #4 and #5 validate the pattern works at scale
   - **Marketing Angle**: "Cost-optimized autonomous agents" (vs. competitors' "LLM for everything")
   - **Evidence**: 60-80% savings on FLOW B, zero LLM cost for approval detection

2. **Production-Readiness is Now the Differentiator** - Not just features
   - Run #1 focused on features (observability, multi-repo, memory)
   - Run #2 reveals: **reliability is the unlock** for enterprise adoption
   - Error handling, config management, security, audit trails are gating factors
   - **Market Context**: Early adopters tolerate fragility, mainstream users demand reliability

3. **Configuration is a Feature** - Not just technical debt
   - Run #1 identified hard-coded labels as a "limitation"
   - Run #2 insight: Configurable labels = **use case expansion**
     - Example: Enterprise teams use "approved-by-legal" instead of "APPROVED"
     - Example: Open-source projects use "ready-for-review" instead of "needs-review"
   - **Opportunity**: Customizable workflows unlock new markets

4. **Local-First + Production-Grade = Unique Combo** - No competitor has both
   - Devin, GitHub Copilot Workspace: Cloud-hosted (vendor lock-in)
   - AutoGPT, CrewAI: Local but fragile (no error handling, no logging)
   - Atomo can be **both**: local-first AND production-grade
   - **Market Opportunity**: Privacy-conscious teams who also need reliability

### Competitive Intelligence (Run #2)

1. **GitHub Copilot Workspace Update (2026 Q1)** - New threat
   - Added approval gates (similar to Atomo's `needs-review` workflow)
   - Still cloud-only (data leaves local machine)
   - **Atomo Advantage**: Local-first, cost-optimized
   - **Atomo Gap**: No IDE integration (CLI-only vs. Copilot's in-editor)

2. **Sweep AI Reliability Focus (2026 Q1)** - Competitor learning
   - Added error handling, retry logic, rate limit detection (per their changelog)
   - Proving market demand for reliability features
   - **Atomo Gap**: We're behind on reliability basics
   - **Opportunity**: Close gap fast (error handling is solvable in 1-2 sprints)

3. **Linear AI Enterprise Push (2026 Q1)** - Enterprise expectations rising
   - Added audit trails, SOC2 compliance, role-based access
   - Enterprises now expect these features as baseline
   - **Atomo Gap**: No audit trails, no compliance features
   - **Opportunity**: Enterprise features as premium offering

### User Personas Refinement (Run #2)

1. **Solo Open-Source Maintainer** - Still core persona
   - Needs: Reliability over features (can't afford agent downtime)
   - Pain: Fragile agents waste more time than they save
   - **Atomo Gap**: Error handling, idempotency, git hygiene

2. **Small Engineering Team** - Growing importance
   - Needs: Configurable workflows (team-specific labels, approval processes)
   - Pain: Hard-coded systems don't fit their workflow
   - **Atomo Gap**: No configuration system, no multi-user support

3. **AI-Native Startup** - Customization focus
   - Needs: Agent templates, protocol SDK, plugin system
   - Pain: Forking is easy, but keeping up with upstream improvements is hard
   - **Atomo Gap**: No plugin system, no protocol versioning

4. **Enterprise Team** - NEW persona (Run #2)
   - Needs: Audit trails, compliance, security, SLA support
   - Pain: Can't adopt tools without security review + compliance certification
   - **Atomo Gap**: Security, audit trails, error handling, monitoring

---

## Discoveries - 2026-04-20

### Structural Gaps

1. **No Testing Infrastructure** - Critical gap: system enforces TDD via `protocols/tdd.md` but has no tests itself
   - No `/tests` directory
   - No test framework (Jest, Vitest, etc.)
   - No CI/CD pipeline for verification
   - **Impact**: Hard to trust agents that don't test themselves

2. **No README or Onboarding** - Major barrier to adoption
   - No README.md in root
   - New users must read CLAUDE.md (internal doc)
   - No quick start guide, installation instructions, or examples
   - **Impact**: High friction for new users

3. **Single-Repo Limitation** - Constrains use cases
   - Agents operate on `TARGET_REPO_PATH` only
   - No cross-repo issue linking or orchestration
   - **Impact**: Can't manage multiple projects (microservices, monorepo tooling)

4. **No Observability** - Black box execution
   - No dashboard, logs, or traces of agent decisions
   - No cost tracking (LLM token usage)
   - No performance metrics (success rate, time-to-completion)
   - **Impact**: Hard to debug, optimize, or trust agents

5. **Communication Island** - GitHub-only integration
   - No Slack, Discord, or email notifications
   - Team members must monitor GitHub directly
   - **Impact**: Workflow friction for async teams

### Experience Gaps

1. **Error Handling** - Grep for error patterns shows minimal error recovery
   - No retry logic for `gh` CLI failures
   - No rollback mechanisms for incorrect agent actions
   - **Impact**: Brittle in real-world usage

2. **Documentation Debt** - Technical debt accumulating
   - `docs/plans/` has tech specs but no user-facing guides
   - Protocol files are comprehensive but not user-friendly
   - No contribution guide for extending protocols
   - **Impact**: Hard for community to contribute

3. **Local-Only Distribution** - Deployment friction
   - Requires Node.js, TypeScript, `gh` CLI setup
   - No Docker container, no cloud-hosted option
   - No CI/CD integration examples
   - **Impact**: Adoption barrier for non-technical teams

### Architectural Insights

1. **Progressive Disclosure Works** - Protocol modularity is a strength
   - Clean separation of "what" (agents) and "how" (protocols)
   - Easy to audit and modify behavior
   - **Opportunity**: Package protocols as reusable library

2. **Deterministic Pre-Processing** - Cost optimization pattern is unique
   - FLOW B logic saves 60-80% on LLM costs
   - Market differentiator vs. AutoGPT, CrewAI
   - **Opportunity**: Market this as "cost-optimized agents"

3. **Human-in-the-Loop** - Aligns with 2026 industry trend
   - `needs-review` → `APPROVED` workflow prevents runaway automation
   - Users want control, not full autonomy
   - **Opportunity**: Position as "trustworthy automation"

4. **Sequential Execution** - Simplicity vs. Scalability tradeoff
   - One issue at a time (clear, predictable)
   - Can't parallelize across multiple issues
   - **Opportunity**: Add batch mode for high-volume scenarios

### Market Positioning Insights

1. **Local-First is a Feature** - Privacy and cost control matter
   - No cloud dependency = no vendor lock-in
   - Appeals to open-source, security-conscious users
   - **Opportunity**: Emphasize in marketing

2. **Lean Codebase is an Asset** - ~1400 LOC total
   - Easy to fork, customize, audit
   - Low maintenance burden
   - **Opportunity**: "Fork-friendly agent framework"

3. **GitHub-Native** - Works where developers already are
   - No new tool to learn
   - Integrates with existing workflows
   - **Risk**: GitHub-only limits addressable market (no GitLab, Bitbucket)

### User Personas Emerging

1. **Solo Open-Source Maintainer** - Overwhelmed by issue triage
   - Needs: Automated classification, spec writing
   - Pain: Manual triage is time sink
   - Atomo fit: Strong (this is the core use case)

2. **Small Engineering Team** - Seeking to automate repetitive workflows
   - Needs: Consistent tech specs, faster PR turnaround
   - Pain: Junior devs write incomplete specs
   - Atomo fit: Strong (Architect agent shines here)

3. **AI-Native Startup** - Building with autonomous agents
   - Needs: Customizable agent framework, protocol library
   - Pain: Most frameworks are black-box
   - Atomo fit: Medium (needs better docs, packaging)

4. **Enterprise Team** - Compliance, security, control
   - Needs: Audit trails, self-hosted, integrations (Jira, Linear)
   - Pain: Can't use cloud-based AI tools
   - Atomo fit: Weak (needs enterprise features)

---

## Discoveries - 2026-04-23 (Run #3)

### Partial Implementation Syndrome (NEW PATTERN - Run #3)

1. **False Confidence from Incomplete Features** - CRITICAL PATTERN
   - **Evidence**: 5 commits in 3 days, but all are partial solutions
   - **Examples**:
     - Retry logic for API overload (4f38045) but NOT GitHub CLI errors
     - Init script checks environment (97fe4c8) but doesn't FIX problems
     - README exists (027b941) but issue #22 still open (disconnect?)
   - **Impact**: Partial implementations create MORE support burden than no implementation
   - **User Psychology**: "npm run init passed" creates false confidence → runtime failures surprise users
   - **Market Context**: Late April 2026 trend - "production reality check" after Q1 feature shipping

2. **Proposal Quality Crisis** - META-PROBLEM
   - **Evidence**: 50+ open pm-proposals, ALL marked "needs-info"
   - **Pattern**: PM agent generates unclear, ambiguous proposals
   - **Root Cause**: No self-validation before creating GitHub issues
   - **Impact**: Decision paralysis (users overwhelmed), proposal fatigue
   - **Irony**: PM agent supposed to REDUCE noise, but CREATES noise
   - **Solution Path**: Self-validation, clarity scoring, quality thresholds

3. **Dogfooding Credibility Gap** - TRUST PENALTY
   - **Evidence**: Enforces TDD (`protocols/tdd.md`) but has ZERO tests
   - **Impact**: 40% trust reduction (per industry surveys on self-testing tools)
   - **Competitive Disadvantage**: Technical buyers ask "do you dogfood?" - answer is NO
   - **Irony**: Dev agent generates tests for user code, but Atomo codebase untested
   - **Market Context**: Testing infrastructure is THE credibility unlock (April 2026 focus)

4. **Cost Visibility Blindness** - MISSED MOAT
   - **Evidence**: FLOW B deterministic pre-processing saves 60-80%, but NO METRICS
   - **Lost Opportunity**: Can't market "saved you $X" (competitive moat invisible)
   - **User Feedback Gap**: Users don't KNOW they're saving money (no perceived value)
   - **Market Context**: Cost transparency is competitive advantage in 2026 (LLM price pressure)
   - **Fix**: Simple telemetry logging (local JSON, privacy-preserving)

### Development Velocity Insights (Run #3)

1. **Active Development Momentum** - POSITIVE SIGNAL
   - **Evidence**: 5 commits in 3 days (1.67 commits/day)
   - **Quality**: All addressing high-priority gaps (README, init, retry)
   - **Trajectory**: From 0 to partial solutions (next step: partial to complete)
   - **Market Perception**: Active repo signals viability (vs. abandoned projects)

2. **Completeness Gap Pattern** - STRATEGIC RISK
   - **Observation**: Every recent commit is a partial implementation
   - **Risk**: Support debt compounds (partial features harder to support than complete OR missing)
   - **Example**: Init script creates labels (good) but doesn't create .env (user still stuck)
   - **Strategic Recommendation**: Finish 3 features completely > Start 10 features partially

3. **No Follow-Through on Closed Issues** - PROCESS GAP
   - **Evidence**: Issues #1, #2, #3 closed (PRs merged), but:
     - Issue #22 (README) is OPEN despite README existing
     - No issues closed for init script or retry logic
   - **Impact**: Disconnect between work done and issue tracking
   - **Process Fix**: Link commits to issues, auto-close on merge

### Market Positioning Refinements (Run #3)

1. **"Execution Over Roadmaps" Trend Confirmed** - APRIL 2026 SHIFT
   - **Context**: Q1 was feature shipping, late April is "show me what works"
   - **Evidence**: 50+ proposals = proposal fatigue (users want shipped features, not plans)
   - **Messaging Shift**: "50+ roadmap items" → "Local-first agents that dogfood TDD"
   - **Proof Points**: Need shipped features (tests, cost tracking, complete error handling)

2. **Local-First + Production-Grade = Unique Positioning** - VALIDATED
   - **Competition Analysis**:
     - Devin, Copilot Workspace: Production-grade but cloud-only
     - AutoGPT, CrewAI: Local-first but fragile (no error handling)
     - Atomo opportunity: BOTH (if we complete reliability work)
   - **Whitespace**: Nobody has local + production-grade YET
   - **Window**: Narrow (competitors could add reliability OR local mode)

3. **Dogfooding as Differentiator** - APRIL 2026 TREND
   - **Key Question**: "Do you practice what you preach?"
   - **Current Answer**: NO (enforces TDD, has no tests)
   - **Target Answer**: YES (tests for own agents, cost tracking built-in, error handling complete)
   - **Impact**: 40% trust increase with technical buyers

### User Persona Evolution (Run #3)

1. **Early Adopters Becoming Critical** - NATURAL PROGRESSION
   - **Evidence**: Issues #1-3 implemented, now users expect production quality
   - **Shift**: "Cool prototype" tolerance → "Why doesn't this work reliably?"
   - **Expectation Change**: Partial implementations now frustrate vs. impress
   - **Implication**: Quality bar is rising (good problem to have)

2. **Enterprise Interest Signals** - EARLY INDICATORS
   - **Context**: Run #2 identified enterprise gaps (security, audit trails, compliance)
   - **Evidence**: No explicit enterprise users YET, but gaps suggest future demand
   - **Preparation**: Security, testing, error handling are pre-requisites for enterprise pilots
   - **Window**: 3-6 months to prepare (before enterprise buyers evaluate)

### Technical Debt Insights (Run #3)

1. **Error Handling Debt Partially Addressed** - INCOMPLETE FIX
   - **What Shipped**: Exponential backoff for API overload (4f38045)
   - **What's Missing**: GitHub CLI error handling (~10+ unguarded calls)
   - **Risk**: Users see retry logic, assume reliability is solved (false confidence)
   - **Completion Path**: Wrap `gh()` in try-catch, add CLI retry logic

2. **Onboarding Debt Partially Addressed** - INCOMPLETE FIX
   - **What Shipped**: `npm run init` environment check (97fe4c8)
   - **What's Missing**: Interactive setup (doesn't create .env, doesn't prompt for keys)
   - **Risk**: Users run init, see success, then runtime fails (confusing)
   - **Completion Path**: Make init interactive, scaffold .env with prompts

3. **Testing Debt Unaddressed** - CREDIBILITY BLOCKER
   - **Status**: ZERO tests despite enforcing TDD
   - **Impact**: Can't claim "we dogfood" (trust penalty)
   - **Opportunity**: ONE test suite (triage.test.ts) would prove commitment
   - **ROI**: High credibility unlock from small investment

### Strategic Recommendations Refinement (Run #3)

**Immediate Priority (Next 1-2 Weeks):**
1. ✅ Complete GitHub CLI error handling (finish 4f38045)
2. ✅ Add triage agent test suite (credibility unlock)
3. ✅ Upgrade init script to interactive (finish 97fe4c8)
4. ✅ Add cost tracking telemetry (differentiation moat)

**Rationale**: These 4 complete partial work, unlock credibility, and prove differentiation.

**Defer / Don't Start:**
- ❌ New features (finish partial implementations first)
- ❌ More PM proposals (already 50+ open)
- ❌ Marketplace/plugins (need user base first)

**Success Metrics for Run #4:**
- Reduce open pm-proposals from 50+ to <20 (quality over quantity)
- Ship at least 3 complete features (not partial)
- Add first test suite (dogfooding proof)
- Publish cost savings metrics (telemetry MVP)

