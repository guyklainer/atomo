# TECH_SPEC_56: Cost Tracking Telemetry MVP

**Priority Score: 8.0** (I=4, C=4, E=2)

**Issue**: #56  
**Type**: Enhancement (Observability)  
**Category**: Core Logic - Competitive Moat  
**Labels**: triaged, enhancement, pm-proposal

---

## Executive Summary

Implement local cost tracking telemetry to make FLOW B deterministic pre-processing savings visible to users. Track LLM calls per agent run, calculate costs based on Claude Sonnet pricing, and display savings compared to naive "LLM for everything" approach. Store data locally in `~/.atomo/telemetry.json` (privacy-preserving), display summary after each run, and provide monthly insights via `npm run telemetry`.

**Competitive Moat**: Only autonomous agent tool showing cost savings from deterministic pre-processing.

---

## Root Cause / Requirements Analysis

### Current State (Problem)

**Observation**: FLOW B deterministic pre-processing (described in protocols/reevaluation.md, implemented in all agents) saves 60-80% of LLM costs by handling simple cases without AI calls. However:

1. **No visibility**: Users can't see the cost savings
2. **No perceived value**: "Saved you $X this month" message doesn't exist
3. **Competitive advantage is invisible**: Can't market this differentiator
4. **No trust signal**: No transparency into what's running and what it costs

**Market Context** (from issue):
- Cost transparency wins in 2026 (OpenAI/Anthropic price pressure)
- Users demand ROI visibility
- "Saved you $X" is powerful retention message

### FLOW B Pattern Analysis

**Deterministic Pre-Processing** (saves LLM calls):

1. **Gatekeeper (src/triage.ts)**:
   - `reEvaluateNeedsInfo()`: Checks for human replies without LLM (L45-92)
   - `hasUntriagedIssues()`: Filters before LLM invocation (L165-170)
   - **Saved calls**: Every issue that's already clarified or needs no triage

2. **Architect (src/planner.ts)**:
   - `handleReviews()`: Approval detection, feedback routing (deterministic)
   - **Saved calls**: Every review that's just label management

3. **Dev Agent (src/dev.ts)**:
   - `handlePRReviews()`: PR approval/changes detection (L43+)
   - **Saved calls**: Every PR review that's just status checking

4. **PM Agent (src/pm.ts)**:
   - Context file management (STEP 0)
   - **Saved calls**: File I/O doesn't require LLM

### Naive Baseline Calculation

**Naive Approach** (what competitors might do):
- Call LLM for every issue, every check, every operation
- No deterministic filtering
- Example: 10 issues to process → 10 LLM calls

**FLOW B Approach** (Atomo current):
- Deterministic pre-processing filters 60-80% of work
- Example: 10 issues → 2-4 LLM calls (6-8 saved)

**Cost Savings Formula**:
```
Saved Cost = (Total Operations - Actual LLM Calls) × Cost per Call
```

---

## Acceptance Criteria Mapping

| Criterion | Implementation | Status |
|-----------|---------------|--------|
| Track: Agent name, issue count, LLM calls, tokens, cost ($) | Telemetry module in runner.ts + agents | ✅ Planned |
| Display summary after each `npm run` command | Telemetry summary in agent exit | ✅ Planned |
| Privacy: Local storage only (no external telemetry) | ~/.atomo/telemetry.json (local filesystem) | ✅ Planned |
| Accurate cost calculation (Claude Sonnet pricing) | Hardcoded pricing with timestamp | ✅ Planned |
| Documentation: Cost savings section in README | Deferred (no README exists yet) | ⚠️ Deferred |

---

## Pattern Discovery

### Existing Patterns in Codebase

**1. Agent Execution Pattern** (src/runner.ts):
```typescript
export async function runAgent(agentName: string, prompt: string, options: Options) {
  const stream = query({ prompt, options });
  for await (const message of stream) {
    if (message.type === 'assistant') { /* LLM response */ }
    else if (message.type === 'result') { /* Pipeline complete */ }
  }
}
```

**Integration Point**: Wrap `runAgent()` with telemetry hooks (before/after)

**2. Deterministic Helper Pattern** (all agents):
```typescript
// Deterministic pre-processing (no LLM cost)
if (!hasUntriagedIssues()) {
  console.log('[Gatekeeper] No untriaged issues found. Skipping LLM invocation.');
  return; // Saved an LLM call!
}
```

**Tracking Strategy**: Count operations processed vs. LLM calls made

**3. Local File Storage Pattern** (pm_context/):
- PM agent already uses local context files
- **Reuse Strategy**: Similar pattern for ~/.atomo/telemetry.json

---

## Files Affected

### Modified Files

**1. `src/runner.ts`** (PRIMARY)
- Enhance `runAgent()` to track telemetry
- Capture: agent name, start time, token usage, cost
- Return telemetry data for caller to log

**2. `src/triage.ts`**
- Track: total issues processed (FLOW B + LLM)
- Log telemetry after execution

**3. `src/planner.ts`**
- Track: total issues reviewed, specs written
- Log telemetry after execution

**4. `src/dev.ts`**
- Track: total PRs reviewed, commits made
- Log telemetry after execution

**5. `src/pm.ts`**
- Track: total proposals evaluated
- Log telemetry after execution

### New Files

**6. `src/telemetry.ts`** (NEW - Telemetry Module)
- `logRun(data)`: Append run data to ~/.atomo/telemetry.json
- `calculateCost(tokens)`: Convert tokens to USD (Claude Sonnet pricing)
- `displaySummary(data)`: Pretty-print summary to console
- `getMonthlyStats()`: Aggregate data for monthly report

**7. `scripts/telemetry.ts`** (NEW - Monthly Report Script)
- Read ~/.atomo/telemetry.json
- Calculate monthly aggregates
- Display: total runs, cost, savings, breakdown by agent

**8. `package.json`**
- Add script: `"telemetry": "tsx scripts/telemetry.ts"`

---

## Implementation Blueprint

### Phase 1: Telemetry Module (`src/telemetry.ts`)

**File: `src/telemetry.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

const TELEMETRY_PATH = path.join(os.homedir(), '.atomo', 'telemetry.json');

// Claude Sonnet 4.5 Pricing (as of April 2026)
// Source: https://www.anthropic.com/api-pricing
const PRICING = {
  model: 'claude-sonnet-4.5',
  inputTokensPerMillion: 3.00,   // $3.00 per million input tokens
  outputTokensPerMillion: 15.00, // $15.00 per million output tokens
  lastUpdated: '2026-04-23'
};

export interface RunTelemetry {
  timestamp: string;
  agent: string;
  operationsProcessed: number; // Total items processed (FLOW B + LLM)
  llmCallsMade: number;         // Actual LLM invocations
  tokensInput: number;
  tokensOutput: number;
  costUSD: number;
  savedCallsEstimate: number;   // Operations that didn't need LLM
  savedCostUSD: number;
}

/**
 * Calculate cost based on token usage.
 */
export function calculateCost(tokensInput: number, tokensOutput: number): number {
  const inputCost = (tokensInput / 1_000_000) * PRICING.inputTokensPerMillion;
  const outputCost = (tokensOutput / 1_000_000) * PRICING.outputTokensPerMillion;
  return parseFloat((inputCost + outputCost).toFixed(4));
}

/**
 * Estimate saved cost (operations that didn't need LLM).
 * Assumes average call uses ~1000 input + 500 output tokens.
 */
export function calculateSavedCost(savedCalls: number): number {
  const avgInputTokens = 1000;
  const avgOutputTokens = 500;
  return calculateCost(avgInputTokens * savedCalls, avgOutputTokens * savedCalls);
}

/**
 * Log a run to telemetry file.
 */
export function logRun(data: RunTelemetry): void {
  // Ensure ~/.atomo directory exists
  const dir = path.dirname(TELEMETRY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing data or initialize
  let runs: RunTelemetry[] = [];
  if (fs.existsSync(TELEMETRY_PATH)) {
    const content = fs.readFileSync(TELEMETRY_PATH, 'utf-8');
    runs = content.trim() ? JSON.parse(content) : [];
  }

  // Append new run
  runs.push(data);

  // Retention: Keep last 100 runs (prevent unbounded growth)
  if (runs.length > 100) {
    runs = runs.slice(-100);
  }

  // Write back
  fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(runs, null, 2), 'utf-8');
}

/**
 * Display summary after a run.
 */
export function displaySummary(data: RunTelemetry): void {
  console.log('\n📊 Cost Tracking Summary');
  console.log('─'.repeat(60));
  console.log(`Agent: ${data.agent}`);
  console.log(`Operations Processed: ${data.operationsProcessed}`);
  console.log(`LLM Calls Made: ${data.llmCallsMade}`);
  console.log(`Saved Calls (FLOW B): ${data.savedCallsEstimate}`);
  console.log(`Cost: $${data.costUSD.toFixed(4)}`);
  console.log(`Saved: ~$${data.savedCostUSD.toFixed(4)} (from deterministic pre-processing)`);
  console.log(`Total Benefit: $${(data.costUSD + data.savedCostUSD).toFixed(4)} → $${data.costUSD.toFixed(4)}`);
  console.log('─'.repeat(60));
  console.log(`💾 Telemetry logged to: ${TELEMETRY_PATH}`);
}

/**
 * Get monthly statistics (for scripts/telemetry.ts).
 */
export function getMonthlyStats(): any {
  if (!fs.existsSync(TELEMETRY_PATH)) {
    return { totalRuns: 0, totalCost: 0, totalSaved: 0, breakdown: {} };
  }

  const runs: RunTelemetry[] = JSON.parse(fs.readFileSync(TELEMETRY_PATH, 'utf-8'));

  // Filter to current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyRuns = runs.filter(r => r.timestamp.startsWith(currentMonth));

  // Aggregate
  const breakdown: Record<string, { runs: number; cost: number; saved: number }> = {};
  let totalCost = 0;
  let totalSaved = 0;

  for (const run of monthlyRuns) {
    if (!breakdown[run.agent]) {
      breakdown[run.agent] = { runs: 0, cost: 0, saved: 0 };
    }
    breakdown[run.agent].runs++;
    breakdown[run.agent].cost += run.costUSD;
    breakdown[run.agent].saved += run.savedCostUSD;
    totalCost += run.costUSD;
    totalSaved += run.savedCostUSD;
  }

  return {
    month: currentMonth,
    totalRuns: monthlyRuns.length,
    totalCost: parseFloat(totalCost.toFixed(4)),
    totalSaved: parseFloat(totalSaved.toFixed(4)),
    breakdown
  };
}
```

**Rationale**:
- **Privacy-preserving**: Local storage only (~/.atomo/)
- **Cost accuracy**: Hardcoded Claude Sonnet pricing with timestamp for auditability
- **Saved cost estimation**: Conservative average (1000 input + 500 output tokens per call)
- **Retention**: Keep last 100 runs to prevent file bloat

---

### Phase 2: Enhance `src/runner.ts`

**Current Code** (src/runner.ts:3-25):
```typescript
export async function runAgent(agentName: string, prompt: string, options: Options) {
  console.log(`[${agentName}] Starting Pipeline...`);
  const stream = query({ prompt, options });
  // ... existing code
}
```

**Enhanced Code**:
```typescript
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

export interface AgentRunResult {
  tokensInput: number;
  tokensOutput: number;
}

export async function runAgent(
  agentName: string, 
  prompt: string, 
  options: Options
): Promise<AgentRunResult> {
  console.log(`[${agentName}] Starting Pipeline...`);

  const stream = query({ prompt, options });

  let tokensInput = 0;
  let tokensOutput = 0;

  try {
    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            console.log(`[Reasoning]: ${block.text}`);
          } else if (block.type === 'tool_use') {
            console.log(`[Tool Call]: Initiating ${block.name}...`);
          }
        }

        // Track token usage (if available in message)
        // NOTE: Claude Agent SDK may not expose usage directly
        // We'll need to estimate or check SDK response structure
        if (message.message.usage) {
          tokensInput += message.message.usage.input_tokens || 0;
          tokensOutput += message.message.usage.output_tokens || 0;
        }
      } else if (message.type === 'result') {
        console.log(`[${agentName}] Pipeline execution complete.`);
      }
    }
  } catch (error) {
    console.error(`[${agentName}] encountered an error:`, error);
  }

  return { tokensInput, tokensOutput };
}
```

**Rationale**:
- Return token usage to caller for telemetry logging
- Minimal changes to existing flow
- Graceful handling if SDK doesn't provide usage (falls back to 0)

**Edge Case - SDK Token Usage**:
If Claude Agent SDK doesn't expose `message.usage`, we have two options:
1. **Estimate**: Use average tokens per call (conservative)
2. **Patch SDK**: Intercept underlying Anthropic API response (complex)

**Decision**: Start with SDK `message.usage` check. If unavailable, estimate based on prompt length.

---

### Phase 3: Integrate Telemetry into Agents

**Example: `src/triage.ts` Integration**

**Current Main** (L176-193):
```typescript
(async () => {
  try {
    await reEvaluateNeedsInfo();
  } catch (error) {
    console.error('[pre-processing] Error during needs-info handling:', error);
  }

  if (!hasUntriagedIssues()) {
    console.log('[Gatekeeper] No untriaged issues found. Skipping LLM invocation.');
    return;
  }

  await runAgent('Gatekeeper', SYSTEM_PROMPT, {
    model: 'claude-haiku-4-5',
    tools: ['Bash'],
    allowedTools: ['Bash']
  });
})().catch(console.error);
```

**Enhanced with Telemetry**:
```typescript
import { logRun, displaySummary, calculateCost, calculateSavedCost } from './telemetry.js';

(async () => {
  let operationsProcessed = 0;
  let llmCallsMade = 0;

  // FLOW B: Deterministic pre-processing
  try {
    await reEvaluateNeedsInfo();
    // Count how many issues were re-evaluated (deterministic, no LLM)
    const needsInfoIssues: GitHubIssue[] = gh(
      'issue list --search "is:open label:needs-info" --limit 10 --json number'
    );
    operationsProcessed += needsInfoIssues?.length || 0;
  } catch (error) {
    console.error('[pre-processing] Error during needs-info handling:', error);
  }

  // Check if LLM is needed
  const hasIssues = hasUntriagedIssues();
  if (hasIssues) {
    operationsProcessed += 1; // One issue to triage
  }

  if (!hasIssues) {
    console.log('[Gatekeeper] No untriaged issues found. Skipping LLM invocation.');
    
    // Log telemetry even for skipped runs (shows FLOW B savings!)
    const telemetry = {
      timestamp: new Date().toISOString(),
      agent: 'Gatekeeper',
      operationsProcessed,
      llmCallsMade: 0,
      tokensInput: 0,
      tokensOutput: 0,
      costUSD: 0,
      savedCallsEstimate: operationsProcessed, // All operations avoided LLM
      savedCostUSD: calculateSavedCost(operationsProcessed)
    };
    logRun(telemetry);
    displaySummary(telemetry);
    return;
  }

  // LLM invocation
  llmCallsMade = 1;
  const result = await runAgent('Gatekeeper', SYSTEM_PROMPT, {
    model: 'claude-haiku-4-5',
    tools: ['Bash'],
    allowedTools: ['Bash']
  });

  // Log telemetry
  const costUSD = calculateCost(result.tokensInput, result.tokensOutput);
  const savedCalls = operationsProcessed - llmCallsMade;
  const savedCostUSD = calculateSavedCost(savedCalls);

  const telemetry = {
    timestamp: new Date().toISOString(),
    agent: 'Gatekeeper',
    operationsProcessed,
    llmCallsMade,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    costUSD,
    savedCallsEstimate: savedCalls,
    savedCostUSD
  };
  logRun(telemetry);
  displaySummary(telemetry);
})().catch(console.error);
```

**Apply Same Pattern to**:
- `src/planner.ts` (track: issues reviewed, LLM for planning)
- `src/dev.ts` (track: PRs reviewed, LLM for implementation)
- `src/pm.ts` (track: proposals generated, LLM for ideation)

---

### Phase 4: Monthly Summary Script

**New File: `scripts/telemetry.ts`**

```typescript
import 'dotenv/config';
import { getMonthlyStats } from '../src/telemetry.js';

(async () => {
  console.log('📊 Atomo Cost Tracking - Monthly Summary\n');

  const stats = getMonthlyStats();

  if (stats.totalRuns === 0) {
    console.log('No telemetry data for this month yet.');
    return;
  }

  console.log(`📅 Month: ${stats.month}`);
  console.log(`🔄 Total Runs: ${stats.totalRuns}`);
  console.log(`💰 Total Cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`💚 Total Saved (FLOW B): $${stats.totalSaved.toFixed(4)}`);
  console.log(`📈 Efficiency: ${((stats.totalSaved / (stats.totalCost + stats.totalSaved)) * 100).toFixed(1)}% saved\n`);

  console.log('Breakdown by Agent:');
  console.log('─'.repeat(70));
  console.log('Agent'.padEnd(20) + 'Runs'.padEnd(10) + 'Cost'.padEnd(15) + 'Saved'.padEnd(15));
  console.log('─'.repeat(70));

  for (const [agent, data] of Object.entries(stats.breakdown)) {
    console.log(
      agent.padEnd(20) +
      data.runs.toString().padEnd(10) +
      `$${data.cost.toFixed(4)}`.padEnd(15) +
      `$${data.saved.toFixed(4)}`.padEnd(15)
    );
  }

  console.log('─'.repeat(70));
  console.log('\n✨ Competitive Moat: Only autonomous agent tool showing cost savings!');
})().catch(console.error);
```

**Add to `package.json`**:
```json
"scripts": {
  "telemetry": "tsx scripts/telemetry.ts"
}
```

---

## Edge Cases & Considerations

### 1. Claude Agent SDK Token Usage Unavailable

**Risk**: SDK may not expose `message.usage` in stream  
**Mitigation**:
- Primary: Check SDK response structure (test in Phase 1)
- Fallback: Estimate tokens based on prompt length:
  ```typescript
  // Rough estimate: ~4 chars per token
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  const estimatedOutputTokens = 500; // Conservative average
  ```
- Document estimation methodology in telemetry output

### 2. Pricing Changes

**Risk**: Anthropic updates Claude pricing  
**Mitigation**:
- Hardcode pricing with `lastUpdated` timestamp in telemetry.ts
- Log pricing version in telemetry data
- Users can update `PRICING` constant manually
- Future enhancement: Fetch from Anthropic pricing API

### 3. Operations Count Accuracy

**Risk**: Overcounting/undercounting FLOW B operations  
**Mitigation**:
- Conservative approach: Only count items explicitly processed
- Document counting methodology in code comments
- Examples:
  - Triage: Count needs-info issues checked + untriaged issues
  - Planner: Count needs-review issues + new triaged issues
  - Dev: Count PRs checked

### 4. Privacy Concerns

**Risk**: Users worried about telemetry data  
**Mitigation**:
- Local storage only (~/.atomo/) - NEVER upload
- No external API calls
- Document privacy stance in telemetry display
- Consider opt-out flag in future (not MVP)

### 5. File Path Cross-Platform

**Risk**: `~/.atomo/` path may differ on Windows  
**Mitigation**:
- Use `os.homedir()` for cross-platform compatibility
- Already implemented in telemetry.ts

---

## Testing Strategy

### Unit Tests (Future Enhancement - Not MVP)
- Test `calculateCost()` with known token counts
- Test `calculateSavedCost()` with edge cases (0 saved calls)
- Test `logRun()` file creation and retention logic

### Integration Testing (Manual)

**Test 1: Zero LLM Calls (Pure FLOW B)**
```bash
# Setup: Ensure no untriaged issues exist
npm run triage
# Expected: operationsProcessed > 0, llmCallsMade = 0, savedCost > 0
```

**Test 2: Mixed (FLOW B + LLM)**
```bash
# Setup: Create 1 untriaged issue
npm run triage
# Expected: operationsProcessed = X, llmCallsMade = 1, savedCost = (X-1) * avg
```

**Test 3: Monthly Summary**
```bash
# After 3-5 runs
npm run telemetry
# Expected: Aggregated stats, breakdown by agent, efficiency percentage
```

**Test 4: File Retention**
```bash
# Create 101 telemetry entries (simulate)
# Expected: Only last 100 kept in ~/.atomo/telemetry.json
```

---

## Rollout Plan

### Phase 1: Core Telemetry Module (2 hours)
1. Implement `src/telemetry.ts` (logging, cost calculation, display)
2. Test locally with mock data
3. Verify ~/.atomo/ directory creation

### Phase 2: Runner Enhancement (1 hour)
1. Modify `src/runner.ts` to return token usage
2. Test with one agent (triage.ts)
3. Verify token tracking works (or falls back to estimation)

### Phase 3: Agent Integration (2 hours)
1. Integrate telemetry into all 4 agents:
   - src/triage.ts
   - src/planner.ts
   - src/dev.ts
   - src/pm.ts
2. Test each agent individually
3. Verify operationsProcessed counts are accurate

### Phase 4: Monthly Summary Script (1 hour)
1. Implement `scripts/telemetry.ts`
2. Add `npm run telemetry` to package.json
3. Test with accumulated data

### Phase 5: Documentation (Deferred)
- README update deferred (no README exists yet - see issue #60)
- Add inline code comments explaining telemetry logic

**Total Estimated Effort**: 6 hours

---

## Success Metrics

### Immediate (After First Run)
- ✅ Telemetry summary displayed at end of agent run
- ✅ ~/.atomo/telemetry.json created and populated
- ✅ Cost calculation matches manual verification

### Short-term (After 1 Week)
- 🎯 Monthly summary shows aggregated data across 10+ runs
- 🎯 Saved cost messaging resonates with users (qualitative feedback)
- 🎯iciency percentage consistently shows 60-80% savings (validates FLOW B value)

### Long-term (Marketing)
- 📢 Cost transparency becomes competitive differentiator
- 📢 "Saved you $X this month" becomes retention message
- 📢 Users share cost savings testimonials

---

## Related Issues / Dependencies

**Blocks**: None  
**Blocked By**: None  
**Related**:
- #36: Broader telemetry epic (this is MVP subset)
- #60: .env.example template (telemetry uses local storage, no env vars needed)

---

## References

- **Claude Agent SDK**: [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Claude Pricing** (April 2026): https://www.anthropic.com/api-pricing
  - Sonnet 4.5: $3/M input, $15/M output
- **Existing FLOW B Implementation**:
  - protocols/reevaluation.md
  - src/triage.ts:45-92 (reEvaluateNeedsInfo)
  - src/planner.ts:50+ (handleReviews)
  - src/dev.ts:43+ (handlePRReviews)

---

## Appendix: Token Usage Detection Strategy

**Primary Approach**: Check Claude Agent SDK message structure for `usage` field.

**Test Code** (to run during implementation):
```typescript
for await (const message of stream) {
  console.log('Message Type:', message.type);
  console.log('Full Message:', JSON.stringify(message, null, 2));
  // Check for usage field in assistant message
}
```

**Fallback Strategies** (if SDK doesn't expose usage):
1. **Prompt-based estimation**: `tokens ≈ chars / 4`
2. **SDK introspection**: Check if SDK has internal usage tracking
3. **Anthropic API direct call**: Bypass SDK for usage data (adds complexity)

**Decision Tree**:
- If `message.usage` exists → Use directly ✅
- If not → Estimate conservatively (document in display)
- Future: Consider PR to Claude Agent SDK for usage exposure

---
