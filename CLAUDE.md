# Project Setup
This repository uses Node.js and TypeScript to run a single, local autonomous agent based on the `@anthropic-ai/claude-agent-sdk`.

## ⚠️ CRITICAL: Progressive Disclosure Architecture Rule ⚠️

**READ THIS BEFORE MODIFYING ANY AGENT FILE (`src/*.ts`)**

This file (`CLAUDE.md`) is the **sole authoritative source** for all high-level architectural rules and links to specific protocols.

### The Golden Rule: Single Source of Truth

**Protocol files** (`protocols/*.md`) contain ALL implementation details, phases, steps, and decision logic.  
**TypeScript files** (`src/*.ts`) contain ONLY:
- The ordered sequence of actions (what to do, when)
- Brief references to protocols by name (e.g., "Follow the Atomo Dev Protocol phases as defined in ATOMO_DEV_PROTO")
- Agent-specific runtime values (model, tools, issue numbers, file paths)

### 🚫 VIOLATION EXAMPLES (DO NOT DO THIS)

**❌ BAD - Duplicating protocol content in TypeScript:**
```typescript
const SYSTEM_PROMPT = `
PHASE 1: GROUNDING
1. Read the issue
2. Read the TECH_SPEC
3. Create a branch
4. Do XYZ detailed steps...

PHASE 2: PATTERN DISCOVERY
1. Use Grep to find...
2. Search for patterns...
`;
```

**✅ GOOD - Brief protocol reference:**
```typescript
const SYSTEM_PROMPT = `
Follow the complete 'Atomo: The Methodical Dev Protocol' (Phases 0-5) as defined in the ATOMO_DEV_PROTO injected above.

AGENT-SPECIFIC RUNTIME VALUES:
- Target Issue: #${issueNumber}
- Feature Branch: atomo/issue-${issueNumber}
`;
```

### Why This Matters

**Copy-pasting protocol content into TypeScript files creates:**
1. **Drift**: Protocol updates don't propagate to agent files (leads to inconsistent behavior)
2. **Duplication**: Same logic defined in multiple places (hard to maintain)
3. **Confusion**: Which is the source of truth? The .ts file or the .md file?
4. **Bloat**: System prompts become massive and waste tokens

**The protocol files are ALREADY injected into the agent's context.** Repeating them inline is redundant and dangerous.

### When Modifying Agents

If you are modifying an agent file (`src/planner.ts`, `src/dev.ts`, `src/triage.ts`) and find yourself:
- Writing detailed step-by-step instructions (PHASE 1, PHASE 2, etc.)
- Defining classification criteria, scoring weights, or decision thresholds
- Copy-pasting content from protocol files

**STOP.** You are violating Progressive Disclosure.

**Instead:**
1. Add the detailed logic to the appropriate protocol file in `protocols/`
2. Reference it by name in the TypeScript file with a brief instruction
3. Keep the TypeScript file lean and focused on runtime orchestration

### Compliance Check

Before committing changes to any `src/*.ts` file, verify:
- [ ] No PHASE instructions duplicated from protocol files
- [ ] No classification criteria or decision logic inline
- [ ] Only runtime values (issue numbers, file paths, model names) are hardcoded
- [ ] Brief protocol references (< 5 lines) instead of detailed steps

---

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
