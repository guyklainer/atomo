## Atomo: The Methodical Dev Protocol

Atomo follows a rigid **"Observe → Align → Execute → Cleanup"** loop for every issue. This ensures precision, reliability, and adherence to the repository's DNA.

### Phase 0: Repository State Validation & Branching Strategy (The Foundation)

**MANDATORY PRE-FLIGHT CHECK**: Both Architect and Dev agents MUST validate repository state and follow the branching strategy before any work begins.

#### Branching Strategy

**Architect (Planner)**:
1. Ensure on latest `main` (stash user's changes if needed)
2. Create feature branch: `planner/issue-{N}` from main
3. Write TECH_SPEC to `docs/plans/TECH_SPEC_{N}.md`
4. Commit spec to `planner/issue-{N}` branch
5. Push branch to origin
6. Post spec to issue for review (include branch reference)
7. Add `needs-review` label
8. Restore user's original branch/stash

**Dev Agent**:
1. Ensure on latest `main` (stash user's changes if needed)
2. Check if `planner/issue-{N}` branch exists:
   - **If exists**: Checkout and pull `planner/issue-{N}`, use as base
   - **If not exists**: Use `main` as base (fallback for old issues)
3. Create feature branch: `atomo/issue-{N}` from base branch
4. Implement changes per TECH_SPEC
5. Commit to `atomo/issue-{N}` branch
6. Push branch to origin
7. Create PR: `atomo/issue-{N}` → `main` (NOT to planner branch)
8. Restore user's original branch/stash

#### Pre-Flight Validation Steps

1. **Current Branch Check**: Record current branch name and uncommitted changes status
2. **Uncommitted Changes Handling**: If uncommitted changes exist:
   - Stash changes with message: `"Atomo agent: auto-stash before validation"`
   - Checkout to `main` (or base branch)
3. **Sync with Remote**: Fetch and pull latest from `origin/main`
4. **Failure Mode**: Distinguish error category before aborting:
   - **Structural errors** (merge conflicts, diverged history, missing branch): Abort immediately with a clear error message. Do NOT proceed.
   - **Transient errors** (network timeout, SSH handshake failure, `git fetch` non-zero exit): Retry the failing command exactly once with a 5-second pause. If the retry fails, abort with error message.
   - In all abort cases, restore the user's original branch/stash state before exiting.

#### State Restoration (Post-Work Cleanup)

1. **Return to Original Branch**: Checkout back to the branch user was on
2. **Restore Stashed Changes**: If changes were stashed, run `git stash pop`
3. **Verify Clean State**: Repository should be in exact same state as before agent started

#### Implementation Details

- `ensureLatestMain(baseBranch?)` utility validates and checks out base branch
- `createFeatureBranch(branchName)` creates agent feature branch
- `commitAndPush(message, files)` commits and pushes to origin
- `restorePreviousState(gitState)` restores user's original state
- All utilities in `src/github.ts`

---

### Phase 1: Contextual Onboarding (The Grounding)
1. **Mandatory Ingestion**: Read the injected `CLAUDE.md` to internalize immutable laws.
2. **Spec Alignment**: Read the associated `docs/plans/TECH_SPEC_{number}.md` to verify architectural boundaries.
3. **Branch Strategy**: Immediately create a fresh feature branch using `Bash`:
   - For Planner: `git checkout -b planner/issue-{number}`
   - For Dev: Check if `planner/issue-{number}` exists, then `git checkout -b atomo/issue-{number}`
   Never perform modifications on the base branch.

### Phase 2: Pattern Discovery & Skill Reuse
1. **Grep Investigation**: Before implementing, use `Grep` to find existing implementations of similar logic in the codebase. You must identify at least 2-3 similar patterns to ensure consistency.
2. **Skill Discovery**: Scan `.claude/`, `.agents/`, and `MEMORY.md` for custom commands or historical patterns you should reuse.
3. **Student Mindset**: Act as a student of the existing codebase. If the repository uses a specific error handling pattern or naming convention, you must adopt it.

### Phase 3: Surgical Execution (The Implementation)
1. **CoT Pre-Drafting**: Output your implementation plan in your internal reasoning stream. Explicitly map proposed changes before editing any files.
2. **Localized Edits**: Perform surgical modifications. Minimize the risk of accidental deletions by targeting specific blocks rather than bulk overwriting.
3. **Progressive Disclosure**: Only read the files you absolutely need.

### Phase 4: Self-Verification & Acceptance
1. **Automated Test Run**: Strictly follow the TDD Protocol (Phase 0-3).
2. **Acceptance Check**: Cross-reference test outputs and manual verification results with the **Acceptance Criteria** defined in the `TECH_SPEC.md`.
3. **Completion Report**: Generate a structured summary of changes using the mandatory report format.

### Phase 5: Cleanup & Restoration
1. **State Restoration**: Return repository to original state (branch + stashed changes)
2. **Verification**: Confirm user's workspace is exactly as it was before agent started
3. **Failure Handling**: If restoration fails, provide clear instructions for manual recovery
