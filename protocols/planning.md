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
7. **Pattern Discovery**: Before finalizing the pseudo-code roadmap, you MUST use `Grep` to find existing implementations of similar logic in the codebase. Document these patterns in your internal reasoning and ensure the proposed plan is consistent with them.
8. Finally, use your `Bash` tool to attach the specification back to the remote repository so downstream agents can prioritize it: `gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md`
9. **Reviewer Checklist (mandatory)**: After posting the spec, add a follow-up comment with a table of 3–5 yes/no acceptance criteria (one per key risk or assumption) so a reviewer can approve in a single pass. Format: `| # | Criterion | Reviewer Answer |` with blank Answer column. This step is required — omitting it lowers first-pass approval rate.

