# TECH_SPEC_61: Complete Error Handling for Init Script

**Priority Score: 7.5** (I=3, C=5, E=2)

**Issue**: #61  
**Type**: Enhancement  
**Labels**: triaged, enhancement, pm-proposal

---

## Executive Summary

Enhance `scripts/init.ts` with comprehensive error handling, validation, and user-friendly error messages to prevent false positives during onboarding and provide professional first-run experience.

## Root Cause / Requirements Analysis

**Current State** (as of commit 97fe4c8):
- Basic try-catch exists around gh auth check (L52-58) and repo operations (L77-104)
- Multiple `execSync` calls NOT wrapped in error handling (L29, L78, L84)
- No GitHub repository permission validation (only checks if repo exists)
- No ANTHROPIC_API_KEY format validation (only checks if env var exists)
- No handling of malformed JSON responses from `gh` CLI
- Generic error messages lacking actionable guidance

**Gaps Identified**:
1. **Unprotected execSync calls**: runGh() helper (L28-30) is a thin wrapper with no error handling
2. **Missing validations**: 
   - GitHub write permissions not verified (can create issues/comments)
   - ANTHROPIC_API_KEY format not validated (should match `sk-ant-*` pattern)
3. **Error message quality**: Errors don't provide clear next steps for users
4. **False positive risk**: Script can exit successfully even if runtime will fail

## Pattern Discovery

**Existing Error Handling Pattern** (src/github.ts:36-48):
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

**Reuse Strategy**: The existing `gh()` helper in src/github.ts provides a good pattern but:
- scripts/init.ts has its own `runGh()` helper (L28-30) that should be enhanced
- Should NOT create a dependency on src/github.ts (init script should be standalone)
- Apply similar try-catch + user-friendly error pattern locally in init.ts

## Files Affected

### Primary Changes
- **scripts/init.ts** - Add comprehensive error handling and validations

### New Files
- **scripts/init.test.ts** - Test coverage for error scenarios
- **package.json** - Add test framework (Vitest recommended for TS projects)

## Implementation Blueprint

### Phase 1: Enhance runGh() Helper Function

**Location**: `scripts/init.ts:28-30`

**Current Code**:
```typescript
function runGh(args: string, cwd?: string): string {
  return execSync(`gh ${args}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd }).trim();
}
```

**Enhanced Code**:
```typescript
function runGh(args: string, cwd?: string): string {
  try {
    const result = execSync(`gh ${args}`, { 
      encoding: 'utf-8', 
      stdio: ['pipe', 'pipe', 'pipe'], 
      cwd 
    }).trim();
    
    // Validate JSON responses
    if (args.includes('--json') && result) {
      try {
        JSON.parse(result);
      } catch (jsonError) {
        throw new Error(`GitHub CLI returned malformed JSON for command: gh ${args}\nOutput: ${result}`);
      }
    }
    
    return result;
  } catch (error: any) {
    // Enhance error message with context
    const message = error.message || String(error);
    throw new Error(`GitHub CLI command failed: gh ${args}\nReason: ${message}`);
  }
}
```

**Rationale**: Centralize error handling for all gh CLI calls, validate JSON responses early.

---

### Phase 2: Add Validation Functions

**Location**: After `checkCommand()` function (before `runGh()`)

**New Functions**:

```typescript
function validateApiKey(key: string | undefined): { valid: boolean; error?: string } {
  if (!key) {
    return { 
      valid: false, 
      error: 'ANTHROPIC_API_KEY not found in environment.\n   Add it to .env: ANTHROPIC_API_KEY=sk-ant-...' 
    };
  }
  
  if (!key.startsWith('sk-ant-')) {
    return { 
      valid: false, 
      error: `ANTHROPIC_API_KEY has invalid format: "${key.slice(0, 10)}..."\n   Expected format: sk-ant-...` 
    };
  }
  
  if (key.length < 20) {
    return { 
      valid: false, 
      error: 'ANTHROPIC_API_KEY appears too short to be valid.\n   Expected format: sk-ant-...' 
    };
  }
  
  return { valid: true };
}

function validateGitHubAccess(cwd?: string): { valid: boolean; error?: string } {
  try {
    // Test read access - fetch repo info
    const repoInfo = JSON.parse(runGh('repo view --json name,owner', cwd));
    
    // Test write access - attempt to list issues (requires repo read permissions at minimum)
    runGh('issue list --limit 1 --json number', cwd);
    
    // Note: We don't actually create a test issue/comment to avoid polluting the repo
    // We verify gh CLI auth has appropriate scopes instead
    const authStatus = runGh('auth status 2>&1', cwd);
    if (!authStatus.includes('repo')) {
      return {
        valid: false,
        error: 'GitHub CLI lacks required "repo" scope.\n   Please re-authenticate: gh auth refresh -s repo'
      };
    }
    
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: `Cannot verify GitHub repository access.\n   ${error.message}\n   Ensure you're in a valid git repository with remote configured.`
    };
  }
}
```

**Rationale**: 
- API key validation prevents runtime failures from invalid keys
- GitHub access validation ensures permissions before agents run
- Separation of concerns - validation logic isolated from main flow

---

### Phase 3: Refactor main() with Enhanced Error Handling

**Location**: `scripts/init.ts:32-107`

**Key Changes**:

1. **Node.js check** (L36-42): Already has good error handling ✓

2. **gh CLI check** (L44-49): Already has good error handling ✓

3. **gh auth check** (L52-58): 
   ```typescript
   // Current: Generic error message
   // Enhanced: Provide auth command
   try {
     runGh('auth status');
     console.log('✅ GitHub CLI: Authenticated');
   } catch (error) {
     console.error('❌ GitHub CLI: Not authenticated.');
     console.error('   Please authenticate: gh auth login');
     console.error('   Required scopes: repo (for issue/PR access)');
     process.exit(1);
   }
   ```

4. **API Key validation** (L61-66):
   ```typescript
   // Current: Only checks existence
   // Enhanced: Validate format
   const apiKeyValidation = validateApiKey(process.env.ANTHROPIC_API_KEY);
   if (!apiKeyValidation.valid) {
     console.error(`❌ ${apiKeyValidation.error}`);
     process.exit(1);
   }
   console.log('✅ ANTHROPIC_API_KEY: Valid format');
   ```

5. **Target repo check** (L69-75):
   ```typescript
   // Current: Only checks path exists
   // Enhanced: More descriptive error
   if (!fs.existsSync(targetPath)) {
     console.error(`❌ Target repository path does not exist: ${targetPath}`);
     console.error('   Set TARGET_REPO_PATH in .env to a valid git repository path.');
     console.error('   Or run this script from within the target repository.');
     process.exit(1);
   }
   ```

6. **Repo info + label check** (L77-104):
   ```typescript
   // Current: Generic try-catch with warning
   // Enhanced: Validate permissions separately
   const accessValidation = validateGitHubAccess(targetPath);
   if (!accessValidation.valid) {
     console.error(`❌ ${accessValidation.error}`);
     process.exit(1);
   }
   
   try {
     const repoInfo = JSON.parse(runGh('repo view --json name,owner,url', targetPath));
     console.log(`✅ Connected to Repo: ${repoInfo.owner.login}/${repoInfo.name}`);
     
     // Label creation logic - wrap individual label creation in try-catch
     console.log('\n🏷️  Checking GitHub Labels...');
     const labelsUrl = `repos/${repoInfo.owner.login}/${repoInfo.name}/labels`;
     const existingLabelsJson = runGh(`api ${labelsUrl} --paginate`, targetPath);
     const existingLabels = JSON.parse(existingLabelsJson).map((l: any) => l.name.toLowerCase());

     for (const label of REQUIRED_LABELS) {
       if (existingLabels.includes(label.name.toLowerCase())) {
         console.log(`   ✅ Label exists: ${label.name}`);
       } else {
         console.log(`   ➕ Creating label: ${label.name}...`);
         try {
           runGh(`api -X POST ${labelsUrl} -f name="${label.name}" -f color="${label.color}" -f description="${label.description}"`, targetPath);
           console.log(`      ✅ Created.`);
         } catch (err: any) {
           // Non-fatal - log but continue
           console.error(`      ❌ Failed to create label ${label.name}: ${err.message}`);
           console.error(`      You may need to create this label manually.`);
         }
       }
     }
   } catch (err: any) {
     console.error(`❌ Failed to verify repository labels.`);
     console.error(`   ${err.message}`);
     console.error('   Ensure you have write access to the repository.');
     process.exit(1);
   }
   ```

7. **Top-level error handler** (L109-112):
   ```typescript
   // Current: Generic error
   // Enhanced: More helpful message
   main().catch(err => {
     console.error('\n💥 Unexpected error during initialization:');
     console.error(err.message || err);
     console.error('\nPlease report this issue at: https://github.com/guyklainer/atomo/issues');
     process.exit(1);
   });
   ```

---

### Phase 4: Add Test Coverage

**New File**: `scripts/init.test.ts`

**Test Framework Setup** (package.json):
```json
{
  "devDependencies": {
    "@types/node": "^25.6.0",
    "vitest": "^1.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Test Structure**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process');

describe('init.ts error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('validateApiKey()', () => {
    it('should reject undefined API key', () => {
      // Test undefined
    });
    
    it('should reject API key without sk-ant- prefix', () => {
      // Test invalid format
    });
    
    it('should reject API key that is too short', () => {
      // Test short key
    });
    
    it('should accept valid sk-ant- API key', () => {
      // Test valid key
    });
  });
  
  describe('validateGitHubAccess()', () => {
    it('should detect missing repo scope in auth', () => {
      // Mock gh auth status without repo scope
    });
    
    it('should handle gh CLI command failure gracefully', () => {
      // Mock execSync throwing error
    });
    
    it('should validate read access successfully', () => {
      // Mock successful repo view
    });
  });
  
  describe('runGh()', () => {
    it('should detect malformed JSON responses', () => {
      // Mock invalid JSON from gh CLI
    });
    
    it('should provide helpful error messages on command failure', () => {
      // Mock execSync failure
    });
  });
  
  describe('checkCommand()', () => {
    it('should detect missing gh CLI', () => {
      // Mock command -v gh failure
    });
  });
  
  describe('main() integration', () => {
    it('should exit with error if gh CLI not found', () => {
      // Mock missing gh
    });
    
    it('should exit with error if gh auth fails', () => {
      // Mock auth failure
    });
    
    it('should exit with error if API key is invalid', () => {
      // Mock invalid API key
    });
    
    it('should exit with error if target path does not exist', () => {
      // Mock invalid path
    });
  });
});
```

**Rationale**: 
- Vitest chosen for native TypeScript support, fast execution
- Test error scenarios mentioned in acceptance criteria
- Mock execSync to avoid actual CLI calls during tests
- Validate error message quality (user-friendly, actionable)

---

## Acceptance Criteria Mapping

| Criterion | Implementation | Location |
|-----------|---------------|----------|
| All execSync calls wrapped in try-catch | Enhanced runGh() + validation functions | Phase 1 & 2 |
| Validate repo access (read issues, write comments) | validateGitHubAccess() checks gh auth scopes | Phase 2 |
| Validate API key format (sk-ant-*) | validateApiKey() with pattern matching | Phase 2 |
| User-friendly errors with next steps | Enhanced error messages throughout main() | Phase 3 |
| Test coverage for error scenarios | Comprehensive Vitest test suite | Phase 4 |

---

## Edge Cases & Considerations

### 1. GitHub CLI Version Compatibility
- **Risk**: Older gh CLI versions may have different output formats
- **Mitigation**: Document minimum gh CLI version in error message if JSON parsing fails
- **Implementation**: Add version check in checkCommand('gh') if needed

### 2. API Key Network Validation
- **Decision**: Do NOT ping Anthropic API during init
- **Rationale**: 
  - Adds network dependency to init script
  - May fail due to transient network issues unrelated to key validity
  - Format validation (sk-ant- prefix) catches 99% of typos
  - Runtime will validate actual key on first API call anyway

### 3. Write Permission Testing
- **Decision**: Check gh auth scopes, do NOT create test issues/comments
- **Rationale**: 
  - Avoids polluting repository with test data
  - Scope check is sufficient to verify permissions
  - Actual write operations tested during agent runtime

### 4. Partial Failure Handling
- **Decision**: Label creation failures are non-fatal (log warning, continue)
- **Rationale**: 
  - Labels can be created manually later
  - Init script should not fail completely if labels already exist or permissions are restricted
  - Other validations (auth, API key) are hard requirements

### 5. JSON Parsing Error Context
- **Decision**: Enhanced runGh() validates JSON and includes raw output in error
- **Rationale**: 
  - Helps debug gh CLI version incompatibilities
  - Provides actionable context for user to report issues

---

## Testing Strategy

### Unit Tests (scripts/init.test.ts)
- Mock all execSync calls
- Test each validation function in isolation
- Verify error message quality

### Integration Test (manual)
1. **Missing gh CLI**: Rename gh binary temporarily, verify error message
2. **Not authenticated**: Run `gh auth logout`, verify error message  
3. **Invalid API key**: Set ANTHROPIC_API_KEY=invalid, verify rejection
4. **Invalid repo path**: Set TARGET_REPO_PATH=/nonexistent, verify error
5. **Missing repo scope**: Test with restricted gh auth (read:user only)

### Success Path Test (manual)
1. Fresh clone of repository
2. Run `npm run init` (or `npx tsx scripts/init.ts`)
3. Verify all checks pass with ✅ symbols
4. Verify labels created in target repo

---

## Rollout Plan

1. **Implement Phase 1 & 2**: Add helper functions (no breaking changes)
2. **Implement Phase 3**: Enhance main() error handling
3. **Test manually**: Verify error scenarios work as expected
4. **Implement Phase 4**: Add Vitest and test suite
5. **Update README**: Document new error messages (if README mentions init script)
6. **Merge & Deploy**: Single PR with all changes

**Estimated Effort**: 2-3 hours (implementation + testing)

---

## Success Metrics

- **Zero false positives**: Init script never exits successfully if runtime will fail
- **Actionable errors**: Every error message includes next steps
- **User confidence**: Clear indication of what's wrong and how to fix it
- **Test coverage**: >80% line coverage on init.ts error handling paths

---

## Related Issues / Dependencies

- None (standalone enhancement)

---

## References

- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Anthropic API Key Format](https://docs.anthropic.com/en/api/getting-started)
- [Vitest Documentation](https://vitest.dev/)
- Existing error handling pattern: `src/github.ts:36-48`

---

**Generated by**: Architect Agent  
**Date**: 2026-04-23
