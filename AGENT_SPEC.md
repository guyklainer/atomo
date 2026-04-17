# Lean Local Triage Agent Specification

This specification defines a lean, local-first Issue Triage & Technical Planning Agent. This system replaces complex, multi-agent orchestrators with a single, high-capability agent built on the `@anthropic-ai/claude-agent-sdk`.

## 1. System Objective
The agent’s primary role is to serve as an autonomous "gatekeeper" and "architect" running locally within your repository. It must:
- Fetch and parse open GitHub issues via the local `gh` CLI.
- Classify them using a strict, deterministic heuristic matrix.
- Engage in a clarification loop via automated GitHub comments if details are missing.
- Generate comprehensive technical specifications to prepare issues for implementation.

## 2. Technical Stack & Architecture
- **Execution Engine**: Node.js & TypeScript, utilizing the `@anthropic-ai/claude-agent-sdk`.
- **Execution Paradigm**: The ReAct (Reasoning and Acting) loop, automated via the SDK's `query()` asynchronous generator.
- **Data Ingestion**: Local GitHub CLI (`gh`) accessed directly via the SDK's built-in `bash` tool.
- **Codebase Discovery**: Native SDK file operations (`glob`, `grep`, `read`, `write`, `edit`).
- **Operating Mode**: Sequential, headless execution (isolated per issue) to preserve context window clarity and prevent memory contamination.

## 3. Core Operational Phases

### Phase 1: Data Ingestion (The Scanner)
- **Listing**: Execute `gh issue list --json number,title,createdAt,state` via the `bash` tool.
- **Target Analysis**: Select a target issue and fetch the comprehensive payload: `gh issue view <number> --json number,title,body,labels,comments,reactionGroups`.
- **Structured Predictability**: Standardize around JSON from `gh` to minimize token waste and parse metadata deterministically instead of scraping text.

### Phase 2: Cognitive Analysis (The Judge)
The agent must use **Chain-of-Thought (CoT)** reasoning. Before producing a decision, it must document its internal symptom-to-domain deductive reasoning.
- **Meta-Prompt Heuristic Matrix**:
  - **Bug**: Requires error messages, stack traces, or "fail/crash" keywords. *Action:* Apply label. Check for reproduction steps.
  - **Enhancement**: Requests "support for," "new feature," or "enable." *Action:* Evaluate impact vs. architecture.
  - **Question**: "How to," "why," or "what." *Action:* Apply question label and suggest references.
  - **Ambiguous**: Lacks technical depth. *Action:* Apply `needs-triage` and halt for human review.

### Phase 3: Clarification Loop (The Diplomat)
- **Gatekeeping**: Incomplete issues fail validation (e.g., bug without logs or a stack trace). The agent must halt the planning phase here.
- **Zero-Guessing Policy**: "If you don't have enough information to answer accurately, ask clarifying questions instead of guessing."
- **Automated Response**: Formulate requests and post them via `gh issue comment <number> --body "<detailed_missing_info_request>"`.

### Phase 4: Specification Synthesis (The Architect)
Once an issue is validated as "ready," the agent actively explores the local codebase using `grep` and `glob`.
- **File Output**: Formulates a plan using the `write` tool, saving it to `.triage/issue_<number>_brief.md` (or `docs/tech-specs/`).
- **Required Markdown Template**:
  1. **Project Overview**: Succinct problem and goal.
  2. **Architectural Context**: Key files affected, referenced directly using paths found during exploration.
  3. **Technical Requirements**: Required UI, database, or API adjustments.
  4. **Implementation Plan**: Granular, step-by-step instructions.
  5. **Risk Assessment**: Blindspots, regressions, or constraints.
  6. **Acceptance Criteria**: Measurable conditions of success (tests to pass).

## 4. Local State & Memory Management
- **`CLAUDE.md` (Persistent Memory)**: Foundational instructions in the project root. Defines immutable rules, local directory structures, `gh` JSON guidelines, and efficiency directives (e.g., favoring `grep` over reading entire files). Follows the principle of progressive disclosure.
- **Auto-Memory (Transient Learning)**: System patterns and codebase recurring idiosyncrasies recorded by Claude automatically in `.claude/agent-memory/`.

## 5. Development Milestones

### Milestone 1: Setup & Ingestion
- Set up a Node.js/TypeScript environment; install `@anthropic-ai/claude-agent-sdk`.
- Ensure local authentication with `gh auth login`.
- Build the core ReAct loop to successfully fetch issues from `gh` and parse them into structured text blocks for the agent.

### Milestone 2: Intelligent Triage Engine
- Inject the Meta-Prompt Heuristics Matrix into the agent's initialization instructions.
- Ensure the agent utilizes CoT reasoning to process mock test issues locally.

### Milestone 3: Automated Clarification
- Establish the completeness threshold (gatekeeper logic).
- Verify the agent can construct clarifying questions and use the bash tool to simulate posting comments via `gh`.

### Milestone 4: Codebase-Aware Technical Planning
- Combine the codebase logic into the flow. Give the agent strict instructions on formatting the Technical Specification.
- Ensure it actively writes the `TECH_SPEC.md` to disk.

### Milestone 5: Optimization & Headless Integration
- Isolate the script to run entirely sequentially (`node triage.js --issue 42`).
- Finalize `CLAUDE.md` definitions to direct token efficiency.
