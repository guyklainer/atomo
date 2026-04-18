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

## Confidence Gate Protocol

Before taking any terminal action (labeling an issue, writing a TECH_SPEC), you MUST perform a confidence evaluation using the following weighted checklist. Score each criterion 0 (No) or 1 (Yes), multiply by its weight, and sum for a percentage total out of 100.

### For the Gatekeeper — classification confidence:
| Criterion | Weight |
|---|---|
| The issue title and body unambiguously match exactly ONE classification category | 35% |
| No critical context is missing that would change the classification | 30% |
| The request is actionable in its current form (not a vague idea) | 20% |
| There are no contradictory signals (e.g., sounds like both a bug AND a feature request) | 15% |

### For the Architect — planning confidence (Bug issues):
| Criterion | Weight |
|---|---|
| I know the exact root cause (not just a symptom) | 35% |
| I have identified the specific file(s) and line range(s) that must change | 30% |
| The fix scope is clear and bounded (no ambiguous edge cases) | 20% |
| I have enough reproduction context to verify the fix | 15% |

### For the Architect — planning confidence (Enhancement issues):
| Criterion | Weight |
|---|---|
| The expected user-facing behavior is precisely described | 30% |
| I have identified which files/modules will change | 25% |
| There are no unresolved design or API choices left to guess | 25% |
| The scope is clearly bounded (not too broad, not underspecified) | 20% |

### Decision Rule
- **Score >= 85**: Proceed with the planned action.
- **Score < 85**: DO NOT proceed. Compose ONE focused clarifying question that would raise the lowest-scoring criterion above. Post it as a GitHub comment using the format below, label the issue `needs-info`, and EXIT immediately without labeling or writing a spec.

**Comment format when posting needs-info:**
```
🤖 Planning paused (Confidence: {score}%): Before I can [classify/plan] this issue, I need to understand one thing:

{your single, specific question — no bullet lists, just one clear question}

I'll automatically re-evaluate once this is answered.
```

---

## needs-info Re-Evaluation Protocol

This protocol runs ONLY in the Gatekeeper. On every run, after processing new untriaged issues, the Gatekeeper MUST also scan for issues awaiting human clarification.

1. **Query for pending issues**: `gh issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt`
2. **For each issue found**, fetch its full detail: `gh issue view <number> --json number,title,body,labels,comments`
3. **Detect a human reply**: Scan the `comments` array in reverse chronological order (latest first). Find the index of the last comment whose body starts with `🤖`. A human reply exists if there is at least one comment AFTER that index whose body does NOT start with `🤖`.
   - **No human reply**: skip this issue — still waiting. Do not touch it.
   - **Human reply detected**: proceed to step 4.
4. **Determine which agent paused this issue** by inspecting its current labels:
   - **No `triaged` label present** → The Gatekeeper paused it (it exited before classifying). Follow the **Gatekeeper Re-Entry** path below.
   - **`triaged` label is present** (but no `for-dev`) → The Architect paused it (it exited after classification but before planning). Follow the **Architect Re-Entry** path below.

### Gatekeeper Re-Entry (issue was paused before classification)
   a. Remove the `needs-info` label: `gh issue edit <number> --remove-label needs-info`
   b. Re-run the full **Gatekeeper Confidence Gate** evaluation incorporating the human's reply into your context.
   c. **If score >= 85**: proceed with the normal Gatekeeper classification action (add the appropriate classification label + `triaged`).
   d. **If score still < 85**: post a NEW focused follow-up question using the needs-info comment format, re-add `needs-info` (`gh issue edit <number> --add-label needs-info`), and EXIT.

### Architect Re-Entry (issue was paused after classification, before planning)
   a. Remove the `needs-info` label: `gh issue edit <number> --remove-label needs-info`
   b. Post a brief acknowledgment comment: `🤖 Clarification received. Routing back to the Architect for planning.`
   c. **Do NOT re-run confidence scoring.** The Architect will pick this issue up on its next run, re-read all comments (including the human's reply), and run its own planning confidence gate with the full updated context.
   d. No further action required from the Gatekeeper.

---

## Commands
* **Run Gatekeeper**: `npm run triage` (Cheap/Fast classification of untriaged issues)
* **Run Architect**: `npm run plan` (Heavy codebase scanning to plan triaged issues)
* **Run Dev**: `npm run dev` (Transforms planned tech specs into committed PRs)
