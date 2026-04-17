# Project Setup
This repository uses Node.js and TypeScript to run a single, local autonomous agent based on the `@anthropic-ai/claude-agent-sdk`.

## Triage Protocol
* **Primary Tool**: Use the `bash` tool to interface with the local GitHub CLI (`gh`) for all issue management and data fetching.
* **Data Format**: Always request issue data in strict JSON format using the `--json` flag to assure deterministic inputs. Avoid parsing arbitrary text if JSON fields exist.

## Technical Planning: The Zero-Waste Protocol
If you are instructed to perform Technical Planning for an issue:
1. You are strictly prohibited from randomly reading entire files to understand them. This pollutes your context window and spikes token costs!
2. You MUST use the `Glob` tool to identify structural boundaries, and the `Grep` tool to locate exact keyword lines. 
3. Pluck only precise target lines when using the `Read` tool. Traverse the local codebase securely to identify the exact functional intersections that must change to satisfy the issue.
4. Use your `Write` tool to emit a single file named `docs/plans/TECH_SPEC_{number}.md`. Ensure the `docs/plans` directory exists first using Bash if necessary. Include the Root Cause/Requirements, target files, and a step-by-step implementation pseudo-code roadmap for the human developer.
5. Finally, use your `Bash` tool to attach the specification back to the remote repository so downstream agents can prioritize it: `gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md`

## Commands
* **Run Scanner**: `npx tsx triage.ts`
