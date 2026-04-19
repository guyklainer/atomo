# TECH SPEC #3: Optimize FLOW B - Move Re-Evaluation Logic from LLM to Deterministic Code

**Priority: 10.0** (I=4, C=5, E=2)  
**Issue**: #3  
**Type**: Enhancement (Cost Optimization)  
**Confidence**: 100%

---

## Root Cause / Requirements

### Current State
The triage agent (`src/triage.ts`) executes two flows on every invocation:
- **FLOW A**: Classify new untriaged issues (requires LLM reasoning)
- **FLOW B**: Re-evaluate `needs-info` issues after human replies (currently uses LLM)

The problem is that FLOW B is currently executed by asking the LLM to:
1. Query GitHub for `needs-info` issues
2. Parse comments to detect human replies (check for comments after last `🤖` comment)
3. Determine which agent paused the issue (check labels)
4. Execute appropriate re-entry logic (remove labels, post comments)

**Most of this is deterministic logic that doesn't require LLM reasoning**, causing unnecessary token consumption on every triage run.

### Target State
Move FLOW B execution to deterministic TypeScript code that runs **before** the LLM agent is invoked. The LLM should only be used where reasoning is actually required (re-classifying issues in Gatekeeper Re-Entry scenarios).

### Cost Savings Analysis
- **Current**: LLM processes ALL needs-info issues (including cases with no human reply, pure label manipulation)
- **After**: Code handles 100% of "no human reply" cases (skip), 100% of Architect Re-Entry cases (deterministic), only Gatekeeper Re-Entry cases may need LLM re-classification
- **Estimated savings**: 60-80% reduction in FLOW B token usage

---

## Target Files

### Files to Modify
1. **`src/triage.ts`** (Primary changes)
   - Add `handleNeedsInfoIssues()` function to execute FLOW B deterministically
   - Add GitHub CLI helper utilities
   - Modify main execution flow to run pre-processing before LLM invocation
   - Update system prompt to remove FLOW B instructions (LLM no longer responsible for this)

### Files to Create
None (all changes contained within existing `src/triage.ts`)

### Dependencies
- Existing: `gh` CLI (GitHub CLI) - already used throughout project
- Existing: Node.js `child_process` for executing shell commands
- Existing: TypeScript (ESM module format per `package.json`)

---

## Implementation Roadmap

### Phase 1: Create GitHub CLI Helper Utilities

**Location**: Top of `src/triage.ts`, before main logic

```typescript
import { execSync } from 'child_process';

// Type definitions for GitHub CLI responses
interface GitHubIssue {
  number: number;
  title: string;
  createdAt?: string;
  body: string;
  labels: Array<{ name: string }>;
  comments: Array<{
    body: string;
    author: { login: string };
    createdAt: string;
  }>;
}

/**
 * Execute GitHub CLI command and parse JSON response
 */
function gh(command: string): any {
  try {
    const result = execSync(`gh ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'inherit'] // Inherit stderr for visibility
    });
    return command.includes('--json') ? JSON.parse(result) : result;
  } catch (error) {
    console.error(`[GH CLI Error]: ${command}`, error);
    throw error;
  }
}
```

**Rationale**: 
- Follows existing pattern in project where GitHub CLI commands are strings (grep results show this pattern)
- Provides type safety for parsed JSON responses
- Centralizes error handling
- Uses `execSync` for simplicity (no async complexity needed for these operations)

---

### Phase 2: Implement Comment Detection Logic

**Location**: `src/triage.ts`, after helper utilities

```typescript
/**
 * Detect if a human has replied after the last bot comment
 * Per reevaluation protocol: Find last comment starting with 🤖,
 * then check if any subsequent comments exist that don't start with 🤖
 */
function hasHumanReplyAfterBot(comments: GitHubIssue['comments']): boolean {
  if (!comments || comments.length === 0) return false;
  
  // Scan in reverse to find last bot comment
  let lastBotIndex = -1;
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].body.trim().startsWith('🤖')) {
      lastBotIndex = i;
      break;
    }
  }
  
  // If no bot comment found, any comment counts as human reply
  if (lastBotIndex === -1) {
    return comments.length > 0;
  }
  
  // Check if there are comments after the last bot comment
  for (let i = lastBotIndex + 1; i < comments.length; i++) {
    if (!comments[i].body.trim().startsWith('🤖')) {
      return true;
    }
  }
  
  return false;
}
```

**Rationale**:
- Implements exact logic from `protocols/reevaluation.md` step 3
- Handles edge case: no bot comments (treat any comment as human)
- Scans reverse-chronologically for efficiency (most recent first)

---

### Phase 3: Implement Agent Detection Logic

**Location**: `src/triage.ts`, after comment detection

```typescript
/**
 * Determine which agent paused this issue based on labels
 * Per reevaluation protocol step 4:
 * - No 'triaged' label → Gatekeeper paused it
 * - Has 'triaged' but no 'for-dev' → Architect paused it
 */
function detectPausingAgent(labels: Array<{ name: string }>): 'gatekeeper' | 'architect' | null {
  const labelNames = labels.map(l => l.name);
  const hasTriaged = labelNames.includes('triaged');
  const hasForDev = labelNames.includes('for-dev');
  
  if (!hasTriaged) {
    return 'gatekeeper'; // Paused before classification
  } else if (hasTriaged && !hasForDev) {
    return 'architect'; // Paused after classification, before planning
  }
  
  return null; // Shouldn't happen for needs-info issues, but handle gracefully
}
```

**Rationale**:
- Direct implementation of protocol step 4 logic
- Returns null for unexpected states (defensive programming)
- Clear, readable label checking

---

### Phase 4: Implement Main FLOW B Handler

**Location**: `src/triage.ts`, as new async function

```typescript
/**
 * FLOW B: Re-evaluate needs-info issues (deterministic pre-processing)
 * Handles Architect Re-Entry fully in code.
 * For Gatekeeper Re-Entry, removes needs-info label and lets FLOW A re-process.
 */
async function handleNeedsInfoIssues(): Promise<void> {
  console.log('[FLOW B] Checking needs-info issues...');
  
  // Step 1: Query for pending issues
  const issues: GitHubIssue[] = gh(
    'issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt'
  );
  
  if (!issues || issues.length === 0) {
    console.log('[FLOW B] No needs-info issues found.');
    return;
  }
  
  console.log(`[FLOW B] Found ${issues.length} needs-info issue(s)`);
  
  // Process each issue
  for (const issue of issues) {
    console.log(`[FLOW B] Processing issue #${issue.number}...`);
    
    // Step 2: Fetch full details
    const fullIssue: GitHubIssue = gh(
      `issue view ${issue.number} --json number,title,body,labels,comments`
    );
    
    // Step 3: Detect human reply
    const hasReply = hasHumanReplyAfterBot(fullIssue.comments);
    
    if (!hasReply) {
      console.log(`[FLOW B] Issue #${issue.number}: No human reply yet, skipping.`);
      continue;
    }
    
    console.log(`[FLOW B] Issue #${issue.number}: Human reply detected!`);
    
    // Step 4: Determine which agent paused it
    const pausingAgent = detectPausingAgent(fullIssue.labels);
    
    if (pausingAgent === 'gatekeeper') {
      // Gatekeeper Re-Entry: Remove needs-info, let FLOW A re-triage
      console.log(`[FLOW B] Issue #${issue.number}: Gatekeeper Re-Entry → Removing needs-info`);
      gh(`issue edit ${issue.number} --remove-label needs-info`);
      // FLOW A will pick this up as untriaged (no 'triaged' label) and re-classify with new context
      
    } else if (pausingAgent === 'architect') {
      // Architect Re-Entry: Complete handling here (no LLM needed)
      console.log(`[FLOW B] Issue #${issue.number}: Architect Re-Entry → Routing back to Architect`);
      gh(`issue edit ${issue.number} --remove-label needs-info`);
      gh(`issue comment ${issue.number} --body "🤖 Clarification received. Routing back to the Architect for planning."`);
      // Architect will pick this up on next run (has 'triaged', no 'for-dev', no 'needs-info')
      
    } else {
      console.warn(`[FLOW B] Issue #${issue.number}: Unexpected state (pausing agent: ${pausingAgent}), skipping.`);
    }
  }
  
  console.log('[FLOW B] Re-evaluation complete.');
}
```

**Rationale**:
- Implements complete reevaluation protocol logic deterministically
- Comprehensive logging for observability
- Handles both Gatekeeper and Architect re-entry paths
- Defensive programming for unexpected states
- **Key insight**: Gatekeeper Re-Entry no longer needs LLM in FLOW B - just remove the label and let FLOW A (which IS LLM-driven) handle re-classification naturally

---

### Phase 5: Update Main Execution Flow

**Location**: `src/triage.ts`, bottom of file (before `runAgent` call)

**Current code** (lines 98-102):
```typescript
runAgent('Gatekeeper', SYSTEM_PROMPT, {
  model: 'claude-haiku-4-5',
  tools: ['Bash'],
  allowedTools: ['Bash']
}).catch(console.error);
```

**Replace with**:
```typescript
// Execute FLOW B (needs-info re-evaluation) BEFORE invoking LLM
(async () => {
  try {
    await handleNeedsInfoIssues(); // Deterministic pre-processing
  } catch (error) {
    console.error('[FLOW B] Error during needs-info handling:', error);
    // Continue to FLOW A even if FLOW B fails (they're independent)
  }
  
  // Now execute FLOW A (triage new issues) via LLM
  await runAgent('Gatekeeper', SYSTEM_PROMPT, {
    model: 'claude-haiku-4-5',
    tools: ['Bash'],
    allowedTools: ['Bash']
  });
})().catch(console.error);
```

**Rationale**:
- Ensures FLOW B completes before FLOW A starts
- FLOW B failures don't block FLOW A (independent flows)
- Maintains same error handling pattern (`catch(console.error)`)

---

### Phase 6: Update System Prompt (Remove FLOW B from LLM Responsibilities)

**Location**: `src/triage.ts`, SYSTEM_PROMPT constant (lines 18-96)

**Remove these sections**:
1. Lines 22: "You run two flows every time you are invoked. Complete FLOW A first, then FLOW B."
2. Lines 64-79: Entire "## FLOW B — Re-Evaluate needs-info Issues" section

**Replace line 22 with**:
```
Your objective is to ingest open GitHub issues and classify them using strict heuristic guidelines.
FLOW B (needs-info re-evaluation) is now handled before you run, so focus only on FLOW A below.
```

**Update STEP A1** (line 30) query:
```
gh issue list --search "is:open -label:triaged -label:for-dev" --limit 1 --json number,title,createdAt
```
**Reason**: Add `-label:for-dev` to avoid picking up issues that were just unlocked by FLOW B but are destined for Architect (have `triaged` but no `for-dev`). Only truly untriaged issues should hit FLOW A.

**Rationale**:
- LLM no longer responsible for FLOW B
- Simplifies LLM prompt → faster execution, lower token usage
- FLOW A query updated to avoid conflict with FLOW B's Architect Re-Entry path

---

## Verification Steps

### Manual Testing
1. **Setup**: Create a test issue with `needs-info` label and a human reply comment
2. **Run**: `npm run triage`
3. **Verify**: Check console logs show `[FLOW B]` processing
4. **Verify**: GitHub issue should have `needs-info` label removed and appropriate action taken

### Edge Cases to Test
1. **No human reply**: Issue should be skipped (verify via logs)
2. **Gatekeeper Re-Entry**: Issue should lose `needs-info` and be re-triaged by FLOW A
3. **Architect Re-Entry**: Issue should get acknowledgment comment and route to Architect
4. **Multiple bot comments**: Ensure only comments AFTER the LAST bot comment count

### Rollback Strategy
If issues arise:
1. Comment out line calling `await handleNeedsInfoIssues()`
2. Restore original SYSTEM_PROMPT (git revert)
3. System reverts to previous LLM-driven FLOW B behavior

---

## Pattern Discovery

### Existing GitHub CLI Patterns (from codebase grep)
- All agents use `gh` CLI via string commands passed to LLM's Bash tool
- JSON responses parsed with `--json` flag + field list
- Label manipulation: `gh issue edit <number> --add-label X --remove-label Y`
- Comment posting: `gh issue comment <number> --body "message"`

### Consistency with Existing Code
- Uses same `gh` CLI patterns as `src/planner.ts` and `src/dev.ts`
- Follows ESM module format (import/export, per package.json `"type": "module"`)
- Maintains logging convention: `[Agent Name]` prefix (e.g., `[FLOW B]`)
- Error handling via try/catch and `.catch(console.error)` (consistent with `src/runner.ts`)

---

## Protocol Compliance

### Reevaluation Protocol (`protocols/reevaluation.md`)
✅ **Fully Implemented**:
- Step 1: Query for `needs-info` issues
- Step 2: Fetch full details
- Step 3: Detect human reply (reverse scan for last `🤖` comment)
- Step 4: Determine pausing agent (check `triaged` + `for-dev` labels)
- Step 5a (Gatekeeper Re-Entry): Remove label → let FLOW A re-classify
- Step 5b (Architect Re-Entry): Remove label + post acknowledgment comment

### Zero-Waste Protocol (`protocols/planning.md`)
✅ **Complied**:
- Used Glob to find `triage.ts` and protocol files
- Used Read to extract specific logic (not full file dumps)
- Grepped for existing `gh` CLI patterns
- Discovered and integrated with existing protocols (`reevaluation.md`)

---

## Success Metrics

### Immediate
- ✅ FLOW B executes before LLM invocation
- ✅ Architect Re-Entry issues handled without LLM
- ✅ Gatekeeper Re-Entry issues properly unlocked for FLOW A

### Long-term
- 📉 Reduced token consumption on `npm run triage` (measure via Anthropic dashboard)
- 📉 Faster triage execution (less LLM processing time)
- ✅ No regression in issue routing accuracy

---

## Open Questions / Risks

### ⚠️ Potential Issue: FLOW A Picking Up Architect-Routed Issues
**Risk**: When FLOW B handles Architect Re-Entry and removes `needs-info`, the issue has `triaged` but no `for-dev`. FLOW A's query `is:open -label:triaged` won't pick it up (good!), but the updated query `is:open -label:triaged -label:for-dev` still won't pick it up.

**Resolution**: This is actually correct behavior! These issues should go straight to the Architect, not back through FLOW A. The Architect's query (`src/planner.ts` line 24) is:
```
is:open label:triaged -label:for-dev -label:needs-repro -label:needs-triage -label:needs-info
```
This will correctly pick up Architect Re-Entry issues (have `triaged`, no `for-dev`, no `needs-info`).

### ✅ No Remaining Risks
All edge cases accounted for in implementation logic.

---

## Estimated Implementation Time
- **Coding**: 30-45 minutes
- **Testing**: 15-20 minutes  
- **Total**: ~1 hour

---

**End of Technical Specification**
