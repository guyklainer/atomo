# TECH_SPEC_68: Real-Time Progress Indicators (Stream JSONL Events to Console)

**Priority Score: 4.0** (I=3, C=4, E=3)

**Issue**: #68  
**Type**: Enhancement (UX Improvement)  
**Category**: DX - User Experience  
**Labels**: triaged, enhancement, pm-proposal

---

## Executive Summary

Enhance the existing `src/runner.ts` console output to provide user-friendly, real-time progress indicators during long-running agent operations. Transform verbose `[Reasoning]: <full text>` logs into summarized milestone updates with progress tracking, estimated time remaining, and a configurable verbosity mode. This addresses user anxiety during multi-minute agent runs by making progress visible and predictable.

**Current State**: Console shows full reasoning text and raw tool names (verbose, overwhelming)  
**Target State**: Summarized milestones with emojis, progress counters, and ETA estimates

---

## Root Cause / Requirements Analysis

### Current Implementation (src/runner.ts:63-93)

The SDK's `query()` function returns an async iterable stream with messages of type:
- `assistant`: Contains reasoning blocks (`block.type === 'text'`) and tool calls (`block.type === 'tool_use'`)
- `result`: Final completion with token usage

**Existing Console Output**:
```typescript
// Line 67: Full reasoning text dump
log(`[Reasoning]: ${block.text}`); 

// Line 73: Raw tool name
log(`[Tool Call]: Initiating ${block.name}...`);

// Line 81: Completion message
log(`[${agentName}] Pipeline execution complete.`);
```

**Problem**: 
- Reasoning blocks can be 500+ characters → clutters console
- No semantic grouping (user doesn't know "are we scanning? analyzing? writing?")
- No progress indication (50 tool calls - are we at #5 or #45?)
- No time estimation (how long until done?)

### User Experience Gap

**Before** (Current):
```
[Gatekeeper] Starting Pipeline...
[Reasoning]: I need to first check for issues with the needs-info label to see if any have received human clarification. Let me query GitHub for issues matching that criteria using the gh CLI tool...
[Tool Call]: Initiating Bash...
[Reasoning]: The query returned no needs-info issues currently awaiting re-evaluation. Now I should proceed to check for untriaged issues...
[Tool Call]: Initiating Bash...
[Reasoning]: The query shows 2 untriaged issues. Let me fetch full details for issue #42...
[Tool Call]: Initiating Bash...
[Reasoning]: Based on the issue body, this appears to be a feature request for adding dark mode...
[Tool Call]: Initiating Bash...
...
[Gatekeeper] Pipeline execution complete.
```

**After** (Proposed):
```
[Gatekeeper] Starting Pipeline...
🔍 Scanning for needs-info issues... (0 found)
🔍 Scanning for untriaged issues... (2 found)
📖 Reading issue #42... 
🏷️  Classifying issue #42... (type: enhancement)
✅ Labeled issue #42: triaged, enhancement
📊 Progress: 1/2 issues complete
⏱️  Estimated time remaining: ~30 seconds
🏷️  Classifying issue #43... (type: bug)
✅ Labeled issue #43: triaged, bug
✅ Complete (2m 14s) | Processed 2 issues
```

### Pattern Discovery: Milestone Detection

**Challenge**: The SDK only provides low-level events (`tool_call`, `reasoning`), not semantic milestones ("scanning", "analyzing", "writing").

**Solution**: Infer milestones from tool call patterns and reasoning keywords:

| Milestone | Detection Pattern | Example Tool Calls |
|-----------|------------------|-------------------|
| 🔍 Scanning | `Bash` with `gh issue list` | Checking for needs-info/untriaged issues |
| 📖 Reading | `Read`, `Bash` with `gh issue view` | Fetching issue details, reading protocols |
| 🔍 Analyzing | `Grep`, `Glob`, `Read` (non-issue) | Codebase traversal, pattern search |
| ✍️ Writing | `Write`, `Edit` | Creating tech specs, modifying code |
| 🧪 Testing | `Bash` with `npm test`, `npx tsc` | Running tests, type checking |
| 💬 Commenting | `Bash` with `gh issue comment/edit` | Posting specs, adding labels |

**Implementation Strategy**: Map tool calls to milestone categories in real-time.

---

## Files Affected

### Primary Changes
- **src/runner.ts** (MODIFIED) - Core progress tracking logic
- **src/types.ts** (NEW) - Type definitions for milestones, progress state

### Configuration
- **.env** (DOCUMENTED) - Add `ATOMO_VERBOSE` env var documentation
- **README.md** (OPTIONAL) - Document progress indicator behavior

---

## Implementation Blueprint

### Phase 1: Define Milestone Types & Progress State

**File**: `src/types.ts` (NEW)

```typescript
export type MilestoneType = 
  | 'scanning'
  | 'reading'
  | 'analyzing'
  | 'writing'
  | 'testing'
  | 'commenting';

export interface ProgressState {
  currentMilestone: MilestoneType | null;
  toolCallCount: number;
  startTime: number;
  lastMilestoneTime: number;
  estimatedDuration?: number; // milliseconds, from historical data
}

export interface MilestoneDefinition {
  emoji: string;
  verb: string; // present tense (e.g., "Scanning", "Writing")
  pattern: (toolName: string, reasoningSnippet: string) => boolean;
}

export const MILESTONE_DEFINITIONS: Record<MilestoneType, MilestoneDefinition> = {
  scanning: {
    emoji: '🔍',
    verb: 'Scanning',
    pattern: (tool, reasoning) => 
      tool === 'Bash' && (
        reasoning.includes('gh issue list') ||
        reasoning.includes('needs-info') ||
        reasoning.includes('untriaged')
      ),
  },
  reading: {
    emoji: '📖',
    verb: 'Reading',
    pattern: (tool, reasoning) =>
      tool === 'Read' ||
      (tool === 'Bash' && reasoning.includes('gh issue view')) ||
      reasoning.includes('protocol') ||
      reasoning.includes('TECH_SPEC'),
  },
  analyzing: {
    emoji: '🔍',
    verb: 'Analyzing',
    pattern: (tool, reasoning) =>
      tool === 'Grep' ||
      tool === 'Glob' ||
      (tool === 'Read' && !reasoning.includes('protocol')),
  },
  writing: {
    emoji: '✍️',
    verb: 'Writing',
    pattern: (tool, reasoning) =>
      tool === 'Write' ||
      tool === 'Edit',
  },
  testing: {
    emoji: '🧪',
    verb: 'Testing',
    pattern: (tool, reasoning) =>
      tool === 'Bash' && (
        reasoning.includes('npm test') ||
        reasoning.includes('npx tsc') ||
        reasoning.includes('vitest')
      ),
  },
  commenting: {
    emoji: '💬',
    verb: 'Commenting',
    pattern: (tool, reasoning) =>
      tool === 'Bash' && (
        reasoning.includes('gh issue comment') ||
        reasoning.includes('gh issue edit') ||
        reasoning.includes('--add-label')
      ),
  },
};
```

**Rationale**: Centralized milestone detection logic, reusable across agents.

---

### Phase 2: Historical Duration Loading (ETA Foundation)

**File**: `src/runner.ts` (MODIFIED)

**Insert after line 33 (before `runAgent` function)**:

```typescript
interface HistoricalRunData {
  agent: string;
  duration_ms: number;
  status: 'ok' | 'error';
}

/**
 * Load historical run durations from JSONL logs for ETA estimation.
 * Returns average duration (in ms) for successful runs of the given agent.
 */
function loadHistoricalDuration(agentName: string): number | null {
  const eventsDir = path.join(atomoCwd, 'logs', 'events');
  if (!fs.existsSync(eventsDir)) return null;

  const files = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .slice(-7); // Last 7 days of logs

  const runs: HistoricalRunData[] = [];
  
  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event === 'run_complete' && event.agent === agentName && event.status === 'ok') {
          runs.push({
            agent: event.agent,
            duration_ms: event.duration_ms,
            status: event.status,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  if (runs.length === 0) return null;

  // Calculate median (more robust than mean for skewed distributions)
  const durations = runs.map(r => r.duration_ms).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  
  return median;
}
```

**Rationale**: Use historical data for ETA estimation. Median is more robust than mean (avoids skew from outlier runs).

---

### Phase 3: Progress State Management

**File**: `src/runner.ts` (MODIFIED)

**Import new types** (add to line 1):
```typescript
import { 
  type ProgressState, 
  type MilestoneType, 
  MILESTONE_DEFINITIONS 
} from './types.js';
```

**Insert helper functions** (after `loadHistoricalDuration`):

```typescript
/**
 * Detect milestone type from tool call and reasoning context.
 */
function detectMilestone(toolName: string, recentReasoning: string): MilestoneType | null {
  for (const [type, def] of Object.entries(MILESTONE_DEFINITIONS)) {
    if (def.pattern(toolName, recentReasoning)) {
      return type as MilestoneType;
    }
  }
  return null;
}

/**
 * Format progress message based on current state.
 */
function formatProgressMessage(
  milestone: MilestoneType,
  toolCallCount: number,
  progressState: ProgressState
): string {
  const def = MILESTONE_DEFINITIONS[milestone];
  const elapsed = Date.now() - progressState.startTime;
  const elapsedSec = Math.floor(elapsed / 1000);
  
  let msg = `${def.emoji} ${def.verb}...`;
  
  // Add ETA if available
  if (progressState.estimatedDuration && elapsed < progressState.estimatedDuration) {
    const remaining = progressState.estimatedDuration - elapsed;
    const remainingSec = Math.floor(remaining / 1000);
    const remainingMin = Math.floor(remainingSec / 60);
    
    if (remainingMin > 0) {
      msg += ` ⏱️  ~${remainingMin}m remaining`;
    } else if (remainingSec > 10) {
      msg += ` ⏱️  ~${remainingSec}s remaining`;
    }
  }
  
  return msg;
}

/**
 * Check if ATOMO_VERBOSE mode is enabled.
 */
function isVerboseMode(): boolean {
  return process.env.ATOMO_VERBOSE === 'true';
}
```

---

### Phase 4: Refactor `runAgent()` Streaming Loop

**File**: `src/runner.ts` (MODIFIED)

**Replace lines 59-94** with enhanced version:

```typescript
  // Initialize progress state
  const progressState: ProgressState = {
    currentMilestone: null,
    toolCallCount: 0,
    startTime,
    lastMilestoneTime: startTime,
    estimatedDuration: loadHistoricalDuration(agentName) ?? undefined,
  };

  let recentReasoning = ''; // Keep last reasoning block for milestone detection

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = query({ prompt, options });

      for await (const message of stream) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              recentReasoning = block.text;
              
              // Verbose mode: show full reasoning
              if (isVerboseMode()) {
                log(`[Reasoning]: ${block.text}`);
              }
              
              // Always log to JSONL
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'reasoning', chars: block.text.length,
              });
            } else if (block.type === 'tool_use') {
              progressState.toolCallCount++;
              
              // Detect milestone transition
              const milestone = detectMilestone(block.name, recentReasoning);
              
              if (milestone && milestone !== progressState.currentMilestone) {
                // Milestone changed - log transition
                progressState.currentMilestone = milestone;
                progressState.lastMilestoneTime = Date.now();
                
                const progressMsg = formatProgressMessage(
                  milestone,
                  progressState.toolCallCount,
                  progressState
                );
                log(progressMsg);
              } else if (isVerboseMode()) {
                // Verbose mode: show every tool call
                log(`[Tool Call]: ${block.name}...`);
              }
              
              // Always log to JSONL
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'tool_call', tool: block.name,
              });
            }
          }
        } else if (message.type === 'result') {
          const duration = Date.now() - startTime;
          const durationSec = Math.floor(duration / 1000);
          const durationMin = Math.floor(durationSec / 60);
          const durationDisplay = durationMin > 0 
            ? `${durationMin}m ${durationSec % 60}s`
            : `${durationSec}s`;
          
          log(`✅ [${agentName}] Complete (${durationDisplay})`);
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = (message as any).usage ?? null;
          appendEvent(jsonlPath, {
            ts: getNow(), run_id: runId, agent: agentName,
            event: 'run_complete',
            input_tokens: usage?.input_tokens ?? null,
            output_tokens: usage?.output_tokens ?? null,
            duration_ms: duration,
            status: 'ok',
          });
        }
      }
      return;

    } catch (error) {
      if (isOverloadedError(error) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log(`[${agentName}] API overloaded. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'api_error', type: 'overloaded', attempt,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        log(`[${agentName}] encountered an error: ${String(error)}`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'run_complete',
          input_tokens: null, output_tokens: null,
          duration_ms: Date.now() - startTime,
          status: 'error',
        });
        return;
      }
    }
  }
```

**Key Changes**:
1. Initialize `ProgressState` with historical duration for ETA
2. Track `recentReasoning` for milestone detection context
3. Detect milestone transitions and log summarized progress
4. Only show verbose details if `ATOMO_VERBOSE=true`
5. Enhanced completion message with human-readable duration

---

### Phase 5: Enhanced Progress for Multi-Item Workflows

**Challenge**: Some agents process multiple items (e.g., Gatekeeper triages 10 issues). Current milestone detection doesn't show "5/10 issues complete".

**Solution**: Add optional item-level progress tracking via agent-specific context.

**File**: `src/runner.ts` (MODIFIED)

**Update `runAgent` signature** (line 34):
```typescript
export async function runAgent(
  agentName: string, 
  prompt: string, 
  options: Options,
  itemCount?: number // Optional: total items to process
) {
```

**Update progress message formatting** (in `formatProgressMessage`):
```typescript
function formatProgressMessage(
  milestone: MilestoneType,
  toolCallCount: number,
  progressState: ProgressState,
  itemCount?: number,
  currentItem?: number
): string {
  const def = MILESTONE_DEFINITIONS[milestone];
  const elapsed = Date.now() - progressState.startTime;
  
  let msg = `${def.emoji} ${def.verb}...`;
  
  // Add item progress if available
  if (itemCount && currentItem) {
    msg += ` (${currentItem}/${itemCount})`;
  }
  
  // Add ETA if available
  if (progressState.estimatedDuration && elapsed < progressState.estimatedDuration) {
    const remaining = progressState.estimatedDuration - elapsed;
    const remainingSec = Math.floor(remaining / 1000);
    const remainingMin = Math.floor(remainingSec / 60);
    
    if (remainingMin > 0) {
      msg += ` ⏱️  ~${remainingMin}m remaining`;
    } else if (remainingSec > 10) {
      msg += ` ⏱️  ~${remainingSec}s remaining`;
    }
  }
  
  return msg;
}
```

**Agent Integration Example** (in `src/triage.ts`):

```typescript
// Before
await runAgent('Gatekeeper', SYSTEM_PROMPT, { model, systemPrompt: [] });

// After (with item count)
const untriaged = await ghTarget('issue list --search "is:open -label:triaged" --limit 10 --json number');
const itemCount = Array.isArray(untriaged) ? untriaged.length : undefined;

await runAgent('Gatekeeper', SYSTEM_PROMPT, { model, systemPrompt: [] }, itemCount);
```

**Note**: This is an OPTIONAL enhancement. Phase 1-4 work without it. Can be added incrementally.

---

## Acceptance Criteria Mapping

| Criterion | Implementation | Phase |
|-----------|---------------|-------|
| Agents log progress milestones during execution | `detectMilestone()` + `formatProgressMessage()` | 3, 4 |
| Key events printed to console in real-time | Milestone transitions logged in streaming loop | 4 |
| Summary shown at end with duration | `✅ [Agent] Complete (4m 32s)` | 4 |
| Enhanced version shows ETA | `loadHistoricalDuration()` + ETA in `formatProgressMessage()` | 2, 3 |
| `ATOMO_VERBOSE=true` enables detailed progress | `isVerboseMode()` check in streaming loop | 3, 4 |
| Progress output is non-blocking | Synchronous string formatting (no I/O in hot path) | All |

---

## Edge Cases & Considerations

### 1. No Historical Data (First Run)
**Scenario**: Fresh install, no prior JSONL logs exist  
**Behavior**: ETA not shown (gracefully degrade)  
**Implementation**: `loadHistoricalDuration()` returns `null`, `estimatedDuration` is `undefined`

### 2. Ambiguous Tool Calls
**Scenario**: `Bash` command could be scanning OR testing (e.g., `gh issue list` vs `npm test`)  
**Mitigation**: Use `recentReasoning` context to disambiguate via pattern matching

### 3. Rapidly Changing Milestones
**Scenario**: Agent switches between reading/analyzing every 2 seconds (noisy output)  
**Mitigation**: Only log milestone transitions (not every tool call in same milestone)  
**Already Implemented**: Line "if (milestone && milestone !== progressState.currentMilestone)"

### 4. Verbose Mode Performance
**Scenario**: `ATOMO_VERBOSE=true` with 500-char reasoning blocks → console spam  
**Mitigation**: No change to current behavior (user explicitly opts in to verbosity)  
**Future Enhancement**: Add `ATOMO_VERBOSE=2` for extra detail (tool inputs/outputs)

### 5. Multi-Agent Runs
**Scenario**: `npm run plan` calls both Review and Planning agents  
**Behavior**: Each agent gets separate progress tracking (isolated `ProgressState`)  
**Already Handled**: `runAgent()` creates new state per invocation

---

## Testing Strategy

### Unit Tests (New File: `src/__tests__/runner.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { MILESTONE_DEFINITIONS } from '../types.js';

describe('Milestone Detection', () => {
  it('should detect scanning milestone from gh issue list', () => {
    const pattern = MILESTONE_DEFINITIONS.scanning.pattern;
    expect(pattern('Bash', 'gh issue list --search "is:open -label:triaged"')).toBe(true);
  });

  it('should detect reading milestone from Read tool', () => {
    const pattern = MILESTONE_DEFINITIONS.reading.pattern;
    expect(pattern('Read', 'reading protocols/triage.md')).toBe(true);
  });

  it('should detect analyzing milestone from Grep', () => {
    const pattern = MILESTONE_DEFINITIONS.analyzing.pattern;
    expect(pattern('Grep', 'searching for error handling patterns')).toBe(true);
  });

  it('should detect writing milestone from Write tool', () => {
    const pattern = MILESTONE_DEFINITIONS.writing.pattern;
    expect(pattern('Write', 'creating TECH_SPEC_68.md')).toBe(true);
  });

  it('should NOT detect scanning for non-issue Bash commands', () => {
    const pattern = MILESTONE_DEFINITIONS.scanning.pattern;
    expect(pattern('Bash', 'npm test')).toBe(false);
  });
});

describe('Historical Duration Loading', () => {
  // Mock test - would need to create test JSONL files
  it('should return null if no historical data exists', () => {
    // Test loadHistoricalDuration() with empty logs directory
  });

  it('should calculate median duration from JSONL events', () => {
    // Test loadHistoricalDuration() with mock JSONL data
  });
});
```

**Note**: Requires adding `vitest` to `package.json` (currently shows "no test specified")

### Integration Tests (Manual)

**Test 1: First Run (No Historical Data)**
```bash
# Clear logs
rm -rf logs/events/*.jsonl

# Run agent
npm run triage

# Expected: No ETA shown (graceful degradation)
```

**Test 2: Verbose Mode**
```bash
ATOMO_VERBOSE=true npm run plan

# Expected: Full reasoning blocks + milestone summaries
```

**Test 3: Normal Mode (Summary Only)**
```bash
npm run plan

# Expected: Milestone transitions only (🔍 Scanning... → 📖 Reading... → ✍️ Writing...)
```

**Test 4: Multi-Item Progress**
```bash
# Requires modifying Gatekeeper to pass itemCount (Phase 5)
npm run triage

# Expected: Progress counter (e.g., "🔍 Scanning... (3/10)")
```

---

## Rollout Plan

### Phase 1: Foundation (Types & Milestone Detection)
- Create `src/types.ts` with milestone definitions
- Add unit tests for milestone pattern matching
- **Estimated Time**: 30 minutes

### Phase 2: Historical Duration (ETA Infrastructure)
- Implement `loadHistoricalDuration()` in `src/runner.ts`
- Add tests for JSONL parsing logic
- **Estimated Time**: 30 minutes

### Phase 3: Progress State Management
- Add helper functions (`detectMilestone`, `formatProgressMessage`, `isVerboseMode`)
- **Estimated Time**: 20 minutes

### Phase 4: Streaming Loop Refactor
- Update `runAgent()` with progress tracking
- Test all 5 agents (triage, plan, dev, pm, review)
- **Estimated Time**: 45 minutes

### Phase 5 (OPTIONAL): Multi-Item Progress
- Update agent call sites to pass `itemCount`
- Enhance `formatProgressMessage()` with item counter
- **Estimated Time**: 20 minutes

**Total Estimated Effort**: 2.5 hours (MVP without Phase 5)

---

## Success Metrics

### Quantitative
- **Run Completion Rate**: Measure `run_complete` vs. `api_error` (expect >95% completion)
- **User Cancellations**: Track ratio of Ctrl+C interrupts (baseline via JSONL before/after)
- **Perceived Performance**: User surveys (target: 70% say "feels faster" even if duration unchanged)

### Qualitative
- **Support Burden**: Fewer "is it stuck?" GitHub issues (track issue labels)
- **User Confidence**: Positive feedback in community discussions (anecdotal)

### Technical
- **ETA Accuracy**: Compare estimated vs. actual duration (target: within ±20%)
- **Performance Impact**: Ensure progress logging adds <1% overhead (measure via JSONL duration_ms)

---

## Related Issues / Dependencies

- **Issue #59**: Agent Progress Indicators (Run #3 proposal) - this implements it
- **Issue #36**: Broad telemetry (complementary - this is UX-focused, #36 is data-focused)
- **SDK Version**: `@anthropic-ai/claude-agent-sdk@^0.2.112` (verified compatible)

---

## References

- SDK Streaming API: `query()` returns AsyncIterable<Message>
- Existing Implementation: `src/runner.ts:63-93` (message loop)
- JSONL Event Schema: `logs/events/*.jsonl` (run_start, tool_call, reasoning, run_complete)
- Pattern: Inspired by npm CLI progress indicators, git clone progress

---

## Non-Goals (Explicitly Out of Scope)

- **Graphical UI**: Console-only (no web dashboard)
- **Real-Time JSONL Tailing**: Not implementing `tail -f` viewer (focus on inline progress)
- **Agent Introspection**: Not exposing internal agent reasoning to users (privacy/complexity)
- **Cross-Platform Progress Bars**: No dependency on `cli-progress` or similar libraries (keep simple)
