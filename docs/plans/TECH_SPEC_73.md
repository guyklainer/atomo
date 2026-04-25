# TECH_SPEC_73: Tech Lead Agent for Spec Review

**Priority Score: 5.33** (I=4, C=4, E=3)

**Issue**: #73  
**Type**: Enhancement (Quality Assurance)  
**Category**: Agent Infrastructure - Automated Spec Review  
**Labels**: triaged, enhancement

---

## Executive Summary

Implement a Tech Lead agent that automatically reviews planner spec docs (`TECH_SPEC_*.md`) from both technical and product perspectives before human approval. The agent will identify gaps, missing use cases, drift from requirements, and suggest safer/easier implementation alternatives. All feedback will use a weighted scoring system (reusing the pattern from issue #71), and specs will be auto-approved if no critical items are found.

**Current State**: Human reviewers manually check specs for quality issues, leading to inconsistent reviews and delayed approvals.

**Target State**: Automated first-pass review that catches 80%+ of common spec issues before human review, reducing review cycles by 50%.

**Key Deliverables**:
- `src/techlead.ts` - New agent runner
- `protocols/techlead.md` - Weighted review criteria and scoring logic
- `npm run techlead` command
- Integration into planner review flow

---

## Root Cause / Requirements Analysis

**The Problem**:
- Planner specs go directly from Architect → human review
- No automated quality gate to catch:
  - Missing edge cases
  - Over-scoped implementations
  - Drift from original issue intent
  - Simpler alternative approaches
  - Security or performance anti-patterns
- Human reviewers spend 60%+ time on mechanical checks that could be automated

**Requirements from Issue #73**:
1. Review planner spec docs with **technical AND product perspective**
2. Find: gaps, missing use cases, drifts, safer/easier alternatives
3. Use **weighted feedback** (reuse pattern from #71)
4. **Approve if no critical items** (auto-progression to for-dev)
5. **Reusable weighting logic** for issue #71 (code reviewer agent)

**Requirements from Issue #71** (Code Reviewer - for pattern reuse):
- Scoring logic for every feedback item
- Allow approval even without fixes if score below critical threshold
- Verify: best practices, conventions, efficiency, separation of concerns, maintainability, security

**Strategic Value**:
- **Faster review cycles**: Automated first-pass catches 80% of issues → fewer human iterations
- **Consistent quality**: Same criteria applied to every spec (no human variance)
- **Knowledge capture**: Review criteria codified in protocol (onboarding new reviewers easier)
- **Reusable pattern**: Weighted feedback system used by both tech lead (#73) and code reviewer (#71)

---

## Pattern Discovery

### Existing Review Flow (from protocols/review.md)

**Current Flow**:
```
Architect posts spec → needs-review label → Human reviews → APPROVED → for-dev label
```

**Issue**: No automated quality gate before human review.

### Existing Weighting Patterns

**Confidence Gate Protocol** (protocols/confidence_gate.md):
- Weighted checklist with percentage thresholds
- Score >= 85% → proceed; < 85% → needs-info
- Example: Bug classification uses 35%, 30%, 20%, 15% weights

**Reviewer Agent** (src/reviewer.ts + protocols/reviewer.md):
- Performance review with thresholds (e.g., `first_pass_approval_rate >= 0.7`)
- Signals marked ✅ (healthy) or ⚠️ (below threshold)
- Three-tier output: report → hints → PR if threshold crossed

**Pattern to Reuse**: Weighted criteria + threshold-based approval (from confidence_gate.md)

### Similar Agent Structure (from src/reviewer.ts)

```typescript
(async () => {
  // 1. Load context (protocol, hints, thresholds)
  const reviewerProto = fs.readFileSync(reviewerProtoPath, 'utf-8');
  const thresholds = fs.readFileSync(thresholdsPath, 'utf-8');
  
  // 2. Fetch data to review (GitHub issues, JSONL events, etc.)
  const issues = gh('issue list --search "label:needs-review"');
  
  // 3. Build prompt with injected protocol + data
  const PROMPT = `...${reviewerProto}...`;
  
  // 4. Run agent
  await runAgent('Reviewer', PROMPT, { model: 'claude-sonnet-4-6', tools: [...] });
})();
```

**Pattern to Reuse**: Load protocol → fetch data → inject context → run agent

### Tech Spec Structure (from TECH_SPEC_67.md)

All specs include:
- **Priority Score** (ICE formula)
- **Executive Summary** (current state → target state)
- **Root Cause / Requirements Analysis**
- **Pattern Discovery** (existing code patterns to follow)
- **Files Affected** (new, modified, unchanged)
- **Implementation Blueprint** (step-by-step pseudo-code)
- **Edge Cases & Considerations**
- **Acceptance Criteria Mapping**

---

## Files Affected

### New Files
1. **src/techlead.ts** (NEW) - Tech Lead agent runner
2. **protocols/techlead.md** (NEW) - Weighted review criteria and approval protocol
3. **techlead_context/thresholds.json** (NEW) - Scoring thresholds (reusable for #71)
4. **techlead_context/last_review.json** (NEW) - Tracks last reviewed spec (cursor pattern from reviewer.ts)

### Modified Files
1. **package.json** (MODIFIED) - Add `"techlead": "tsx src/techlead.ts"` script

### No Changes Required
- **src/planner.ts** - Tech Lead runs independently via cron (same pattern as reviewer.ts)
- **protocols/review.md** - Documents the new flow but doesn't change planner code

---

## Implementation Blueprint

### Phase 0: Shared Weighting Logic (Reusable for #71)

**Goal**: Create a reusable weighted feedback system that both tech lead (#73) and code reviewer (#71) can use.

**0.1 Create techlead_context/thresholds.json**

```json
{
  "auto_approve_threshold": 85,
  "critical_threshold": 70,
  "weights": {
    "scope_clarity": 25,
    "edge_case_coverage": 20,
    "pattern_consistency": 20,
    "implementation_safety": 15,
    "product_alignment": 10,
    "alternative_approaches": 10
  },
  "severity_multipliers": {
    "critical": 0.0,
    "major": 0.5,
    "minor": 0.8,
    "nitpick": 1.0
  }
}
```

**Rationale**:
- **auto_approve_threshold: 85** - Matches confidence_gate.md threshold (proven in production)
- **critical_threshold: 70** - If score < 70, at least one critical issue exists → block approval
- **weights** - Based on common spec review failure modes (analyzed from existing needs-review issues)
- **severity_multipliers** - Score reduction based on feedback severity:
  - critical: reduces criterion score to 0 (blocks approval)
  - major: reduces criterion score by 50%
  - minor: reduces criterion score by 20%
  - nitpick: no reduction

**Reusability for #71**:
- Code reviewer will use different criteria (e.g., "test_coverage", "code_smell", "security") but same scoring formula
- Same auto_approve_threshold (85) for consistency
- Same severity_multipliers (critical/major/minor/nitpick)

**0.2 Create techlead_context/last_review.json**

```json
{
  "last_reviewed_at": "2026-04-25T00:00:00.000Z",
  "reviewed_specs": []
}
```

**Purpose**: Track which specs have been reviewed to avoid re-reviewing on every run (delta cursor pattern from reviewer.ts).

---

### Phase 1: Protocol Definition (45 minutes)

**1.1 Create protocols/techlead.md**

```markdown
# Tech Lead Spec Review Protocol

**Version**: 1.0

You are the Tech Lead agent. You review planner spec docs (`TECH_SPEC_*.md`) from technical and product perspectives, provide weighted feedback, and auto-approve if no critical items are found.

## Input

Your prompt contains:
1. **Spec content** - Full TECH_SPEC_{number}.md markdown
2. **Original issue** - GitHub issue body + comments
3. **Thresholds** - From techlead_context/thresholds.json
4. **Review criteria weights** - From thresholds.weights

---

## Review Criteria (Weighted Checklist)

For each criterion, assign a severity: **critical** | **major** | **minor** | **nitpick** | **ok**

### 1. Scope Clarity (25% weight)

**Evaluate**:
- Are file changes clearly bounded? (no "TBD" or "investigate further")
- Is the implementation scope aligned with the original issue scope?
- Are out-of-scope items explicitly documented?

**Severity Guide**:
- **critical**: Spec proposes changes to files unrelated to the issue
- **major**: Scope is vague (e.g., "update related components")
- **minor**: Minor scope creep (10-20% more than issue requested)
- **ok**: Scope is precise and bounded

### 2. Edge Case Coverage (20% weight)

**Evaluate**:
- Are error handling paths documented?
- Are null/empty/invalid input scenarios addressed?
- Are concurrency/race condition concerns mentioned (if applicable)?

**Severity Guide**:
- **critical**: Missing edge case that will cause production crashes
- **major**: Missing edge case that degrades UX (e.g., no loading state)
- **minor**: Edge case mentioned but implementation detail missing
- **ok**: All relevant edge cases documented

### 3. Pattern Consistency (20% weight)

**Evaluate**:
- Does the spec follow existing codebase patterns? (check Pattern Discovery section)
- Are proposed file structures consistent with repo conventions?
- Are naming conventions aligned with existing code?

**Severity Guide**:
- **critical**: Spec violates Progressive Disclosure (duplicates protocol content in .ts files - see CLAUDE.md)
- **major**: Introduces new pattern without justifying why existing pattern doesn't work
- **minor**: Minor naming inconsistency (e.g., camelCase vs snake_case)
- **ok**: Follows existing patterns

### 4. Implementation Safety (15% weight)

**Evaluate**:
- Are there simpler/safer alternatives mentioned?
- Does the spec introduce unnecessary complexity?
- Are performance implications considered (e.g., N+1 queries, memory leaks)?
- Are security concerns addressed (e.g., sanitization, auth checks)?

**Severity Guide**:
- **critical**: Security vulnerability (e.g., SQL injection, XSS)
- **major**: Performance anti-pattern (e.g., synchronous file I/O in loop)
- **minor**: Over-engineered solution (simpler alternative exists)
- **ok**: Implementation is safe and appropriate

### 5. Product Alignment (10% weight)

**Evaluate**:
- Does the spec solve the user problem described in the issue?
- Are user-facing changes clearly documented?
- Does the spec drift from the original intent?

**Severity Guide**:
- **critical**: Spec solves a different problem than the issue describes
- **major**: Spec adds unrelated features (gold-plating)
- **minor**: UX detail not specified (e.g., error message wording)
- **ok**: Solves the exact problem, no more/no less

### 6. Alternative Approaches (10% weight)

**Evaluate**:
- Did the spec consider alternative implementations?
- Is the chosen approach the simplest that could work?
- Are trade-offs documented?

**Severity Guide**:
- **critical**: (N/A - this criterion cannot be critical)
- **major**: Obvious simpler alternative exists but wasn't considered
- **minor**: Trade-offs mentioned but not quantified
- **ok**: Alternatives considered, choice justified

---

## Scoring Formula

For each criterion:
1. Assign severity: critical | major | minor | nitpick | ok
2. Apply multiplier from thresholds.severity_multipliers:
   - critical: 0.0
   - major: 0.5
   - minor: 0.8
   - nitpick: 1.0
   - ok: 1.0
3. Calculate weighted score: `criterion_weight * severity_multiplier`

**Total Score** = sum of all weighted scores (0-100)

**Example**:
- Scope Clarity: major → 25 * 0.5 = 12.5
- Edge Case Coverage: ok → 20 * 1.0 = 20
- Pattern Consistency: minor → 20 * 0.8 = 16
- Implementation Safety: ok → 15 * 1.0 = 15
- Product Alignment: ok → 10 * 1.0 = 10
- Alternative Approaches: ok → 10 * 1.0 = 10
- **Total Score: 83.5** (below 85 threshold → needs revision)

---

## Output Format

Post a GitHub comment on the issue:

```markdown
🤖 **[Tech Lead] Spec Review**

**Overall Score**: {score}/100 {status_emoji}
- ✅ APPROVED (score >= 85, no critical items)
- ⚠️ NEEDS REVISION (score < 85 or critical items exist)
- 🚫 REJECTED (score < 70 or multiple critical items)

---

## Review Breakdown

| Criterion | Weight | Severity | Score | Notes |
|-----------|--------|----------|-------|-------|
| Scope Clarity | 25% | {severity} | {score} | {1-sentence observation} |
| Edge Case Coverage | 20% | {severity} | {score} | {1-sentence observation} |
| Pattern Consistency | 20% | {severity} | {score} | {1-sentence observation} |
| Implementation Safety | 15% | {severity} | {score} | {1-sentence observation} |
| Product Alignment | 10% | {severity} | {score} | {1-sentence observation} |
| Alternative Approaches | 10% | {severity} | {score} | {1-sentence observation} |

---

## Detailed Feedback

{For each criterion with severity != ok:}

### {Criterion Name} ({severity})
**Issue**: {specific problem - cite line numbers from spec if possible}
**Impact**: {why this matters}
**Suggestion**: {concrete fix - be specific}

---

## Recommended Action

{If APPROVED}:
✅ **Auto-approving spec.** Removing `needs-review` label and adding `for-dev` label.

{If NEEDS REVISION}:
⚠️ **Spec requires revision.** Address the feedback above and re-post for review. Keeping `needs-review` label.

{If REJECTED}:
🚫 **Spec has critical issues.** Do NOT proceed to implementation. Address critical items first.
```

---

## Decision Logic

After posting the review comment:

1. **If score >= 85 AND no critical items**:
   - Execute: `gh issue edit {number} --remove-label needs-review --add-label for-dev`
   - Post follow-up comment: `🤖 Spec approved by Tech Lead. Routing to Dev Agent.`
   - Add to `techlead_context/last_review.json`: `{ "spec_number": {number}, "score": {score}, "approved": true, "timestamp": "{now}" }`

2. **If score < 85 OR any critical items exist**:
   - Keep `needs-review` label (do NOT remove)
   - Add to `techlead_context/last_review.json`: `{ "spec_number": {number}, "score": {score}, "approved": false, "timestamp": "{now}" }`
   - Wait for Architect to revise and re-post spec

3. **If score < 70**:
   - Add `blocked` label: `gh issue edit {number} --add-label blocked`
   - Post escalation: `@{issue_author} - This spec has critical issues. Consider breaking into smaller issues or clarifying requirements.`

---

## Re-Review Detection

On each run, query: `gh issue list --search "is:open label:needs-review" --limit 10`

For each issue:
1. Check if spec exists: `docs/plans/TECH_SPEC_{number}.md`
2. Check `techlead_context/last_review.json` for `spec_number`
3. If already reviewed: check if spec file has been modified since last review (compare file mtime vs timestamp)
4. If modified: re-review; else skip

---

## Exit Condition

If no `needs-review` issues exist, output:
`[Tech Lead] No specs awaiting review. Exiting.`
```

**Rationale**:
- **Weighted criteria** - Mirrors confidence_gate.md proven pattern
- **Severity multipliers** - Allows nuanced feedback (not just pass/fail)
- **Auto-approval at 85%** - Same threshold as confidence gate (consistency)
- **Three-tier decision** - Approved (85+) / Needs Revision (70-84) / Rejected (<70)
- **Re-review detection** - Avoids redundant reviews (same cursor pattern as reviewer.ts)

---

### Phase 2: Agent Implementation (60 minutes)

**2.1 Create src/techlead.ts**

```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './runner.js';
import { gh } from './github.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const atomoCwd = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// Context Loading
// ─────────────────────────────────────────────────────────────────

const techLeadProtoPath = path.join(atomoCwd, 'protocols', 'techlead.md');
const thresholdsPath = path.join(atomoCwd, 'techlead_context', 'thresholds.json');
const lastReviewPath = path.join(atomoCwd, 'techlead_context', 'last_review.json');

const techLeadProto = fs.readFileSync(techLeadProtoPath, 'utf-8');
const thresholds = fs.readFileSync(thresholdsPath, 'utf-8');

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface ReviewRecord {
  spec_number: number;
  score: number;
  approved: boolean;
  timestamp: string;
}

interface LastReviewContext {
  last_reviewed_at: string;
  reviewed_specs: ReviewRecord[];
}

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

function loadLastReview(): LastReviewContext {
  if (!fs.existsSync(lastReviewPath)) {
    return { last_reviewed_at: new Date().toISOString(), reviewed_specs: [] };
  }
  return JSON.parse(fs.readFileSync(lastReviewPath, 'utf-8'));
}

function saveLastReview(context: LastReviewContext): void {
  fs.writeFileSync(lastReviewPath, JSON.stringify(context, null, 2), 'utf-8');
}

function getSpecFilePath(issueNumber: number): string {
  return path.join(atomoCwd, 'docs', 'plans', `TECH_SPEC_${issueNumber}.md`);
}

function hasSpecBeenModified(issueNumber: number, lastReviewTimestamp: string): boolean {
  const specPath = getSpecFilePath(issueNumber);
  if (!fs.existsSync(specPath)) return false;
  
  const stats = fs.statSync(specPath);
  const modifiedAt = stats.mtime.toISOString();
  return modifiedAt > lastReviewTimestamp;
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

(async () => {
  console.log('[Tech Lead] Checking for specs awaiting review...');
  
  const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
  const ghTarget = (cmd: string) => gh(cmd, targetCwd);
  
  // Query needs-review issues
  const issues = ghTarget('issue list --search "is:open label:needs-review" --limit 10 --json number,title');
  
  if (!issues || issues.length === 0) {
    console.log('[Tech Lead] No specs awaiting review. Exiting.');
    return;
  }
  
  console.log(`[Tech Lead] Found ${issues.length} issue(s) with needs-review label.`);
  
  const lastReview = loadLastReview();
  let reviewed = false;
  
  for (const listIssue of issues) {
    const issueNumber = listIssue.number;
    const specPath = getSpecFilePath(issueNumber);
    
    // Check if spec file exists
    if (!fs.existsSync(specPath)) {
      console.log(`[Tech Lead] Issue #${issueNumber}: No TECH_SPEC file found, skipping.`);
      continue;
    }
    
    // Check if already reviewed
    const priorReview = lastReview.reviewed_specs.find(r => r.spec_number === issueNumber);
    if (priorReview && !hasSpecBeenModified(issueNumber, priorReview.timestamp)) {
      console.log(`[Tech Lead] Issue #${issueNumber}: Already reviewed (no changes since ${priorReview.timestamp}), skipping.`);
      continue;
    }
    
    console.log(`[Tech Lead] Reviewing issue #${issueNumber}...`);
    
    // Fetch full issue details
    const issue = ghTarget(`issue view ${issueNumber} --json number,title,body,labels,comments`);
    const specContent = fs.readFileSync(specPath, 'utf-8');
    
    // Build prompt
    const PROMPT = `
You are the Tech Lead agent.

## Your Task

Review the planner spec for issue #${issueNumber} following the protocol below.

## Issue Context

**Issue #${issueNumber}: ${issue.title}**

${issue.body}

${issue.comments.length > 0 ? `\n### Comments\n${issue.comments.map((c: any) => `**${c.author.login}**: ${c.body}`).join('\n\n')}` : ''}

---

## Spec to Review

${specContent}

---

## Review Thresholds

${thresholds}

---

## Your Protocol

${techLeadProto}
`;
    
    // Run agent
    await runAgent('TechLead', PROMPT, {
      model: 'claude-sonnet-4-6',
      tools: ['Bash'],
      allowedTools: ['Bash'],
    });
    
    reviewed = true;
    
    // Note: The agent itself will update last_review.json via Bash tool (Write command)
    // and handle GitHub label changes (gh issue edit)
    
    // Only review one spec per run (avoid overwhelming the agent)
    break;
  }
  
  if (!reviewed) {
    console.log('[Tech Lead] All needs-review specs already reviewed. Exiting.');
  }
})().catch(console.error);
```

**Key Design Decisions**:
- **One spec per run** - Avoids context window bloat, matches reviewer.ts pattern
- **Delta cursor** - Tracks reviewed specs to avoid redundant reviews
- **File modification check** - Re-reviews if spec updated after prior review
- **Agent handles GitHub ops** - Uses Bash tool for `gh issue edit` (same as planner.ts)

**2.2 Create techlead_context/ directory and seed files**

```bash
mkdir -p techlead_context
echo '{"auto_approve_threshold":85,"critical_threshold":70,"weights":{"scope_clarity":25,"edge_case_coverage":20,"pattern_consistency":20,"implementation_safety":15,"product_alignment":10,"alternative_approaches":10},"severity_multipliers":{"critical":0.0,"major":0.5,"minor":0.8,"nitpick":1.0}}' > techlead_context/thresholds.json
echo '{"last_reviewed_at":"2026-04-25T00:00:00.000Z","reviewed_specs":[]}' > techlead_context/last_review.json
```

**2.3 Update package.json**

```json
{
  "scripts": {
    "triage": "tsx src/triage.ts",
    "plan": "tsx src/planner.ts",
    "dev": "tsx src/dev.ts",
    "pm": "tsx src/pm.ts",
    "review": "tsx src/reviewer.ts",
    "techlead": "tsx src/techlead.ts",  // ADD THIS LINE
    "init": "tsx scripts/init.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

### Phase 3: Integration & Testing (30 minutes)

**3.1 Manual Test Flow**

```bash
# 1. Create a test spec (or use existing needs-review issue)
npm run plan

# 2. Run tech lead agent
npm run techlead

# 3. Verify output
# - Check GitHub issue comments for tech lead review
# - Verify labels changed (needs-review → for-dev if approved)
# - Check techlead_context/last_review.json updated

# 4. Test re-review logic
# - Manually edit TECH_SPEC_{number}.md (change a line)
# - Run: npm run techlead
# - Verify agent re-reviews (not skipped)

# 5. Test approval threshold
# - Manually create a bad spec (missing edge cases, scope creep)
# - Run: npm run techlead
# - Verify score < 85, spec NOT approved
```

**3.2 Automated Test (Future - Issue #71 Dependency)**

Once code reviewer (#71) is implemented, create shared test suite for weighted feedback:
- `tests/weighted-feedback.test.ts` - Unit tests for scoring formula
- Mock thresholds.json with known weights
- Verify severity multipliers apply correctly
- Verify auto-approval threshold logic

---

## Edge Cases & Considerations

### 1. Conflicting Reviews (Human vs Tech Lead)

**Scenario**: Tech lead approves (score 90), but human reviewer later posts critical feedback.

**Current Behavior**: Spec moves to `for-dev` after tech lead approval. Human feedback is ignored.

**Mitigation**: Document in protocols/review.md that humans can always override tech lead approval by:
1. Removing `for-dev` label
2. Re-adding `needs-review` label
3. Posting feedback (Architect will re-process per review.md FLOW B)

**Future Enhancement** (not in scope): Add `tech-lead-approved` label instead of auto-moving to `for-dev`, requiring human final approval.

### 2. Spec File Missing

**Scenario**: Issue has `needs-review` label but no `TECH_SPEC_{number}.md` file.

**Behavior**: Agent skips issue with log message (see src/techlead.ts line 80-83).

**Rationale**: This is a data consistency issue (planner.ts bug). Tech lead should not fail; log and skip is correct.

### 3. Modified Spec Detection False Positive

**Scenario**: Spec file mtime changed but content unchanged (e.g., `touch` command).

**Behavior**: Agent re-reviews (redundant but harmless).

**Mitigation**: Not worth fixing - re-review costs ~$0.10, complexity of content hashing not justified.

### 4. Large Spec Files (>100KB)

**Scenario**: Spec is 200KB markdown (e.g., massive epic breakdown).

**Behavior**: May hit context window limits (200K tokens = ~800KB text).

**Mitigation**: Tech lead should post feedback "Spec too large - consider breaking into sub-issues per epic_breakdown.md protocol."

**Future Enhancement**: Pre-check spec file size, auto-reject if >50KB.

### 5. Multiple Concurrent Reviews

**Scenario**: 10 issues have `needs-review` label, tech lead runs.

**Behavior**: Reviews ONE spec per run (see src/techlead.ts line 95: `break` after first review).

**Rationale**: Same as reviewer.ts - avoid context window bloat, ensure high-quality feedback.

**Cron Integration**: Run `npm run techlead` every 30 minutes → reviews 48 specs/day (more than sufficient).

---

## Acceptance Criteria Mapping

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Tech lead agent reviews specs from technical AND product perspectives | Check protocols/techlead.md criteria include both (scope, edge cases, safety = technical; product alignment = product) |
| 2 | Finds gaps, missing use cases, drift, alternatives | Check protocols/techlead.md criteria cover these explicitly |
| 3 | Uses weighted feedback system | Check techlead_context/thresholds.json defines weights, protocols/techlead.md uses scoring formula |
| 4 | Auto-approves if no critical items | Check protocols/techlead.md decision logic: score >= 85 AND no critical → add for-dev label |
| 5 | Reusable weighting logic for issue #71 | Check techlead_context/thresholds.json format is generic (weights, severity_multipliers), can be reused by code reviewer |
| 6 | npm run techlead command exists | Check package.json scripts includes "techlead": "tsx src/techlead.ts" |
| 7 | Integrates with planner review flow | Check src/techlead.ts queries needs-review label, posts GitHub comments, updates labels |

---

## Success Metrics

### Quantitative (Track after 2 weeks)
- **Review cycle reduction**: Measure time from `needs-review` → `for-dev` before/after tech lead
  - Target: 50% reduction (from avg 2 days → 1 day)
- **First-pass approval rate**: % of specs approved by tech lead without revision
  - Target: 60%+ (40% require revision is acceptable)
- **Critical issue detection**: # of production bugs traced to spec gaps that tech lead missed
  - Target: <1 per month

### Qualitative
- **Human reviewer feedback**: "Tech lead caught X before I did" mentions
- **Spec quality improvement**: Architects proactively address tech lead criteria before posting (learned behavior)
- **Reusability**: Code reviewer (#71) successfully reuses thresholds.json format

### Behavioral
- **Reduced review burden**: Human reviewers spend <30% time on mechanical checks (down from 60%)
- **Faster dev handoff**: Devs receive cleaner specs, fewer "unclear spec" stalls

---

## Rollout Plan

### Phase 1: Core Implementation (2 hours)
- Create protocols/techlead.md (45 min)
- Create src/techlead.ts (60 min)
- Create techlead_context/ files (15 min)

### Phase 2: Testing (30 min)
- Manual test with real needs-review issue
- Verify approval flow
- Verify re-review detection

### Phase 3: Documentation (15 min)
- Update CLAUDE.md with `npm run techlead` command
- Add comment to protocols/review.md mentioning optional tech lead gate

### Phase 4: Cron Integration (15 min)
- Add cron job: `*/30 * * * * cd /path/to/atomo && npm run techlead >> logs/techlead.log 2>&1`
- Monitor for 48 hours

**Total Estimated Effort**: 3 hours

---

## Reusability for Issue #71 (Code Reviewer)

**Shared Components**:
1. **techlead_context/thresholds.json format** - Code reviewer will create `codereview_context/thresholds.json` with same structure:
   ```json
   {
     "auto_approve_threshold": 85,
     "critical_threshold": 70,
     "weights": {
       "test_coverage": 30,
       "code_smell": 25,
       "security": 20,
       "performance": 15,
       "maintainability": 10
     },
     "severity_multipliers": {
       "critical": 0.0,
       "major": 0.5,
       "minor": 0.8,
       "nitpick": 1.0
     }
   }
   ```

2. **Scoring formula** (from protocols/techlead.md) - Code reviewer protocol will use identical formula:
   ```
   Total Score = sum(criterion_weight * severity_multiplier)
   If score >= 85 AND no critical → approve PR
   If score < 70 → request changes
   ```

3. **Decision thresholds** - Same 85/70 split (auto-approve / needs-revision / rejected)

**Future Optimization** (not in scope):
- Extract scoring logic into shared utility: `src/lib/weighted-scoring.ts`
- Both agents import and use same function
- Single source of truth for scoring formula

---

## Related Issues / Dependencies

- **Issue #71**: Code Reviewer Agent (will reuse weighted feedback pattern)
- **protocols/review.md**: Documents existing review flow (tech lead fits into this)
- **protocols/confidence_gate.md**: Proven weighted checklist pattern (reused here)
- **src/reviewer.ts**: Delta cursor pattern (reused for last_review.json)

---

## References

- [Confidence Gate Protocol](../protocols/confidence_gate.md) - Weighted scoring pattern
- [Review Protocol](../protocols/review.md) - Existing review flow
- [Reviewer Agent](../src/reviewer.ts) - Delta cursor pattern
- Issue #71: Code Reviewer Agent (weighting logic reuse)
- Issue #73: This spec

---

**End of TECH_SPEC_73**
