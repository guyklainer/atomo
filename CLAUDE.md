# Project Setup
This repository uses Node.js and TypeScript to run a single, local autonomous agent based on the `@anthropic-ai/claude-agent-sdk`.

## Triage Protocol
* **Primary Tool**: Use the `bash` tool to interface with the local GitHub CLI (`gh`) for all issue management and data fetching.
* **Data Format**: Always request issue data in strict JSON format using the `--json` flag to assure deterministic inputs. Avoid parsing arbitrary text if JSON fields exist.

## Technical Planning: The Zero-Waste Protocol
If you are instructed to perform Technical Planning for an issue:
1. You are strictly prohibited from randomly reading entire files to understand them. This pollutes your context window and spikes token costs!
2. You MUST use the `Glob` tool to identify structural boundaries, and the `Grep` tool to locate exact keyword lines. 
3. **Skill Discovery**: Explicitly search inside the `.claude/` and `.agents/` directories of the target repository for existing markdown skills or domain protocols. You must read these and aggressively integrate their predefined standards into your tech spec!
4. Pluck only precise target lines when using the `Read` tool. Traverse the local codebase securely to identify the exact functional intersections that must change to satisfy the issue.
5. **ICE Prioritization**: Before writing the document, calculate a Priority Score `P = (I * C) / E`.
   - **Impact (I) [1-5]**: How many users does this affect?
   - **Confidence (C) [1-5]**: How sure are you about the targeted root cause?
   - **Ease/Effort (E) [1-5]**: How difficult is this implementation blueprint? (Higher = harder, dividing prioritizes quick wins).
6. Use your `Write` tool to emit a single file named `docs/plans/TECH_SPEC_{number}.md`. Ensure the `docs/plans` directory exists first using Bash if necessary. You MUST prominently prepend the calculated **Priority Score (P)** along with the **I, C, E breakdown** (e.g., `Priority: 6.0 (I=3, C=4, E=2)`) at the top of the document. Include the Root Cause/Requirements, target files, and a step-by-step implementation pseudo-code roadmap.
7. Finally, use your `Bash` tool to attach the specification back to the remote repository so downstream agents can prioritize it: `gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md`

## Atomic Epic Breakdown Protocol
If an issue requires more than one logically separable deliverable (e.g., DB migration + API layer + UI), you MUST break it into atomic child issues rather than shipping one monolithic spec. Follow these strict rules:

1. **Split into Phases**: Identify discrete, independently deployable and testable phases (e.g., "Phase 1: DB Schema", "Phase 2: API Route", "Phase 3: UI Component").
2. **Create Child Issues**: For each Phase, use the Bash tool to create a new GitHub Issue:
   `gh issue create --title "Epic #<parent>: <Phase name>" --body "<phase description>\n\nParent: #<parent>\n\nBlocks: #<next_issue_number if known>"`
3. **Label Sequencing**: 
   - Phase 1 (unblocked): `gh issue edit <id> --add-label for-dev`
   - Phase 2+ (blocked): `gh issue edit <id> --add-label for-dev,blocked`
4. **Forward Linking**: The body of Phase N issue MUST contain the text `Blocks: #<Phase N+1 issue number>` so the Dev Agent can cascade the dependency chain autonomously.
5. **Reference the Parent**: Include the original Epic issue number in each child issue body as `Parent: #<number>` for traceability.

## Commands
* **Run Gatekeeper**: `npm run triage` (Cheap/Fast classification of untriaged issues)
* **Run Architect**: `npm run plan` (Heavy codebase scanning to plan triaged issues)
* **Run Dev**: `npm run dev` (Transforms planned tech specs into committed PRs)
