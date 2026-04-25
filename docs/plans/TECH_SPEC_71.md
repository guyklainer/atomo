# TECH_SPEC_71: Code Review Agent

**Priority Score: 6.4** (I=4, C=4, E=2.5)  
**Issue**: #71  
**Type**: Enhancement  
**Labels**: triaged, enhancement

---

## Executive Summary

Create an autonomous code review agent that evaluates PRs created by the Dev agent, posts structured feedback as PR comments, scores each piece of feedback by severity, and auto-approves PRs if all feedback items are below a critical threshold. The agent will reuse the weighted scoring logic planned for the Tech Lead agent (issue #73).

**Trigger mechanisms**:
- (B) Cron polling: every N minutes, check for `pr-ready` PRs awaiting review
- (D) Manual invocation: `npm run codereview`

**Key capabilities**:
1. Fetch open PRs with `pr-ready` label (atomo/issue-* branches)
2. Review code against best practices, project conventions, efficiency, separation of concerns, maintainability, and security
3. Post PR review comments with scored feedback items
4. Auto-approve PR if all feedback scores are below critical threshold
5. Request changes if any critical feedback exists

---

## Root Cause / Requirements

**Problem**: Dev agent creates PRs but lacks automated quality gates before human review. Current workflow relies entirely on manual code review, creating bottlenecks and inconsistent quality standards.

**Requirements** (from issue #71 + clarification):
1. Agent reviews Dev PRs (atomo/issue-* branches)
2. Posts PR comments for feedback (not issue comments)
3. Each feedback item has a severity score
4. Auto-approves if no critical feedback exists
5. Verifies: best practices, conventions (skills/guidelines), efficiency, separation of concerns, maintainability, security
6. Reuses scoring logic from Tech Lead agent (#73)
7. Triggers: cron polling + manual `npm run codereview`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               CODE REVIEW AGENT WORKFLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1: DISCOVERY                                          │
│  ├── Query: gh pr list --search "is:open label:pr-ready"   │
│  ├── Filter: headRefName.startsWith('atomo/issue-')        │
│  └── Exit if no PRs found                                   │
│                                                              │
│  STEP 2: FETCH PR CONTEXT                                   │
│  ├── gh pr view <number> --json number,title,body,diff...  │
│  ├── gh pr diff <number>                                    │
│  ├── Extract linked issue number from PR body              │
│  └── Read TECH_SPEC_<number>.md for context                │
│                                                              │
│  STEP 3: REVIEW DIMENSIONS (parallel analysis)              │
│  ├── Best Practices: idiomatic patterns, DRY, YAGNI        │
│  ├── Project Conventions: follows existing patterns        │
│  ├── Efficiency: performance anti-patterns                 │
│  ├── Separation of Concerns: module boundaries             │
│  ├── Maintainability: readability, documentation           │
│  └── Security: input validation, injection risks           │
│                                                              │
│  STEP 4: SCORE FEEDBACK (reuse shared scoring protocol)     │
│  ├── For each finding: assign severity score (1-10)        │
│  │   1-3: Nice-to-have (cosmetic, style preferences)       │
│  │   4-6: Should-fix (maintainability, minor bugs)         │
│  │   7-10: Must-fix (security, correctness, breaking)      │
│  ├── Apply weighting from protocols/feedback_scoring.md    │
│  └── Calculate aggregate: max(all scores)                  │
│                                                              │
│  STEP 5: POST REVIEW                                        │
│  ├── If max_score >= 7: gh pr review --request-changes     │
│  │   └── Post structured comment with scored feedback      │
│  ├── If max_score < 7: gh pr review --approve              │
│  │   └── Post comment acknowledging minor feedback         │
│  └── Update issue label: pr-ready → merged-ready (approve) │
│                           or pr-ready → for-dev (changes)   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Target Files

### New Files (to create)

1. **`src/codereview.ts`** (new agent orchestrator)
   - Pattern: mirrors `src/planner.ts`, `src/dev.ts` structure
   - Imports: `runAgent` from `runner.js`, `gh` from `github.js`
   - Loads: `protocols/code_review.md`, `protocols/feedback_scoring.md`
   - Main flow:
     ```typescript
     (async () => {
       const prs = gh('pr list --search "is:open label:pr-ready" ...');
       const atomoPRs = prs.filter(pr => pr.headRefName.startsWith('atomo/issue-'));
       
       if (atomoPRs.length === 0) {
         console.log('[CodeReview] No PRs awaiting review.');
         return;
       }
       
       // Process first PR (FIFO)
       const pr = atomoPRs[0];
       const diff = gh(`pr diff ${pr.number}`);
       const issueNumber = extractIssueNumber(pr.headRefName, pr.body);
       const techSpec = fs.readFileSync(`docs/plans/TECH_SPEC_${issueNumber}.md`, 'utf-8');
       
       const PROMPT = `
       You are the Atomo Code Reviewer.
       
       Follow the complete Code Review Protocol defined in CODE_REVIEW_PROTO below.
       
       TARGET PR: #${pr.number}
       LINKED ISSUE: #${issueNumber}
       
       ## Tech Spec Context
       ${techSpec}
       
       ## PR Diff
       ${diff}
       
       ---
       
       ${loadProtocol('code_review')}
       ${loadProtocol('feedback_scoring')}
       `;
       
       await runAgent('CodeReview', PROMPT, {
         model: 'claude-sonnet-4-6',
         tools: ['Read', 'Grep', 'Bash'],
       });
     })().catch(console.error);
     ```

2. **`protocols/code_review.md`** (new protocol)
   - Sections:
     - Review Dimensions (6 categories from issue #71)
     - Review Process (diff analysis, pattern matching, best practice checks)
     - Feedback Format (structured comment template)
     - Approval Logic (score thresholds, auto-approve conditions)
   - References: `protocols/feedback_scoring.md` for scoring rules

3. **`protocols/feedback_scoring.md`** (new shared protocol)
   - **SHARED between Code Reviewer (#71) and Tech Lead (#73)**
   - Defines:
     - Severity scale (1-10 with definitions)
     - Weighting per dimension (Security: 2x, Correctness: 1.5x, Style: 0.5x)
     - Threshold rules (≥7 = must-fix, <7 = can-approve)
     - Aggregation logic (max score wins vs weighted average)
   - Pattern: similar to `protocols/confidence_gate.md` (weighted checklist)

### Modified Files

4. **`package.json`** (add new script)
   ```json
   "scripts": {
     "codereview": "tsx src/codereview.ts",
     ...
   }
   ```

5. **`src/github.ts`** (extend interface, optional)
   - Already has `GitHubPR` interface (lines 18-33) ✅
   - Already has `extractIssueNumber` helper ✅
   - No changes needed unless new helpers required

---

## Implementation Roadmap (Step-by-Step Pseudo-Code)

### Phase 1: Create Shared Scoring Protocol

**File**: `protocols/feedback_scoring.md`

```markdown
# Feedback Scoring Protocol

**Version**: 1.0  
**Shared by**: Code Reviewer, Tech Lead

## Severity Scale

| Score | Severity | Definition | Examples |
|-------|----------|------------|----------|
| 1-3 | Nice-to-have | Cosmetic, style preferences | Variable naming, formatting, comment style |
| 4-6 | Should-fix | Maintainability, minor bugs | Missing error handling, code duplication, suboptimal patterns |
| 7-8 | Must-fix (major) | Correctness, breaking changes | Logic errors, API contract violations, race conditions |
| 9-10 | Must-fix (critical) | Security, data loss | SQL injection, authentication bypass, data corruption |

## Weighting Multipliers

| Dimension | Multiplier | Rationale |
|-----------|------------|-----------|
| Security | 2.0× | Vulnerabilities are non-negotiable |
| Correctness | 1.5× | Bugs impact reliability |
| Best Practices | 1.0× | Standard weight |
| Maintainability | 1.0× | Long-term quality |
| Efficiency | 0.8× | Premature optimization acceptable |
| Style/Convention | 0.5× | Subjective, low priority |

## Aggregation Logic

**Single Decision Rule**: Use `max(all_weighted_scores)` to determine outcome.

- If `max_score >= 7`: Request changes (at least one must-fix item exists)
- If `max_score < 7`: Approve (all feedback is optional or minor)

**Rationale**: A single critical issue blocks approval, even if 99% of the code is perfect.

## Feedback Template

Each feedback item MUST include:
1. **File + Line**: `src/example.ts:42`
2. **Category**: `[Security]`, `[Correctness]`, `[Style]`, etc.
3. **Score**: `7/10 (Must-fix)`
4. **Issue**: One-sentence description
5. **Suggestion**: Concrete remediation (code snippet preferred)

Example:
```
📍 src/auth.ts:15
🔒 [Security] — 9/10 (Must-fix)
**Issue**: SQL query uses string concatenation, vulnerable to injection.
**Suggestion**: Use parameterized query:
  `db.query('SELECT * FROM users WHERE id = ?', [userId])`
```
```

### Phase 2: Create Code Review Protocol

**File**: `protocols/code_review.md`

```markdown
# Code Review Protocol

**Agent**: Code Reviewer  
**Scope**: Review PRs from Dev agent for quality and security

## Review Dimensions

1. **Best Practices**: DRY, YAGNI, SOLID, idiomatic TypeScript
2. **Project Conventions**: Follows patterns from codebase (use Grep to verify)
3. **Efficiency**: Avoid O(n²) loops, unnecessary re-renders, memory leaks
4. **Separation of Concerns**: Respect module boundaries (protocols/, src/, etc.)
5. **Maintainability**: Readable variable names, documented complex logic, testable
6. **Security**: Input validation, authentication checks, no hardcoded secrets

## Review Process

### STEP 1: Context Gathering
- Read TECH_SPEC_<number>.md to understand intent
- Review PR diff line-by-line
- Identify files changed and their purpose

### STEP 2: Pattern Discovery (Zero-Waste)
Before flagging as "bad practice", verify consistency with existing codebase:
- Use `Grep` to find similar patterns in `src/` and `protocols/`
- Example: Don't flag `runAgent` pattern if it's used in 5+ other files
- Only flag if introducing NEW anti-pattern or violating existing convention

### STEP 3: Dimension Analysis
For each of the 6 dimensions, scan for violations:
- **Best Practices**: Check for code duplication (Grep for similar logic)
- **Conventions**: Compare against existing agent files (planner.ts, dev.ts patterns)
- **Efficiency**: Look for nested loops, repeated API calls, missing memoization
- **SoC**: Verify protocol content not duplicated in TypeScript (see CLAUDE.md Progressive Disclosure rule)
- **Maintainability**: Check if complex logic has comments, if variable names are descriptive
- **Security**: Scan for `eval()`, `dangerouslySetInnerHTML`, unsanitized user input

### STEP 4: Score Each Finding
Use the Feedback Scoring Protocol to assign severity:
- Apply dimension-specific multiplier
- Calculate weighted score
- Format using feedback template

### STEP 5: Approve or Request Changes
- If `max(scores) >= 7`: `gh pr review <number> --request-changes --body "<feedback>"`
- If `max(scores) < 7`: `gh pr review <number> --approve --body "<summary + minor feedback>"`
- Update issue labels accordingly

## Edge Cases

- **No findings**: Approve with "🤖 Code review: No issues found. Excellent work!"
- **All cosmetic**: Approve with acknowledgment: "🤖 Approved with minor suggestions (non-blocking)"
- **Multiple must-fix items**: List all in review, sort by severity (highest first)

## Isolation Rule

Code Reviewer MUST NOT modify code directly. It only posts review comments.
Dev agent is responsible for addressing feedback and re-opening PR.
```

### Phase 3: Create Agent Orchestrator

**File**: `src/codereview.ts`

```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
import { gh } from './github.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadProtocol = (name: string) =>
  fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const ghTarget = (command: string) => gh(command, targetCwd);

// Extract issue number from PR metadata (reuse existing helper or inline)
function extractIssueNumber(headRefName: string, body: string): number | null {
  const branchMatch = headRefName.match(/atomo\/issue-(\d+)/);
  if (branchMatch) return parseInt(branchMatch[1]!, 10);
  const bodyMatch = body.match(/Closes #(\d+)|Fixes #(\d+)|Issue #(\d+)/i);
  return bodyMatch ? parseInt(bodyMatch[1] || bodyMatch[2] || bodyMatch[3]!, 10) : null;
}

(async () => {
  console.log('[CodeReview] Checking for PRs awaiting review...');

  const prs = ghTarget(
    'pr list --state open --json number,title,headRefName,body,labels --limit 50'
  );

  // Filter: only atomo/issue-* branches with pr-ready label
  const atomoPRs = prs.filter(
    (pr: any) =>
      pr.headRefName.startsWith('atomo/issue-') &&
      pr.labels.some((l: any) => l.name === 'pr-ready')
  );

  if (atomoPRs.length === 0) {
    console.log('[CodeReview] No PRs awaiting review. Exiting.');
    process.exit(0);
  }

  // Process first PR (FIFO)
  const pr = atomoPRs[0]!;
  const issueNumber = extractIssueNumber(pr.headRefName, pr.body);

  if (!issueNumber) {
    console.error(`[CodeReview] Could not extract issue number from PR #${pr.number}`);
    process.exit(1);
  }

  console.log(`[CodeReview] Reviewing PR #${pr.number} (Issue #${issueNumber})...`);

  // Fetch diff and context
  const diff = ghTarget(`pr diff ${pr.number}`);
  const techSpecPath = path.join(__dirname, '..', 'docs', 'plans', `TECH_SPEC_${issueNumber}.md`);
  const techSpec = fs.existsSync(techSpecPath)
    ? fs.readFileSync(techSpecPath, 'utf-8')
    : '(No tech spec found)';

  const codeReviewProto = loadProtocol('code_review');
  const feedbackScoringProto = loadProtocol('feedback_scoring');

  const PROMPT = `
You are the Atomo Code Reviewer.

Your task is to review PR #${pr.number} (linked to issue #${issueNumber}) against the 6 quality dimensions defined in your protocol.

## Target Repository Context
TARGET_REPO_PATH: ${targetCwd}

## PR Metadata
- **PR Number**: #${pr.number}
- **Title**: ${pr.title}
- **Branch**: ${pr.headRefName}
- **Issue**: #${issueNumber}

## Tech Spec Context
${techSpec}

## PR Diff
\`\`\`diff
${diff}
\`\`\`

---

## Your Protocols

${codeReviewProto}

---

${feedbackScoringProto}
`;

  await runAgent('CodeReview', PROMPT, {
    model: 'claude-sonnet-4-6',
    tools: ['Read', 'Grep', 'Bash'],
    allowedTools: ['Read', 'Grep', 'Bash'],
  });
})().catch(console.error);
```

### Phase 4: Update package.json

**File**: `package.json`

Add to `"scripts"`:
```json
"codereview": "tsx src/codereview.ts"
```

### Phase 5: Integration with Existing Workflow

**No changes required** to existing agents, but document the flow:

1. **Dev agent** creates PR → adds `pr-ready` label
2. **Code Reviewer** (cron or manual) → reviews PR, posts feedback
3. If approved → updates label to `merged-ready`
4. If changes requested → updates label back to `for-dev`
5. **Dev agent** (next run) → detects `for-dev`, addresses feedback, re-opens PR

---

## Pattern Discovery Results

### Reused Patterns from Existing Codebase

1. **Agent Structure** (from `src/planner.ts`, `src/dev.ts`, `src/reviewer.ts`):
   - TypeScript orchestrator in `src/`
   - Protocol content in `protocols/`
   - `runAgent()` invocation with injected protocol
   - Progressive Disclosure: no protocol content duplicated in TypeScript

2. **GitHub Interaction** (from `src/github.ts`):
   - `gh()` helper for CLI commands
   - `GitHubPR` interface (lines 18-33) ✅
   - `extractIssueNumber()` pattern (from dev.ts)

3. **PR Review Pattern** (from `src/dev.ts` lines 51-115):
   - Filter PRs by `headRefName.startsWith('atomo/issue-')`
   - Check `pr-ready` label before processing
   - Use `gh pr review --approve` or `--request-changes`
   - Update issue labels after review

4. **Scoring Protocol Pattern** (from `protocols/confidence_gate.md`):
   - Weighted checklist with percentage thresholds
   - Binary or numeric scoring per criterion
   - Decision rule based on aggregate score
   - **Adapt for feedback scoring**: criterion → feedback item, weight → severity multiplier

5. **Cron + Manual Trigger** (from `src/pm.ts`):
   - Agent exits early if no work found
   - Console logs for cron output capture
   - Single-pass execution (no loops, one PR per run)

---

## Dependency Mapping

### Dependencies (Must Exist Before Implementation)

1. **Issue #73 (Tech Lead agent)**: Shares `protocols/feedback_scoring.md`
   - **Resolution**: Create `feedback_scoring.md` as part of THIS spec (#71)
   - Tech Lead agent (#73) will reference the same file when implemented
   - If #73 is implemented first, it should create the scoring protocol
   - **Recommendation**: Implement #71 first, create scoring protocol here

### Blocked Issues

None. This issue does not block any other known issues.

---

## ICE Priority Breakdown

- **Impact (I) = 4**: Affects quality of all Dev agent output, reduces manual review burden, catches bugs/security issues early
- **Confidence (C) = 4**: Clear requirements, proven patterns exist in codebase, well-defined scope
- **Ease/Effort (E) = 2.5**: Moderate complexity
  - New agent creation: 3-4 hours (follow existing pattern)
  - Scoring protocol design: 2-3 hours (adapt from confidence_gate)
  - PR interaction logic: 1-2 hours (reuse dev.ts patterns)
  - Testing/iteration: 2-3 hours
  - **Total effort**: ~8-12 hours

**Priority Score: P = (I × C) / E = (4 × 4) / 2.5 = 6.4**

---

## Testing Strategy

### Manual Testing (Pre-PR)

1. Create a test PR with intentional issues:
   - Security: hardcoded API key
   - Correctness: off-by-one error
   - Style: inconsistent naming
   - Efficiency: nested loop

2. Run `npm run codereview`

3. Verify:
   - Agent detects all issues
   - Scores are correctly weighted (Security=9, Correctness=7, Style=2)
   - `max_score >= 7` → requests changes
   - Feedback template is correctly formatted
   - Issue label updates: `pr-ready` → `for-dev`

### Regression Testing (Post-PR)

1. Run on existing merged PRs (dry-run mode) to validate scoring logic
2. Compare agent feedback vs historical human review comments
3. Tune thresholds if false positives > 20%

---

## Rollout Plan

### Phase 1: Shadow Mode (Week 1)
- Agent reviews PRs but does NOT post comments (logs to file)
- Human reviews proceed as normal
- Compare agent feedback vs human feedback
- Tune scoring thresholds

### Phase 2: Advisory Mode (Week 2)
- Agent posts comments but does NOT approve/reject
- Human makes final decision
- Collect feedback on accuracy

### Phase 3: Autonomous Mode (Week 3+)
- Agent auto-approves low-score PRs
- Agent auto-requests-changes on high-score PRs
- Human review only for borderline cases (score 6-7)

---

## Open Questions for Reviewer

(See Clarification Questions section in issue comment)

---

## Revision History

- **2026-04-25**: Initial spec (Confidence: 50% → Clarification provided → Proceeding)
