# TECH_SPEC_79: User-Visible Cost Tracking & Savings Dashboard

**Priority Score: 10.0** (I=4, C=5, E=2)

**Issue**: #79  
**Type**: Enhancement (DX - Observability)  
**Category**: Competitive Moat - User-Facing Feature  
**Labels**: triaged, enhancement, pm-proposal

---

## Executive Summary

Build a standalone cost reporting script (`scripts/cost-report.ts`) that reads existing telemetry from `logs/events/*.jsonl`, calculates cost savings from FLOW B deterministic pre-processing, and displays a user-friendly dashboard. This makes Atomo's 60-80% cost savings **visible and provable** to users, enabling marketing screenshots and enterprise ROI justification.

**Key Differentiator**: Only autonomous agent tool showing transparent, local-only cost tracking with savings breakdown.

**Competitive Advantage**: 
- GitHub Copilot, Cursor, Sweep AI hide costs (no transparency)
- Atomo shows "saved you $X this month" (unique in market)
- Cost transparency wins in April 2026 (OpenAI/Anthropic price pressure)

---

## Root Cause / Requirements Analysis

### Current State (Problem)

**Infrastructure exists** (90% complete):
- ✅ Event logging: `logs/events/YYYY-MM-DD.jsonl` (implemented in Reviewer agent)
- ✅ Token tracking: `input_tokens`, `output_tokens` in `run_complete` events
- ✅ Aggregation functions: `readDeltaEvents()`, `aggregateByAgent()` in `src/reviewer.ts`

**Missing**: User-facing presentation layer
- ❌ Users can't answer: "How much did Atomo save me this month?"
- ❌ Marketing claim ("60-80% savings") lacks proof point
- ❌ No command to generate cost reports

**Technical Gap**: ~150 LOC script to transform existing telemetry into user-friendly dashboard

### Success Criteria (from issue)

1. ✅ Users can answer "how much saved?" in <5 seconds (`npm run cost-report`)
2. ✅ Marketing claim becomes provable (screenshot in README)
3. ✅ 80% of users who run cost report share results (viral growth signal)
4. ✅ Support questions about "cost savings" reduced (self-service)

---

## Pattern Discovery

### Existing Patterns in Codebase

**1. Event Schema** (`src/reviewer.ts` L15-28):
```typescript
export interface JsonlEvent {
  ts: string;
  run_id: string;
  agent: string;
  event: 'run_start' | 'tool_call' | 'reasoning' | 'api_error' | 'run_complete';
  tool?: string;
  chars?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  duration_ms?: number;
  status?: 'ok' | 'error';
}
```

**Key Fields for Cost Calculation**:
- `agent`: Agent name (Gatekeeper, Architect, Dev, PM)
- `input_tokens`, `output_tokens`: In `run_complete` events
- `ts`: Timestamp for date range filtering

**2. Aggregation Pattern** (`src/reviewer.ts` L85-134):
```typescript
export function aggregateByAgent(events: JsonlEvent[]): Record<string, AgentStats> {
  // Already sums totalInputTokens, totalOutputTokens by agent
  // Counts runs, tool calls, reasoning chars, API errors
}
```

**Reuse Strategy**: Call `readDeltaEvents()` and `aggregateByAgent()`, then add cost calculations

**3. Script Pattern** (`scripts/verify-events.ts`):
- Command-line args: `process.argv`
- Direct file reading from JSONL
- Error handling with `process.exit(1)`

**Consistency**: Follow same CLI arg pattern for `--json` flag and time ranges

**4. Pricing Constants** (from TECH_SPEC_56 L177-184):
```typescript
const PRICING = {
  model: 'claude-sonnet-4.5',
  inputTokensPerMillion: 3.00,   // $3.00 per 1M input tokens
  outputTokensPerMillion: 15.00, // $15.00 per 1M output tokens
  lastUpdated: '2026-04-26'
};
```

**Integration**: Copy pricing constants to `scripts/cost-report.ts`

---

## Files Affected

### New Files

**1. `scripts/cost-report.ts`** (NEW - ~150 LOC)
- Import `readDeltaEvents()`, `aggregateByAgent()` from `../src/reviewer.js`
- Add CLI arg parsing for `--json`, `--days=N` flags
- Add cost calculation functions
- Add table formatting (console output)
- Add JSON export mode

**2. `package.json`** (MODIFIED - 1 line)
- Add script: `"cost-report": "tsx scripts/cost-report.ts"`

### Modified Files (Imports Only)

**3. `src/reviewer.ts`** (NO CHANGES NEEDED)
- Already exports `readDeltaEvents()` and `aggregateByAgent()`
- Script imports these as ES modules

---

## Implementation Blueprint

### Phase 1: Core Script Structure

**File: `scripts/cost-report.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readDeltaEvents, aggregateByAgent } from '../src/reviewer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// Pricing Constants (Claude Sonnet 4.5)
// Source: https://www.anthropic.com/api-pricing
// ─────────────────────────────────────────────────────────────────
const PRICING = {
  model: 'claude-sonnet-4.5',
  inputPerMillion: 3.00,   // $3.00 per 1M input tokens
  outputPerMillion: 15.00, // $15.00 per 1M output tokens
  lastUpdated: '2026-04-26'
};

// ─────────────────────────────────────────────────────────────────
// Cost Calculation Functions
// ─────────────────────────────────────────────────────────────────

interface CostBreakdown {
  agent: string;
  runs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * PRICING.outputPerMillion;
  return parseFloat((inputCost + outputCost).toFixed(2));
}

function calculateNaiveCost(actualCost: number): number {
  // CLARIFICATION NEEDED: Placeholder uses 3x multiplier
  // Real implementation depends on answer to Question #2
  return actualCost * 3;
}

function buildCostReport(
  stats: Record<string, any>,
  sinceDate: Date
): CostBreakdown[] {
  return Object.values(stats).map((s: any) => ({
    agent: s.agentName,
    runs: s.runs,
    totalTokens: s.totalInputTokens + s.totalOutputTokens,
    inputTokens: s.totalInputTokens,
    outputTokens: s.totalOutputTokens,
    costUSD: calculateCost(s.totalInputTokens, s.totalOutputTokens),
  }));
}

// ─────────────────────────────────────────────────────────────────
// Display Functions
// ─────────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function displayTable(breakdown: CostBreakdown[], days: number): void {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║     Atomo Cost Report (Last ${days} Days)${' '.repeat(Math.max(0, 14 - days.toString().length))}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ Agent       │ Runs │ Tokens    │ Cost (Est.)     ║');
  console.log('║─────────────┼──────┼───────────┼─────────────────║');
  
  let totalRuns = 0;
  let totalTokens = 0;
  let totalCost = 0;
  
  breakdown.forEach(b => {
    const agent = b.agent.padEnd(11);
    const runs = b.runs.toString().padStart(4);
    const tokens = formatNumber(b.totalTokens).padStart(9);
    const cost = `$${b.costUSD.toFixed(2)}`.padStart(15);
    console.log(`║ ${agent} │ ${runs} │ ${tokens} │ ${cost} ║`);
    
    totalRuns += b.runs;
    totalTokens += b.totalTokens;
    totalCost += b.costUSD;
  });
  
  console.log('║─────────────┼──────┼───────────┼─────────────────║');
  const totalRunsStr = totalRuns.toString().padStart(4);
  const totalTokensStr = formatNumber(totalTokens).padStart(9);
  const totalCostStr = `$${totalCost.toFixed(2)}`.padStart(15);
  console.log(`║ TOTAL       │ ${totalRunsStr} │ ${totalTokensStr} │ ${totalCostStr} ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  
  const naiveCost = calculateNaiveCost(totalCost);
  const saved = naiveCost - totalCost;
  const pctSaved = ((saved / naiveCost) * 100).toFixed(0);
  
  console.log('║ FLOW B Savings (Deterministic Pre-Processing):   ║');
  console.log(`║   Naive approach: ~$${naiveCost.toFixed(2)}${' '.repeat(Math.max(0, 27 - naiveCost.toFixed(2).length))}║`);
  console.log(`║   Actual cost:     $${totalCost.toFixed(2)}${' '.repeat(Math.max(0, 27 - totalCost.toFixed(2).length))}║`);
  console.log(`║   YOU SAVED:       $${saved.toFixed(2)} (${pctSaved}%)${' '.repeat(Math.max(0, 19 - saved.toFixed(2).length - pctSaved.length))}║`);
  console.log('╚══════════════════════════════════════════════════╝');
}

function displayJSON(breakdown: CostBreakdown[], days: number): void {
  const totalCost = breakdown.reduce((sum, b) => sum + b.costUSD, 0);
  const naiveCost = calculateNaiveCost(totalCost);
  const saved = naiveCost - totalCost;
  
  const report = {
    period: `last_${days}_days`,
    timestamp: new Date().toISOString(),
    pricing: PRICING,
    breakdown,
    totals: {
      runs: breakdown.reduce((sum, b) => sum + b.runs, 0),
      tokens: breakdown.reduce((sum, b) => sum + b.totalTokens, 0),
      costUSD: totalCost,
    },
    savings: {
      naiveEstimateUSD: naiveCost,
      actualCostUSD: totalCost,
      savedUSD: saved,
      percentageSaved: ((saved / naiveCost) * 100).toFixed(1),
    },
  };
  
  console.log(JSON.stringify(report, null, 2));
}

// ─────────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────────

function parseArgs(): { days: number; json: boolean } {
  const args = process.argv.slice(2);
  let days = 30; // default: 30 days
  let json = false;
  
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('--days=')) {
      const val = parseInt(arg.split('=')[1] || '30', 10);
      if (!isNaN(val) && val > 0) {
        days = val;
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run cost-report [options]');
      console.log('');
      console.log('Options:');
      console.log('  --days=N      Show last N days (default: 30)');
      console.log('  --json        Output as JSON instead of table');
      console.log('  --help, -h    Show this help message');
      console.log('');
      console.log('Examples:');
      console.log('  npm run cost-report');
      console.log('  npm run cost-report -- --days=7');
      console.log('  npm run cost-report -- --json');
      process.exit(0);
    }
  }
  
  return { days, json };
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

(async () => {
  const { days, json } = parseArgs();
  
  // CLARIFICATION NEEDED: Issue says .atomo/events but code uses logs/events
  // Using logs/events to match existing implementation
  const eventsDir = path.join(repoRoot, 'logs', 'events');
  
  if (!fs.existsSync(eventsDir)) {
    if (json) {
      console.log(JSON.stringify({ error: 'No event data found', eventsDir }, null, 2));
    } else {
      console.log(`⚠️  No event data found at ${eventsDir}`);
      console.log('   Run an agent first (npm run triage, plan, dev, or pm) to generate telemetry.');
    }
    process.exit(0);
  }
  
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  
  const events = readDeltaEvents(eventsDir, sinceDate.toISOString());
  
  if (events.length === 0) {
    if (json) {
      console.log(JSON.stringify({ error: 'No events in time range', days }, null, 2));
    } else {
      console.log(`⚠️  No events found in the last ${days} days.`);
    }
    process.exit(0);
  }
  
  const stats = aggregateByAgent(events);
  const breakdown = buildCostReport(stats, sinceDate);
  
  if (json) {
    displayJSON(breakdown, days);
  } else {
    displayTable(breakdown, days);
  }
})();
```

### Phase 2: Package.json Integration

**File: `package.json`** (Add to `scripts` section)

```json
{
  "scripts": {
    "cost-report": "tsx scripts/cost-report.ts"
  }
}
```

---

## Testing Strategy

### Manual Testing Checklist

**1. No Events Scenario**:
```bash
rm -rf logs/events  # Ensure clean state
npm run cost-report
# Expected: "No event data found" message
```

**2. With Events (7 days)**:
```bash
npm run cost-report -- --days=7
# Expected: Table with last 7 days of data
```

**3. JSON Export**:
```bash
npm run cost-report -- --json > cost-report.json
cat cost-report.json | jq '.savings.savedUSD'
# Expected: Valid JSON with savings breakdown
```

**4. Help Text**:
```bash
npm run cost-report -- --help
# Expected: Usage instructions
```

### Edge Cases to Handle

1. **Empty events directory**: Graceful message (no crash)
2. **Malformed JSONL lines**: Skip and continue (reuse pattern from `readDeltaEvents`)
3. **Zero tokens in events**: Display $0.00 cost
4. **Very large numbers**: Format with M/K suffixes (e.g., "9.6M")

---

## Integration with Issue #56

**Relationship**: Issue #56 (needs-review) proposes runtime telemetry hooks, this issue (#79) is post-hoc reporting.

**Coexistence Strategy**:
- #56: Stores to `~/.atomo/telemetry.json` (runtime logging)
- #79: Reads from `logs/events/*.jsonl` (existing event logs)

**Future Enhancement**: If #56 is implemented, this script could optionally read from `~/.atomo/telemetry.json` for richer data (e.g., "operations skipped" counts for more accurate naive cost estimation).

**No Conflicts**: Both can coexist independently.

---

## Acceptance Criteria Checklist

| # | Criterion | Implementation | Status |
|---|-----------|---------------|--------|
| 1 | Users can answer "how much saved?" in <5 seconds | `npm run cost-report` displays dashboard | ✅ Planned |
| 2 | Marketing claim becomes provable (screenshot) | Table output with savings breakdown | ✅ Planned |
| 3 | Privacy: Local storage only (no external telemetry) | Reads from local `logs/events/` | ✅ Planned |
| 4 | JSON export for external tools | `--json` flag outputs structured data | ✅ Planned |
| 5 | Time ranges: 7d, 30d, all time | `--days=N` flag (default: 30) | ✅ Planned |
| 6 | Accurate cost calculation (Claude Sonnet pricing) | Hardcoded $3/$15 per 1M tokens | ✅ Planned |
| 7 | Console table with box-drawing characters | Manual formatting with ╔║╠ chars | ⚠️ See Question #3 |

---

## Clarification Questions (Before Implementation)

**These 3 questions address the highest-ambiguity areas identified during planning:**

### 1. Event Storage Path
**Question**: Issue description mentions `.atomo/events/*.jsonl`, but existing code (`src/reviewer.ts` line 180) uses `logs/events/`. Should the script read from `logs/events/` to match current implementation, or is there a planned migration to `.atomo/events/`?

**Impact**: Changes event directory path in script  
**Current Assumption**: Using `logs/events/` (matches existing code)

### 2. Naive Cost Calculation Method
**Question**: The example shows "Naive approach: ~$520.00" vs "Actual: $156.60". How should this baseline be calculated?

**Options**:
- **Option A**: Multiply total runs by average LLM cost (as in TECH_SPEC_56: ~1000 input + 500 output tokens per call)
- **Option B**: Use a fixed multiplier (e.g., 3x actual cost, as in current placeholder)
- **Option C**: Track "operations skipped" via a new telemetry field (requires changes to agents)

**Impact**: Affects savings calculation accuracy  
**Current Assumption**: 3x multiplier (simplest, no agent changes needed)

### 3. Table Formatting Dependency
**Question**: The mockup uses box-drawing characters (╔║╠). Should the script:

**Options**:
- **Option A**: Add a dependency like `cli-table3` for rich formatting (adds 1 npm package)
- **Option B**: Use manual string padding with box-drawing characters (current implementation)
- **Option C**: Use native `console.table()` (different format, no box chars)

**Impact**: Affects dependencies and output aesthetics  
**Current Assumption**: Manual formatting (no new dependencies, matches mockup)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Events directory doesn't exist (new repo) | HIGH | LOW | Graceful error message + instructions |
| Token fields missing in old events | MEDIUM | LOW | Default to 0 if null/undefined |
| Naive cost estimate inaccurate | MEDIUM | MEDIUM | Clarify calculation method (Question #2) |
| Table formatting breaks on narrow terminals | LOW | LOW | Minimum width check or fallback to simple format |
| Pricing changes (Claude API update) | LOW | HIGH | Add comment with pricing source URL + last updated date |

---

## Deployment Checklist

- [ ] Create `scripts/cost-report.ts` with full implementation
- [ ] Add `"cost-report": "tsx scripts/cost-report.ts"` to `package.json`
- [ ] Test: No events scenario (empty/missing directory)
- [ ] Test: With events (7d, 30d)
- [ ] Test: JSON export (`--json` flag)
- [ ] Test: Help text (`--help` flag)
- [ ] Verify pricing constants match current Claude Sonnet rates
- [ ] Update README with cost-report usage (deferred to separate issue)

---

## Post-Implementation Verification

**Success Metrics**:
1. ✅ Command runs in <1 second
2. ✅ Output matches mockup format
3. ✅ JSON export is valid (can pipe to `jq`)
4. ✅ Savings percentage matches manual calculation
5. ✅ No crashes on edge cases (empty events, malformed JSON)

**User Acceptance Test**:
```bash
# After running agents for a few days:
npm run cost-report
# Expected: Table showing breakdown + savings message
# Expected: "YOU SAVED: $X.XX (Y%)" at bottom
```

---

**Estimated LOC**: ~150 (matches issue estimate)  
**Estimated Implementation Time**: 2-3 hours  
**Testing Time**: 1 hour  
**Total Effort**: 1 dev-day (E=2 in ICE score)

---

*Spec authored by: Atomo Architect Agent*  
*Generated: 2026-04-26*  
*Confidence Score: 95%*
