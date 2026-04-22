# Project Setup
This repository uses Node.js and TypeScript to run a single, local autonomous agent based on the `@anthropic-ai/claude-agent-sdk`.

## Architectural Rule: Progressive Disclosure (READ THIS FIRST)
This file (`CLAUDE.md`) is the **sole authoritative source** for all high-level architectural rules and links to specific protocols.

TypeScript agent files (`src/*.ts`) define **only**:
- The ordered sequence of steps (what to do and when)
- Brief one-line references to protocols by name (e.g. "apply the Zero-Waste Protocol from the injected rules")
- Agent-specific runtime values (model, tools, issue numbers)

**TypeScript agent files must NEVER re-define or copy-paste content from this file or any protocol file inline.**
If you are modifying an agent and find yourself writing protocol logic (classification criteria, scoring weights, decision thresholds) inside a `.ts` file — stop. Add it to a protocol file in the `protocols/` directory and reference it by name.

## Modular Protocols
For technical details and strict behavior rules, refer to the following:

- **[Triage Protocol](./protocols/triage.md)**: Metadata matrix and classification rules.
- **[Zero-Waste Protocol](./protocols/planning.md)**: Rules for codebase traversal and technical planning.
- **[Confidence Gate Protocol](./protocols/confidence_gate.md)**: Scored self-evaluation checklists.
- **[needs-info Protocol](./protocols/reevaluation.md)**: Automated re-entry loop for clarifications.
- **[Atomic Epic Breakdown](./protocols/epic_breakdown.md)**: Rules for splitting complex issues.
- **[Atomo Dev Protocol](./protocols/atomo_dev.md)**: Rigid Observe → Align → Execute loop rules.
- **[TDD Protocol](./protocols/tdd.md)**: Mandatory testing and verification discipline.


---

## Commands
* **Run Gatekeeper**: `npm run triage` (Cheap/Fast classification of untriaged issues)
* **Run Architect**: `npm run plan` (Heavy codebase scanning to plan triaged issues)
* **Run Dev**: `npm run dev` (Transforms planned tech specs into committed PRs)
