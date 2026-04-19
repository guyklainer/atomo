# Domain Discoveries Log

This file tracks insights discovered during PM analysis sessions.

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
