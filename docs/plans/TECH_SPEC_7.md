# TECH_SPEC_7: Branch State Validation for Autonomous Agents

**Priority: 8.0** (I=4, C=4, E=2)

**Issue**: #7 - Make sure to work on latest code  
**Type**: Enhancement  
**Confidence Score**: 87.5%

---

## Root Cause / Requirements

The autonomous agents (Architect, Dev) currently do not validate their repository state before performing operations. This can lead to:

1. **Stale codebase**: Agents may plan or implement features based on outdated code if the local main branch is behind the remote.
2. **Dirty working tree**: If an agent is invoked while on a feature branch with uncommitted changes, it may create confusion or conflicts.
3. **Race conditions**: Multiple agents or manual work could be happening on non-main branches simultaneously without coordination.

**User Requirement** (from clarification):
> "When the agents are running, as parts of their instructions, they need to validate [that they're on the latest main branch]. If not, make sure to keep the uncommitted changes, checkout to main, and after done, restore back to the same state before your work."

---

## Acceptance Criteria

1. ✅ **Pre-flight validation**: Before any file modification or planning work, agents MUST validate:
   - Current branch is `main` (or default branch)
   - Local `main` is up-to-date with `origin/main`
   
2. ✅ **Uncommitted changes handling**: If uncommitted changes exist on a non-main branch:
   - Stash changes with a descriptive message
   - Checkout to main
   - Pull latest from origin
   - Restore stashed changes after work is complete
   
3. ✅ **Failure modes**: If validation fails (e.g., cannot pull, merge conflicts):
   - Agent MUST abort with a clear error message
   - Do NOT proceed with planning or implementation
   
4. ✅ **Protocol updates**: The `atomo_dev.md` protocol MUST be updated to reflect this validation as a mandatory Phase 0 step.

---

## Target Files

### Files to Modify

1. **`src/github.ts`** (NEW UTILITY FUNCTION)
   - Add `ensureLatestMain()` utility function
   - Handles: git status, git fetch, git stash, git checkout, git pull
   - Returns: success boolean + error message if failed

2. **`src/planner.ts`** (ARCHITECT AGENT)
   - Import `ensureLatestMain` from `./github.js`
   - Call validation BEFORE reading TECH_SPEC or writing new specs
   - Add to line ~16 (before any file operations)

3. **`src/dev.ts`** (DEV AGENT)
   - Import `ensureLatestMain` from `./github.js`
   - Call validation in the main execution block BEFORE `handlePRReviews()`
   - Add to line ~115 (before agent prompt construction)

4. **`protocols/atomo_dev.md`** (PROTOCOL DOCUMENTATION)
   - Insert new **Phase 0: Repository State Validation** section
   - Place BEFORE existing Phase 1
   - Document the validation steps and failure modes

---

## Existing Patterns Discovered

### Git Command Execution Pattern
**File**: `src/github.ts:36-48`
```typescript
export function gh(command: string, cwd?: string): any {
  try {
    const result = execSync(`gh ${command}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'inherit']
    });
    return command.includes('--json') ? JSON.parse(result) : result;
  } catch (error) {
    console.error(`[GH CLI Error]: ${command}`, error);
    throw error;
  }
}
```

**Pattern**: Use `execSync` with error handling, return parsed JSON or raw string. Apply same pattern for git commands.

### Target CWD Pattern
**File**: `src/dev.ts:18-19`
```typescript
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const ghTarget = (command: string) => gh(command, targetCwd);
```

**Pattern**: Agents use `TARGET_REPO_PATH` env var to specify which repo to operate on. The `ensureLatestMain()` function MUST respect this.

### Pre-LLM Validation Pattern
**File**: `src/dev.ts:43-108`
```typescript
function handlePRReviews(): PRReviewResult {
  console.log('[PR REVIEW] Checking open PRs for review feedback...');
  // ... deterministic pre-processing before LLM runs
}
```

**Pattern**: Dev agent already has a deterministic pre-processing step. Branch validation should follow this pattern as a separate function.

---

## Implementation Pseudo-Code Roadmap

### STEP 1: Add Git Utility to `src/github.ts`

```typescript
/**
 * Ensure the repository is on the latest main branch before agent work.
 * 
 * @returns { success: boolean, message: string }
 */
export function ensureLatestMain(cwd?: string): { success: boolean; message: string } {
  const targetCwd = cwd || process.env.TARGET_REPO_PATH || process.cwd();
  
  try {
    // 1. Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    // 2. Check for uncommitted changes
    const statusOutput = execSync('git status --porcelain', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    const hasUncommittedChanges = statusOutput.length > 0;
    
    // 3. If not on main and has uncommitted changes, stash them
    if (currentBranch !== 'main' && hasUncommittedChanges) {
      console.log(`[Git Validation] Stashing uncommitted changes on ${currentBranch}...`);
      execSync('git stash push -m "Atomo agent: auto-stash before validation"', {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    }
    
    // 4. If not on main, checkout to main
    if (currentBranch !== 'main') {
      console.log(`[Git Validation] Checking out main branch...`);
      execSync('git checkout main', {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    }
    
    // 5. Fetch latest from origin
    console.log(`[Git Validation] Fetching latest from origin...`);
    execSync('git fetch origin main', {
      cwd: targetCwd,
      stdio: 'inherit'
    });
    
    // 6. Check if local main is behind origin/main
    const localCommit = execSync('git rev-parse main', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    const remoteCommit = execSync('git rev-parse origin/main', {
      encoding: 'utf-8',
      cwd: targetCwd
    }).trim();
    
    if (localCommit !== remoteCommit) {
      console.log(`[Git Validation] Pulling latest changes from origin/main...`);
      execSync('git pull origin main', {
        cwd: targetCwd,
        stdio: 'inherit'
      });
    } else {
      console.log(`[Git Validation] Already up-to-date with origin/main.`);
    }
    
    return {
      success: true,
      message: 'Repository is now on the latest main branch.'
    };
    
  } catch (error: any) {
    return {
      success: false,
      message: `Git validation failed: ${error.message}`
    };
  }
}
```

**Key Design Decisions**:
- Use `git rev-parse` to get current branch (more reliable than `git branch`)
- Use `git status --porcelain` for machine-readable status
- Stash with descriptive message for manual recovery if needed
- Compare commit SHAs instead of relying on git status (more precise)
- Return success/failure object instead of throwing (allows graceful agent exit)

---

### STEP 2: Integrate into `src/planner.ts`

**Location**: After imports, before any file operations (around line 16)

```typescript
// Add import
import { gh, hasHumanReplyAfterBot, ensureLatestMain } from './github.js';

// ... existing code ...

// BEFORE the CLAUDE_MD read or any planning work:
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const validation = ensureLatestMain(targetCwd);

if (!validation.success) {
  console.error('[PLANNER] Git validation failed:', validation.message);
  console.error('[PLANNER] ABORTING. Please resolve git state manually and re-run.');
  process.exit(1);
}

console.log('[PLANNER] ✅ Git validation passed. Proceeding with planning...');
```

**Rationale**: Architect reads/writes TECH_SPEC files, so must ensure it's working with latest codebase before generating plans.

---

### STEP 3: Integrate into `src/dev.ts`

**Location**: In the main execution block, BEFORE `handlePRReviews()` (around line 115)

```typescript
// Add import
import { gh, hasHumanReplyAfterBot, hasNewReviewComments, extractIssueNumber, ensureLatestMain, type GitHubPR } from './github.js';

// ... existing code ...

// BEFORE handlePRReviews():
console.log('[DEV] Validating repository state...');
const validation = ensureLatestMain(targetCwd);

if (!validation.success) {
  console.error('[DEV] Git validation failed:', validation.message);
  console.error('[DEV] ABORTING. Please resolve git state manually and re-run.');
  process.exit(1);
}

console.log('[DEV] ✅ Git validation passed. Proceeding with dev workflow...');

const reviewResult = handlePRReviews();
```

**Rationale**: Dev creates feature branches and commits code, so MUST validate it's branching from the latest main.

---

### STEP 4: Update `protocols/atomo_dev.md`

**Location**: Add new Phase 0 section at the very top, BEFORE existing Phase 1

```markdown
## Atomo: The Methodical Dev Protocol

Atomo follows a rigid **"Observe → Align → Execute"** loop for every issue. This ensures precision, reliability, and adherence to the repository's DNA.

### Phase 0: Repository State Validation (The Foundation)
**MANDATORY PRE-FLIGHT CHECK**: Before any planning or implementation work begins, the agent MUST validate the repository is on the latest main branch.

1. **Current Branch Check**: Verify the working directory is on `main` branch.
2. **Uncommitted Changes Handling**: If uncommitted changes exist on a non-main branch:
   - Stash changes with message: `"Atomo agent: auto-stash before validation"`
   - Checkout to `main`
3. **Sync with Remote**: Fetch and pull latest from `origin/main` to ensure no stale code.
4. **Failure Mode**: If validation fails (e.g., merge conflicts, network errors):
   - Agent MUST abort immediately with error message
   - Do NOT proceed with planning or implementation
   - Require manual intervention to resolve git state

**Implementation**: The `ensureLatestMain()` utility in `src/github.ts` handles this validation. It is called at the start of both Architect and Dev agents.

---

### Phase 1: Contextual Onboarding (The Grounding)
...
```

**Rationale**: This is a foundational requirement that must happen BEFORE any other agent work. Making it Phase 0 emphasizes its critical nature.

---

## Edge Cases & Error Handling

### Edge Case 1: Merge Conflicts During Pull
**Scenario**: `git pull origin main` fails due to local divergence.

**Handling**:
```typescript
// In ensureLatestMain() catch block:
catch (error: any) {
  if (error.message.includes('CONFLICT')) {
    return {
      success: false,
      message: 'Pull failed due to merge conflicts. Please resolve manually and re-run.'
    };
  }
  // ... other error handling
}
```

### Edge Case 2: No Remote Origin Configured
**Scenario**: Local repository has no `origin` remote.

**Handling**:
```typescript
// Add check before fetch:
const remotes = execSync('git remote', { encoding: 'utf-8', cwd: targetCwd }).trim();
if (!remotes.includes('origin')) {
  return {
    success: false,
    message: 'No origin remote configured. Cannot validate against remote main.'
  };
}
```

### Edge Case 3: Non-Standard Default Branch
**Scenario**: Repository uses `master` or custom default branch instead of `main`.

**Handling**:
```typescript
// Detect default branch dynamically:
const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
  encoding: 'utf-8',
  cwd: targetCwd
}).trim().replace('refs/remotes/origin/', '');

// Use defaultBranch instead of hardcoded 'main'
```

### Edge Case 4: Detached HEAD State
**Scenario**: Repository is in detached HEAD state (not on any branch).

**Handling**:
```typescript
// In currentBranch check:
if (currentBranch === 'HEAD') {
  return {
    success: false,
    message: 'Repository is in detached HEAD state. Please checkout a branch and re-run.'
  };
}
```

---

## Test Plan

### Manual Verification Steps

1. **Test 1: Clean main branch**
   - Ensure local repo is on main, up-to-date
   - Run `npm run plan` or `npm run dev`
   - ✅ Should proceed without any git operations

2. **Test 2: Behind origin/main**
   - Checkout main, reset to older commit: `git reset --hard HEAD~5`
   - Run agent
   - ✅ Should fetch and pull latest changes before proceeding

3. **Test 3: On feature branch with uncommitted changes**
   - Create feature branch: `git checkout -b test-feature`
   - Make uncommitted changes to a file
   - Run agent
   - ✅ Should stash changes, checkout main, pull latest
   - Manually restore stash after: `git checkout test-feature && git stash pop`

4. **Test 4: Merge conflict simulation**
   - Create local divergence that would conflict with remote
   - Run agent
   - ✅ Should abort with error message about merge conflicts

5. **Test 5: No origin remote**
   - Clone a repo without origin, or remove origin: `git remote remove origin`
   - Run agent
   - ✅ Should abort with error message about missing origin remote

### Automated Test (Future Enhancement)

Consider adding a test suite in `src/__tests__/git-validation.test.ts`:
- Mock `execSync` calls
- Test all edge cases programmatically
- Ensure proper error messages

---

## Rollback Plan

If this validation causes issues:

1. **Quick Disable**: Add env var `SKIP_GIT_VALIDATION=true` check at the start of `ensureLatestMain()`:
   ```typescript
   if (process.env.SKIP_GIT_VALIDATION === 'true') {
     console.log('[Git Validation] SKIPPED (SKIP_GIT_VALIDATION=true)');
     return { success: true, message: 'Validation skipped.' };
   }
   ```

2. **Full Rollback**: Remove the `ensureLatestMain()` calls from planner.ts and dev.ts. The utility function can remain in github.ts as it does not execute unless called.

---

## Security Considerations

1. **Command Injection**: All git commands use static strings, no user input interpolation. Safe from injection.
2. **Destructive Operations**: `git stash` and `git checkout` are non-destructive (changes are preserved). `git pull` could cause conflicts but is handled gracefully.
3. **Permissions**: Assumes the process has read/write access to the git repository. No elevated permissions required.

---

## Performance Impact

- **Additional Latency**: ~1-3 seconds per agent run (git fetch + potential pull)
- **Network Dependency**: Requires network access to fetch from origin
- **Mitigation**: Validation only runs once per agent invocation, not per issue

---

## Future Enhancements

1. **Stash Recovery**: Add a post-work step in dev.ts to automatically restore stashed changes after PR is created.
2. **Branch Detection**: Auto-detect default branch name instead of assuming `main`.
3. **Dry Run Mode**: Add `--dry-run` flag to preview git operations without executing them.
4. **Offline Mode**: Add `--offline` flag to skip remote sync (use local main as-is).

---

## Dependencies

- **Node.js**: `child_process.execSync` (already in use)
- **Git CLI**: Must be installed and available in PATH (already required)
- **Network**: Requires access to `origin` remote (already required for gh CLI)

No new dependencies required.

---

## Deployment Notes

1. **Backwards Compatibility**: Existing workflows are unaffected. Validation happens before any agent work.
2. **Environment Variables**: Respects existing `TARGET_REPO_PATH` env var.
3. **Logging**: All validation steps are logged to console for debugging.
4. **Exit Codes**: Uses `process.exit(1)` on validation failure for CI/CD integration.

---

**Implementation Status**: Ready for development  
**Estimated Effort**: 2-3 hours (1 hour for utility function, 1 hour for integration, 1 hour for testing)  
**Blocking Issues**: None
