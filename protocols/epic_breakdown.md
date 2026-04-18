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
