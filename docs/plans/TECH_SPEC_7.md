# TECH_SPEC_7: Branch State Validation + Branching Strategy for Autonomous Agents

**Priority: 8.0** (I=4, C=4, E=2)

**Issue**: #7 - Make sure to work on latest code  
**Type**: Enhancement  
**Confidence Score**: 87.5%

**Latest Feedback** (2026-04-24 08:32):
> "dev is committing and creating a PR for his work. the planner should also do something with his plan files. maybe the planner should open the main feature branch and commit into there, and the dev will branch out from the planner branch?"

---

## Root Cause / Requirements

The autonomous agents (Architect, Dev) currently do not:
1. Validate their repository state before performing operations
2. Have a consistent branching strategy where both agents commit their work
3. Restore the user's original workspace state after completing work

**Current State**:
- **Planner**: Writes TECH_SPEC files to `docs/plans/` but does NOT commit them
- **Dev**: Creates feature branch `atomo/issue-{N}`, commits implementation, creates PR

**Proposed New Workflow** (based on latest feedback):
- **Planner**: Create feature branch `planner/issue-{N}` from main, commit TECH_SPEC, push branch
- **Dev**: Branch from `planner/issue-{N}` (not main), create `atomo/issue-{N}`, commit implementation, create PR

**Benefits of New Workflow**:
1. ✅ TECH_SPEC files are version-controlled and reviewable as part of the PR
2. ✅ Dev agent works from the exact spec that was reviewed (atomic coupling)
3. ✅ Git history shows complete issue lifecycle: spec → implementation
4. ✅ Easier to review: spec changes in base PR, implementation changes in child PR
5. ✅ Planner's work is preserved even if dev work is delayed

---

## Acceptance Criteria

### 1. Pre-flight Validation (Both Agents)
Before any file modification or planning work, agents MUST:
- Validate current branch state and uncommitted changes
- Ensure working from latest `main` (or appropriate base branch)
- Stash uncommitted changes if needed
- Checkout to main and pull latest from origin

### 2. Planner Workflow (NEW)
After writing TECH_SPEC:
- Create feature branch: `planner/issue-{N}` from main
- Commit TECH_SPEC file: `docs/plans/TECH_SPEC_{N}.md`
- Push branch to origin
- Post spec to issue for review (with branch reference)
- Add `needs-review` label

### 3. Dev Workflow (UPDATED)
After receiving `for-dev` issue:
- Checkout base branch: `planner/issue-{N}` (if exists) OR `main` (fallback)
- Create feature branch: `atomo/issue-{N}` from the base branch
- Commit implementation
- Create PR with base pointing to `main` (NOT `planner/issue-{N}`)
- Reference both issue and planner branch in PR body

### 4. State Restoration (Both Agents)
After completing work:
- Return to the original branch user was on
- Restore stashed changes (git stash pop)
- Leave repository in exact state as before agent ran

### 5. Failure Modes
If validation fails (e.g., merge conflicts, network errors):
- Agent MUST abort with clear error message
- Do NOT proceed with planning or implementation

---

## Target Files

### Files to Modify

1. **`src/github.ts`** (NEW UTILITY FUNCTIONS)
   - Add `ensureLatestMain(baseBranch?)` - Pre-flight validation
   - Add `restorePreviousState(gitState)` - Post-work cleanup
   - Add `createFeatureBranch(branchName, baseBranch)` - Branch creation helper
   - Add `commitAndPush(message, files)` - Commit helper
   - Add `GitState` type to track original branch/stash info

2. **`src/planner.ts`** (ARCHITECT AGENT - MAJOR CHANGES)
   - Import git utilities from `./github.js`
   - Call `ensureLatestMain()` at start
   - After writing TECH_SPEC: create `planner/issue-{N}` branch, commit, push
   - Post spec comment with branch reference
   - Call `restorePreviousState()` before exit

3. **`src/dev.ts`** (DEV AGENT - UPDATED)
   - Import git utilities from `./github.js`
   - Call `ensureLatestMain()` at start
   - Detect if `planner/issue-{N}` branch exists, use as base (else use main)
   - Create `atomo/issue-{N}` branch from detected base
   - Call `restorePreviousState()` after PR creation

4. **`protocols/atomo_dev.md`** (PROTOCOL DOCUMENTATION)
   - Insert new **Phase 0: Repository State Validation** section
   - Document new branching strategy (planner → dev cascade)
   - Add **Final Step: State Restoration** requirement

---

## Architectural Decision: Branching Strategy

### Option A: Planner Creates Parent Branch (RECOMMENDED)

```
main
 └─ planner/issue-7 (Planner commits TECH_SPEC here)
     └─ atomo/issue-7 (Dev commits implementation here)
```

**Workflow**:
1. Planner: `git checkout -b planner/issue-7` → commit TECH_SPEC → push
2. Dev: `git checkout planner/issue-7` → `git checkout -b atomo/issue-7` → commit code
3. Dev creates PR: `atomo/issue-7` → `main` (squash includes spec + code)

**Pros**:
- ✅ Spec and implementation are atomically linked in git history
- ✅ PR diff shows both spec and code changes
- ✅ Easy to review: "Did dev follow the spec?"
- ✅ Planner's work is preserved if dev is delayed

**Cons**:
- ⚠️ PR diff may be large (spec + implementation)
- ⚠️ Slightly more complex merge graph

### Option B: Parallel Branches (ALTERNATIVE)

```
main
 ├─ planner/issue-7 (Planner commits TECH_SPEC)
 └─ atomo/issue-7 (Dev commits implementation, references planner branch)
```

**Workflow**:
1. Planner: `git checkout -b planner/issue-7` → commit TECH_SPEC → push → create PR to main
2. Dev: `git checkout main` → `git checkout -b atomo/issue-7` → commit code → create PR to main
3. Both PRs exist independently, dev PR references planner PR number

**Pros**:
- ✅ Smaller PR diffs (spec and code are separate)
- ✅ Spec can be merged independently of implementation
- ✅ Simpler git graph (both branch from main)

**Cons**:
- ⚠️ Dev might work from stale spec if planner branch is updated
- ⚠️ Less atomic coupling between spec and implementation

### Recommendation: Option A (Nested Branching)

Based on user feedback ("dev will branch out from the planner branch"), **Option A** is the intended approach. This creates a clear parent-child relationship: Planner sets the foundation, Dev builds on top.

---

## Implementation Pseudo-Code Roadmap

### STEP 1: Add Git Utilities to `src/github.ts`

```typescript
import { execSync } from 'child_process';

/**
 * Represents the git state before agent work begins.
 */
export interface GitState {
  originalBranch: string;
  hadUncommittedChanges: boolean;
  stashCreated: boolean;
}

/**
 * Ensure the repository is on the latest main branch (or specified base branch).
 * Records the original state for later restoration.
 */
export function ensureLatestMain(cwd?: string, baseBranch: string = 'main'): { 
  success: boolean; 
  message: string; 
  state?: GitState 
} {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    // 1. Get current branch
    const originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    // 2. Check for uncommitted changes
    const statusOutput = execSync('git status --porcelain', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    const hadUncommittedChanges = statusOutput.length > 0;
    let stashCreated = false;
    
    // 3. If not on target base branch and has uncommitted changes, stash them
    if (originalBranch !== baseBranch && hadUncommittedChanges) {
      console.log(`[Git Validation] Stashing uncommitted changes on ${originalBranch}...`);
      execSync('git stash push -m "Atomo agent: auto-stash before validation"', {
        cwd: targetCwd,
        stdio: 'inherit'
      });
      stashCreated = true;
    }
    
    // 4. If not on base branch, checkout to it
    if (originalBranch !== baseBranch) {
      console.log(`[Git Validation] Checking out ${baseBranch} branch...`);
      execSync(`git checkout ${baseBranch}`, {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    }
    
    // 5. Fetch latest from origin
    console.log(`[Git Validation] Fetching latest from origin/${baseBranch}...`);
    execSync(`git fetch origin ${baseBranch}`, {
      cwd: targetCwd,
      stdio: 'inherit'
    });
    
    // 6. Check if local is behind remote
    const localCommit = execSync(`git rev-parse ${baseBranch}`, {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    const remoteCommit = execSync(`git rev-parse origin/${baseBranch}`, {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    if (localCommit !== remoteCommit) {
      console.log(`[Git Validation] Pulling latest changes from origin/${baseBranch}...`);
      execSync(`git pull origin ${baseBranch}`, {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    } else {
      console.log(`[Git Validation] Already up-to-date with origin/${baseBranch}.`);
    }
    
    return {
      success: true,
      message: `Repository is now on the latest ${baseBranch} branch.`,
      state: {
        originalBranch,
        hadUncommittedChanges,
        stashCreated
      }
    };
    
  } catch (error: any) {
    return {
      success: false,
      message: `Git validation failed: ${error.message}`
    };
  }
}

/**
 * Create a new feature branch from the current branch.
 */
export function createFeatureBranch(branchName: string, cwd?: string): { 
  success: boolean; 
  message: string 
} {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    console.log(`[Git] Creating feature branch: ${branchName}...`);
    execSync(`git checkout -b ${branchName}`, {
      cwd: targetCwd,
      stdio: 'inherit'
    });
    
    return {
      success: true,
      message: `Branch ${branchName} created successfully.`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to create branch ${branchName}: ${error.message}`
    };
  }
}

/**
 * Commit and push files to the current branch.
 */
export function commitAndPush(
  message: string, 
  files: string[], 
  cwd?: string
): { success: boolean; message: string } {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    // Add files
    files.forEach(file => {
      console.log(`[Git] Adding file: ${file}...`);
      execSync(`git add ${file}`, {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    });
    
    // Commit
    console.log(`[Git] Committing: ${message}...`);
    execSync(`git commit -m "${message}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"`, {
      cwd: targetCwd,
      stdio: 'inherit'
    });
    
    // Push to origin
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    console.log(`[Git] Pushing to origin/${currentBranch}...`);
    execSync(`git push -u origin ${currentBranch}`, {
      cwd: targetCwd,
      stdio: 'inherit'
    });
    
    return {
      success: true,
      message: `Committed and pushed to origin/${currentBranch}.`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to commit/push: ${error.message}`
    };
  }
}

/**
 * Check if a remote branch exists.
 */
export function remoteBranchExists(branchName: string, cwd?: string): boolean {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    execSync(`git fetch origin ${branchName}`, {
      cwd: targetCwd,
      stdio: 'pipe' // silence output
    });
    
    const result = execSync(`git ls-remote --heads origin ${branchName}`, {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Restore the repository to its original state.
 */
export function restorePreviousState(state: GitState, cwd?: string): { 
  success: boolean; 
  message: string 
} {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    // 1. Checkout back to original branch
    if (state.originalBranch) {
      console.log(`[Git Cleanup] Returning to original branch: ${state.originalBranch}...`);
      execSync(`git checkout ${state.originalBranch}`, {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    }
    
    // 2. Restore stashed changes
    if (state.stashCreated) {
      console.log(`[Git Cleanup] Restoring stashed changes...`);
      try {
        execSync('git stash pop', {
          cwd: targetCwd,
          stdio: 'inherit'
        });
      } catch (error: any) {
        if (error.message.includes('CONFLICT')) {
          return {
            success: false,
            message: 'Stash restoration failed due to conflicts. Your stashed changes are preserved. Run `git stash list` to see them, then manually resolve conflicts with `git stash pop`.'
          };
        }
        throw error;
      }
    }
    
    console.log(`[Git Cleanup] ✅ Repository restored to original state.`);
    return {
      success: true,
      message: 'Repository restored successfully.'
    };
    
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to restore git state: ${error.message}\nManual intervention may be required.`
    };
  }
}
```

---

### STEP 2: Update `src/planner.ts` (Architect Agent)

**Add imports** (top of file):
```typescript
import { 
  gh, 
  hasHumanReplyAfterBot, 
  ensureLatestMain, 
  createFeatureBranch, 
  commitAndPush, 
  restorePreviousState, 
  type GitState,
  type GitHubIssue 
} from './github.js';
```

**Pre-flight validation** (at start, before any file operations):
```typescript
// Store git state for restoration
let gitState: GitState | undefined;

// === PRE-FLIGHT: Ensure on latest main ===
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const validation = ensureLatestMain(targetCwd);

if (!validation.success) {
  console.error('[PLANNER] Git validation failed:', validation.message);
  console.error('[PLANNER] ABORTING. Please resolve git state manually and re-run.');
  process.exit(1);
}

gitState = validation.state!;
console.log('[PLANNER] ✅ Git validation passed. Proceeding with planning...');
```

**After writing TECH_SPEC** (in the planning flow, after writing `docs/plans/TECH_SPEC_{N}.md`):
```typescript
// AFTER: Write tool has created TECH_SPEC_{number}.md

// Create planner feature branch
const plannerBranch = `planner/issue-${issueNumber}`;
const branchResult = createFeatureBranch(plannerBranch, targetCwd);

if (!branchResult.success) {
  console.error(`[PLANNER] Failed to create branch: ${branchResult.message}`);
  // Restore state and exit
  if (gitState) restorePreviousState(gitState, targetCwd);
  process.exit(1);
}

// Commit TECH_SPEC to planner branch
const commitResult = commitAndPush(
  `spec: Add tech spec for issue #${issueNumber}`,
  [`docs/plans/TECH_SPEC_${issueNumber}.md`],
  targetCwd
);

if (!commitResult.success) {
  console.error(`[PLANNER] Failed to commit: ${commitResult.message}`);
  // Restore state and exit
  if (gitState) restorePreviousState(gitState, targetCwd);
  process.exit(1);
}

console.log(`[PLANNER] ✅ Tech spec committed to branch: ${plannerBranch}`);

// Update the posted comment to include branch reference
// Modify the GitHub comment posting to include:
// "**Planner Branch**: `planner/issue-{N}`"
```

**State restoration** (before process exit, at the end):
```typescript
// === CLEANUP: Restore original state ===
if (gitState) {
  const restoration = restorePreviousState(gitState, targetCwd);
  if (!restoration.success) {
    console.warn('[PLANNER] Warning: Failed to restore git state:', restoration.message);
    console.warn('[PLANNER] You may need to manually checkout your original branch and restore stashed changes.');
  }
}
```

---

### STEP 3: Update `src/dev.ts` (Dev Agent)

**Add imports** (top of file):
```typescript
import { 
  gh, 
  hasHumanReplyAfterBot, 
  hasNewReviewComments, 
  extractIssueNumber,
  ensureLatestMain, 
  createFeatureBranch,
  commitAndPush,
  remoteBranchExists,
  restorePreviousState,
  type GitState,
  type GitHubPR 
} from './github.js';
```

**Pre-flight validation** (at start):
```typescript
// Store git state for restoration
let gitState: GitState | undefined;

// === PRE-FLIGHT: Ensure on latest main ===
console.log('[DEV] Validating repository state...');
const validation = ensureLatestMain(targetCwd);

if (!validation.success) {
  console.error('[DEV] Git validation failed:', validation.message);
  console.error('[DEV] ABORTING. Please resolve git state manually and re-run.');
  process.exit(1);
}

gitState = validation.state!;
console.log('[DEV] ✅ Git validation passed. Proceeding with dev workflow...');
```

**Before creating feature branch** (in the main dev flow):
```typescript
// Determine base branch: planner/issue-{N} if exists, else main
const plannerBranch = `planner/issue-${issueNumber}`;
const hasplannerBranch = remoteBranchExists(plannerBranch, targetCwd);

let baseBranch = 'main';
if (hasPlannerBranch) {
  console.log(`[DEV] Found planner branch: ${plannerBranch}. Using as base.`);
  baseBranch = plannerBranch;
  // Checkout planner branch
  execSync(`git checkout ${plannerBranch}`, {
    cwd: targetCwd,
    stdio: 'inherit'
  });
  // Pull latest from planner branch
  execSync(`git pull origin ${plannerBranch}`, {
    cwd: targetCwd,
    stdio: 'inherit'
  });
} else {
  console.log(`[DEV] No planner branch found. Using main as base.`);
}

// Create atomo feature branch from base
const atomoBranch = `atomo/issue-${issueNumber}`;
const branchResult = createFeatureBranch(atomoBranch, targetCwd);

if (!branchResult.success) {
  console.error(`[DEV] Failed to create branch: ${branchResult.message}`);
  // Restore state and exit
  if (gitState) restorePreviousState(gitState, targetCwd);
  process.exit(1);
}

console.log(`[DEV] ✅ Created branch ${atomoBranch} from ${baseBranch}`);
```

**Update PR body** (to reference planner branch if it exists):
```typescript
const prBody = `
Closes #${issueNumber}

${hasPlannerBranch ? `**Base Branch**: \`${plannerBranch}\` (includes tech spec)\n` : ''}

## Implementation

[PR description here...]
`;
```

**State restoration** (after PR creation, before exit):
```typescript
// === CLEANUP: Restore original state ===
if (gitState) {
  const restoration = restorePreviousState(gitState, targetCwd);
  if (!restoration.success) {
    console.warn('[DEV] Warning: Failed to restore git state:', restoration.message);
    console.warn('[DEV] You may need to manually checkout your original branch and restore stashed changes.');
  }
}
```

---

### STEP 4: Update `protocols/atomo_dev.md`

**Location**: Add new Phase 0 section at the very top

```markdown
## Atomo: The Methodical Dev Protocol

Atomo follows a rigid **"Observe → Align → Execute → Cleanup"** loop for every issue. This ensures precision, reliability, and adherence to the repository's DNA.

### Phase 0: Repository State Validation & Branching Strategy (The Foundation)

**MANDATORY PRE-FLIGHT CHECK**: Both Architect and Dev agents MUST validate repository state and follow the branching strategy.

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
4. **Failure Mode**: If validation fails (merge conflicts, network errors):
   - Agent MUST abort immediately with error message
   - Do NOT proceed with planning or implementation

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
...
```

---

## Workflow Diagram

### New Workflow (Option A - Nested Branching)

```
[User on feature-foo with uncommitted changes]
                ↓
[PLANNER RUN]
  1. ensureLatestMain() → Stash changes, checkout main, pull latest
  2. Write TECH_SPEC_7.md
  3. createFeatureBranch('planner/issue-7')
  4. commitAndPush('spec: Add tech spec for issue #7', ['docs/plans/TECH_SPEC_7.md'])
  5. Post spec to issue #7 for review (include branch: planner/issue-7)
  6. Add label: needs-review
  7. restorePreviousState() → Checkout feature-foo, restore stash
                ↓
[User reviews spec, replies "APPROVED"]
                ↓
[DEV RUN]
  1. ensureLatestMain() → Stash changes, checkout main, pull latest
  2. remoteBranchExists('planner/issue-7') → true
  3. Checkout planner/issue-7, pull latest
  4. createFeatureBranch('atomo/issue-7') from planner/issue-7
  5. Implement changes per TECH_SPEC
  6. commitAndPush('feat: Implement issue #7', [...files])
  7. Create PR: atomo/issue-7 → main (base: main, NOT planner/issue-7)
  8. restorePreviousState() → Checkout feature-foo, restore stash
                ↓
[User on feature-foo with uncommitted changes restored]
[Branches exist: planner/issue-7, atomo/issue-7]
[PR open: atomo/issue-7 → main (includes both spec + implementation)]
```

**Key Points**:
- User workspace is never disrupted (stash → restore)
- Planner commits spec to version control (reviewable, traceable)
- Dev branches from planner branch (atomic coupling)
- PR merges to main in single squash (clean history)

---

## Edge Cases & Error Handling

### 1. Merge Conflicts During Pull
**Scenario**: `git pull origin main` fails due to local divergence.

**Handling**: Abort with error message, require manual resolution.

### 2. Planner Branch Already Exists
**Scenario**: Re-running planner on same issue creates conflict.

**Handling**: Check if `planner/issue-{N}` exists. If yes:
- Option A: Skip branch creation, checkout existing, force-push updated spec
- Option B: Create new branch with timestamp suffix (e.g., `planner/issue-7-v2`)
- **Recommended**: Option A for simplicity

### 3. Dev Runs Before Planner Branch Exists
**Scenario**: Old issue labeled `for-dev` but no `planner/issue-{N}` branch.

**Handling**: Fallback to `main` as base branch. Log warning.

### 4. Stash Pop Conflicts
**Scenario**: Agent's work conflicts with user's stashed changes.

**Handling**: Leave stash in place, warn user to manually resolve with `git stash pop`.

### 5. Network Failure During Push
**Scenario**: `git push` fails due to network timeout.

**Handling**: Commit exists locally. Warn user to manually push. Do NOT abort restoration.

### 6. User's Original Branch Was Deleted
**Scenario**: User was on `temp-branch`, which was deleted while agent ran.

**Handling**: Restoration will fail. Warn user, checkout to `main` instead.

---

## Test Plan

### Manual Verification Steps

1. **Test 1: Planner creates branch and commits**
   - Run `npm run plan` on triaged issue
   - ✅ Should create `planner/issue-{N}` branch
   - ✅ Should commit TECH_SPEC to that branch
   - ✅ Should push to origin
   - ✅ Should restore user's original branch

2. **Test 2: Dev branches from planner branch**
   - Run `npm run dev` on for-dev issue with planner branch
   - ✅ Should detect `planner/issue-{N}` exists
   - ✅ Should checkout and pull planner branch
   - ✅ Should create `atomo/issue-{N}` from planner branch
   - ✅ Should commit implementation
   - ✅ Should create PR to `main` (not planner branch)

3. **Test 3: Dev fallback to main (no planner branch)**
   - Run `npm run dev` on old issue without planner branch
   - ✅ Should detect planner branch does NOT exist
   - ✅ Should use `main` as base
   - ✅ Should create `atomo/issue-{N}` from main
   - ✅ Should log warning about missing planner branch

4. **Test 4: User workspace restoration**
   - User on `feature-foo` with uncommitted changes
   - Run `npm run plan` or `npm run dev`
   - ✅ Changes should be stashed
   - ✅ Agent creates branches, commits work
   - ✅ User is returned to `feature-foo`
   - ✅ Uncommitted changes are restored

5. **Test 5: Planner re-run on same issue**
   - Run `npm run plan` on issue that already has `planner/issue-{N}` branch
   - ✅ Should handle gracefully (force-push or versioned branch)
   - ✅ Should not crash or leave orphaned branches

6. **Test 6: Git history validation**
   - After full workflow (planner + dev + merge)
   - ✅ Squashed commit on main should include both spec and implementation
   - ✅ `git log` should show spec commit before implementation commit
   - ✅ Clean linear history (no merge commits)

---

## Rollback Plan

If this workflow causes issues:

1. **Quick Disable**: Add env var `SKIP_GIT_BRANCHING=true` to skip branch creation:
   ```typescript
   if (process.env.SKIP_GIT_BRANCHING === 'true') {
     // Skip createFeatureBranch, commitAndPush
     // Fall back to current behavior (no commits from planner)
   }
   ```

2. **Partial Rollback**: Keep state validation, remove branch creation:
   - Keep `ensureLatestMain()` and `restorePreviousState()`
   - Remove `createFeatureBranch()` and `commitAndPush()` calls

3. **Full Rollback**: Remove all git utilities from planner.ts and dev.ts

---

## Performance Impact

- **Additional Latency**: ~2-4 seconds per agent run
  - Git operations: ~1-2s (fetch, checkout, pull)
  - Branch creation: ~0.5s
  - Commit/push: ~1-2s (depends on network)
  - Restoration: ~0.5s

- **Network Dependency**: Requires access to origin remote (git push/pull)

- **Storage**: Each issue creates 2 branches (planner + atomo), ~100KB per issue

---

## Security Considerations

1. **Command Injection**: All git commands use static strings or sanitized variables
2. **Destructive Operations**: All operations are non-destructive (stash, branch, commit)
3. **Permission Requirements**: User must have push access to origin
4. **Stash Security**: Stashed changes are local, not shared

---

## Dependencies

- **Git CLI**: Must be installed and available in PATH
- **GitHub Remote**: Origin remote must be configured and accessible
- **Push Permissions**: User must have write access to create/push branches

No new npm dependencies required.

---

## Success Metrics

- ✅ Zero disruption to user workflow (workspace restored 100% of time)
- ✅ TECH_SPEC files version-controlled and reviewable
- ✅ Clear git history showing spec → implementation lifecycle
- ✅ Dev agent always works from reviewed spec (atomic coupling)
- ✅ No orphaned branches or dirty git state

---

**Implementation Status**: Ready for development (updated based on feedback)  
**Estimated Effort**: 6-8 hours (3h utilities, 2h planner integration, 2h dev integration, 1h testing)  
**Blocking Issues**: None  
**Changelog**: 
- 2026-04-24 08:32 - Added nested branching strategy (planner → dev cascade)
- 2026-04-24 07:34 - Added mandatory state restoration requirement
- 2026-04-20 14:33 - Initial spec with git validation only
