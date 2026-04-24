# Tech Spec: Complete GitHub CLI Error Handling

**Issue**: #54  
**Priority**: 8.33 (I=5, C=5, E=3)  
**Type**: Enhancement - Core Reliability  

---

## Root Cause / Context

Commit `4f38045` originally added exponential backoff retry logic for Anthropic API overload errors in `src/runner.ts`, but this was subsequently removed in a later refactor. Meanwhile, ~10+ `gh()` CLI calls across the codebase remain unguarded with no retry mechanism. A single GitHub CLI failure (network timeout, rate limit, transient API error) crashes the entire agent run mid-workflow.

**Current State Analysis**:
- `src/github.ts:36-48`: The `gh()` function has basic try-catch but immediately re-throws errors
- No exponential backoff retry logic for transient failures
- No Result<T, Error> pattern exists in the codebase
- Direct `execSync` call in `dev.ts:140-142` bypasses `gh()` wrapper entirely

**Impact**: Production reliability blocker. Agents appear unreliable to users when transient network issues cause crashes.

---

## Design Pattern: Result<T, Error> Type

To avoid throwing exceptions and crashing agent runs, introduce a discriminated union Result type:

```typescript
// src/types.ts (new file)
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function Ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function Err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

This enables call sites to handle errors gracefully without try-catch:
```typescript
const result = gh('issue list --json number');
if (!result.ok) {
  console.error('Failed to fetch issues:', result.error);
  return; // graceful degradation
}
const issues = result.value;
```

---

## Retry Strategy

Based on the removed implementation in commit `4f38045`:

**Constants**:
- `MAX_RETRIES = 3` (issue specifies "max 3 attempts")
- `BASE_DELAY_MS = 1000`
- Exponential backoff: `delay = BASE_DELAY_MS * 2^attempt`

**Retry Taxonomy** (which errors to retry):
1. **RETRY**: Network errors, timeouts, 5xx server errors, rate limit (429), overloaded errors
2. **FAIL IMMEDIATELY**: Authentication (401), forbidden (403), not found (404), invalid syntax (422)

**Error Detection Pattern** (from 4f38045):
```typescript
function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('5') // 5xx server errors
  );
}
```

---

## Implementation Roadmap

### Phase 1: Result Type Infrastructure
**File**: `src/types.ts` (new)
- [ ] Create Result<T, E> discriminated union type
- [ ] Export `Ok<T>` and `Err<E>` helper functions
- [ ] Add JSDoc examples for usage patterns

### Phase 2: Refactor `gh()` Function
**File**: `src/github.ts`

**Before** (lines 36-48):
```typescript
export function gh(command: string, cwd?: string): any {
  try {
    const result = execSync(`gh ${command}`, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'inherit'] });
    return command.includes('--json') ? JSON.parse(result) : result;
  } catch (error) {
    console.error(`[GH CLI Error]: ${command}`, error);
    throw error; // ❌ crashes agent
  }
}
```

**After**:
```typescript
import { Result, Ok, Err } from './types.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('overloaded') ||
    /5\d{2}/.test(msg) // 5xx server errors
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function gh<T = any>(command: string, cwd?: string): Promise<Result<T>> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = execSync(`gh ${command}`, {
        encoding: 'utf-8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'] // capture stderr for error parsing
      });
      const parsed = command.includes('--json') ? JSON.parse(result) : result;
      return Ok(parsed);
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      
      if (isRetryableError(error) && !isLastAttempt) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[GH CLI] Retryable error on "${command}". ` +
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await sleep(delay);
        continue;
      }
      
      // Non-retryable or exhausted retries
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[GH CLI] Command failed: ${command}\n${errorMsg}`);
      return Err(error instanceof Error ? error : new Error(errorMsg));
    }
  }
  
  // Unreachable, but TypeScript needs it
  return Err(new Error('Retry loop exited unexpectedly'));
}
```

**Breaking Change**: `gh()` now returns `Promise<Result<T>>` instead of `T`. This requires updating all call sites.

### Phase 3: Update Call Sites (Signature Changed to Async)
**Files**: `src/triage.ts`, `src/planner.ts`, `src/dev.ts`

**Pattern for all call sites**:
```typescript
// BEFORE (synchronous, throws)
const issues = gh('issue list --search "..." --json number');

// AFTER (async, returns Result)
const issuesResult = await gh<GitHubIssue[]>('issue list --search "..." --json number', targetCwd);
if (!issuesResult.ok) {
  console.error('[TRIAGE] Failed to fetch issues:', issuesResult.error);
  return; // or handle gracefully
}
const issues = issuesResult.value;
```

**Call Sites to Update** (discovered via `Grep`):
1. `src/triage.ts:48` - `gh('issue list ... needs-info')`
2. `src/triage.ts:62` - `gh('issue view ...')`
3. `src/triage.ts:79` - `gh('issue edit ... --remove-label')`
4. `src/triage.ts:83` - `gh('issue edit ...')`
5. `src/triage.ts:84` - `gh('issue comment ...')`
6. `src/triage.ts:166` - `gh('issue list ... -label:triaged')`
7. `src/planner.ts:58` - `ghTarget('issue list ... needs-review')`
8. `src/planner.ts:67` - `ghTarget('issue view ...')`
9. `src/planner.ts:83-85` - Three `ghTarget()` calls (edit/comment)
10. `src/dev.ts:45-46` - `ghTarget('pr list ...')`
11. `src/dev.ts:68` - `ghTarget('issue view ...')`
12. `src/dev.ts:85-97` - Six `ghTarget()` calls (edit/comment)

**Additional**: Migrate direct `execSync` call in `src/dev.ts:140-142` to use `gh()`:
```typescript
// BEFORE
const raw = execSync('gh issue list --search "..." --json number,title,body', { encoding: 'utf-8' });

// AFTER
const issuesResult = await gh<GitHubIssue[]>('issue list --search "..." --json number,title,body', targetCwd);
if (!issuesResult.ok) {
  console.error('[DEV] Failed to fetch for-dev issues');
  return null;
}
const raw = issuesResult.value;
```

### Phase 4: Update `hasNewReviewComments()` Helper
**File**: `src/github.ts:100-129`

The `hasNewReviewComments()` function has a direct `execSync` call at line 113 for fetching inline review comments via REST API. Refactor to use the same retry pattern:

```typescript
export async function hasNewReviewComments(
  prNumber: number,
  prComments: Array<{ body: string; createdAt: string }>,
  cwd?: string
): Promise<boolean> {
  // ... (lastBotTimestamp logic unchanged)
  
  const commentsResult = await gh<string[]>(
    `api repos/{owner}/{repo}/pulls/${prNumber}/comments --jq '[.[] | .created_at]'`,
    cwd
  );
  
  if (!commentsResult.ok) {
    console.warn(`[GH] Failed to fetch review comments for PR #${prNumber}`);
    return false; // gracefully assume no new comments
  }
  
  const timestamps = commentsResult.value;
  // ... (rest of logic unchanged)
}
```

### Phase 5: Async Propagation
Since `gh()` is now async, all calling functions must become async:
- `src/triage.ts`: `reEvaluateNeedsInfo()` → already async ✅
- `src/triage.ts`: `hasUntriagedIssues()` → make async
- `src/planner.ts`: `handleReviewIssues()` → make async
- `src/dev.ts`: `handlePRReviews()` → already async ✅
- `src/dev.ts`: `pickHighestPriorityIssue()` → make async

### Phase 6: Testing (per TDD Protocol)
**New File**: `src/__tests__/github.test.ts`

**Test Coverage**:
1. **Happy Path**:
   - `gh('issue list --json number')` returns `Ok({ value: [...] })`
   - JSON parsing works correctly
   - Non-JSON commands return raw string
2. **Retry Behavior**:
   - Network timeout triggers retry (mock `execSync` to fail twice, succeed on 3rd)
   - Exponential backoff delays are correct (1s, 2s, 4s)
   - Console.warn logs retry attempts
3. **Error Classification**:
   - 404 error does NOT retry (immediate `Err`)
   - 401 auth error does NOT retry
   - 429 rate limit DOES retry
   - 503 server error DOES retry
4. **Exhausted Retries**:
   - After 3 failed attempts, returns `Err` with error details
   - Does not throw exception
5. **Result Type Helpers**:
   - `Ok(value)` creates `{ ok: true, value }`
   - `Err(error)` creates `{ ok: false, error }`

**Mock Strategy**:
```typescript
import { vi, describe, it, expect } from 'vitest';
import { gh } from '../github.js';
import * as cp from 'child_process';

vi.mock('child_process');

describe('gh() with retry logic', () => {
  it('should return Ok on successful command', async () => {
    vi.mocked(cp.execSync).mockReturnValueOnce('{"number": 42}');
    const result = await gh('issue view 42 --json number');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ number: 42 });
    }
  });

  it('should retry on transient network error', async () => {
    const timeoutError = new Error('ETIMEDOUT');
    vi.mocked(cp.execSync)
      .mockImplementationOnce(() => { throw timeoutError; })
      .mockImplementationOnce(() => { throw timeoutError; })
      .mockReturnValueOnce('{"success": true}');
    
    const result = await gh('issue list --json number');
    expect(result.ok).toBe(true);
    expect(vi.mocked(cp.execSync)).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on 404 error', async () => {
    const notFoundError = new Error('HTTP 404: Not Found');
    vi.mocked(cp.execSync).mockImplementationOnce(() => { throw notFoundError; });
    
    const result = await gh('issue view 999 --json number');
    expect(result.ok).toBe(false);
    expect(vi.mocked(cp.execSync)).toHaveBeenCalledTimes(1); // no retries
  });
});
```

**Test Runner Setup** (check `package.json`):
- Current: `"test": "echo \"Error: no test specified\" && exit 1"`
- **Add**: Install `vitest` as dev dependency
- **Update**: `"test": "vitest run"`

### Phase 7: Type Safety Migration
Update all function signatures that call `gh()` to handle `Result`:

**Example in `src/triage.ts:reEvaluateNeedsInfo()`**:
```typescript
async function reEvaluateNeedsInfo(): Promise<void> {
  console.log('[pre-processing] Checking needs-info issues...');

  const issuesResult = await gh<GitHubIssue[]>(
    'issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt',
    targetCwd
  );

  if (!issuesResult.ok) {
    console.error('[pre-processing] Failed to fetch needs-info issues');
    return; // graceful exit instead of crash
  }

  const issues = issuesResult.value;
  if (!issues || issues.length === 0) {
    console.log('[pre-processing] No needs-info issues found.');
    return;
  }

  for (const issue of issues) {
    // ... rest of logic
  }
}
```

---

## Testing Verification (TDD Protocol Compliance)

### Baseline Sanity (Phase 0):
```bash
npx tsc --noEmit  # Must compile clean before changes
npm test          # Currently fails (no test runner) - will install vitest
```

### Incremental Testing (Phase 2):
After implementing Result type and `gh()` refactor:
```bash
npx tsc --noEmit          # Verify types compile
npm test                   # Run new github.test.ts
```

### Final Gate (Phase 3):
Before creating PR:
```bash
npx tsc --noEmit && npm test  # Both must pass
```

---

## Acceptance Criteria Mapping

| Criterion | Implementation | File(s) |
|-----------|---------------|---------|
| All `gh()` calls have error handling | Return `Result<T>` instead of throwing | `src/github.ts:36` |
| Exponential backoff retry (max 3) | Retry loop with `2^attempt` delay | `src/github.ts` |
| Graceful failure messages | `console.warn` for retries, `console.error` for final failure | `src/github.ts` |
| Tests for error scenarios | Mock `execSync` to simulate timeout, 404, 429, 503 | `src/__tests__/github.test.ts` |
| No unguarded `execSync` | Migrate `dev.ts:140` and `github.ts:113` to use `gh()` | `src/dev.ts`, `src/github.ts` |

---

## Rollout Plan

1. **Phase 1-2**: Implement Result type and refactor `gh()` (breaking change, but no call sites updated yet)
2. **Phase 3-5**: Update all call sites and propagate async (entire codebase must be updated atomically)
3. **Phase 6**: Add comprehensive test coverage
4. **Phase 7**: Type check and verify all agents still compile

**Risk**: This is a **breaking change** to `gh()` signature. All call sites must be updated in the same commit to avoid runtime errors.

**Mitigation**: Keep old `gh()` as `ghSync()` temporarily, introduce new `gh()` as async, migrate call sites incrementally, then remove `ghSync()`.

Alternative: Use a feature flag or gradual rollout is not feasible here - must be atomic.

---

## Files Changed

- `src/types.ts` (NEW)
- `src/github.ts` (MODIFIED - `gh()`, `hasNewReviewComments()`)
- `src/triage.ts` (MODIFIED - 6 call sites)
- `src/planner.ts` (MODIFIED - 5 call sites)
- `src/dev.ts` (MODIFIED - 8 call sites + direct execSync)
- `src/__tests__/github.test.ts` (NEW)
- `package.json` (MODIFIED - add vitest, update test script)

**Total**: 6 modified files, 2 new files
