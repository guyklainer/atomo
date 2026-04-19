# Dev Agent: Deterministic PR Review Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic pre-processing step to the dev agent that checks open PRs for review feedback before picking new issues.

**Architecture:** A `handlePRReviews()` function in `src/dev.ts` queries GitHub for open PRs on `atomo/issue-*` branches, checks formal reviews and comments, and routes label changes accordingly. Reuses `gh()` and `hasHumanReplyAfterBot()` from `src/github.ts`. Runs before `pickHighestPriorityIssue()`, same pattern as planner's `handleReviewIssues()`.

**Tech Stack:** TypeScript, GitHub CLI (`gh`), `src/github.ts` helpers

---

### File Structure

- **Modify:** `src/dev.ts` — add `handlePRReviews()`, update main execution flow
- **Modify:** `src/github.ts` — add `GitHubPR` interface, add `extractIssueNumber()` helper

---

### Task 1: Add PR types and helpers to `src/github.ts`

**Files:**
- Modify: `src/github.ts:1-59`

- [ ] **Step 1: Add `GitHubPR` interface to `src/github.ts`**

Add after the `GitHubIssue` interface (after line 14):

```typescript
export interface GitHubPR {
  number: number;
  title: string;
  headRefName: string;
  body: string;
  reviews: Array<{
    state: string;
    author: { login: string };
    submittedAt: string;
  }>;
  comments: Array<{
    body: string;
    author: { login: string };
    createdAt: string;
  }>;
}
```

- [ ] **Step 2: Add `extractIssueNumber()` helper to `src/github.ts`**

Add after the `hasHumanReplyAfterBot` function (after line 59):

```typescript
/**
 * Extract issue number from a branch name like "atomo/issue-42"
 * or from a PR body containing "Resolves #42".
 */
export function extractIssueNumber(branchName: string, body: string): number | null {
  const branchMatch = branchName.match(/^atomo\/issue-(\d+)$/);
  if (branchMatch) return parseInt(branchMatch[1]!, 10);

  const bodyMatch = body?.match(/Resolves\s+#(\d+)/i);
  if (bodyMatch) return parseInt(bodyMatch[1]!, 10);

  return null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/guyklainer/Developer/atomo && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/github.ts
git commit -m "feat: add GitHubPR interface and extractIssueNumber helper"
```

---

### Task 2: Add `handlePRReviews()` to `src/dev.ts`

**Files:**
- Modify: `src/dev.ts:1-135`

- [ ] **Step 1: Add imports from `github.ts`**

Replace line 5-6 of `src/dev.ts`:

```typescript
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
```

with:

```typescript
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
import { gh, hasHumanReplyAfterBot, extractIssueNumber, type GitHubPR } from './github.js';
```

- [ ] **Step 2: Add `PRReviewResult` type and `handlePRReviews()` function**

Add after `const __dirname = ...` (after line 10), before `const loadProtocol`:

```typescript
// ─────────────────────────────────────────────────────────────────
// PR REVIEW: Deterministic pre-processing (runs before LLM)
// Checks open PRs for reviewer feedback and routes label changes.
// ─────────────────────────────────────────────────────────────────

const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const ghTarget = (command: string) => gh(command, targetCwd);

type PRReviewResult =
  | { outcome: 'no-pr-reviews' }
  | { outcome: 'waiting-for-review'; prNumber: number }
  | { outcome: 'approved'; prNumber: number; issueNumber: number }
  | { outcome: 'changes-requested'; prNumber: number; issueNumber: number };

/**
 * Check the latest formal review state on a PR.
 * Returns 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', or null.
 */
function getLatestReviewState(reviews: GitHubPR['reviews']): string | null {
  if (!reviews || reviews.length === 0) return null;
  // Reviews are chronological; take the last one
  return reviews[reviews.length - 1]!.state;
}

/**
 * Deterministic PR review handler.
 * - Approved PRs: label issue `merged-ready`, remove `pr-ready`
 * - Changes requested: remove `pr-ready`, add back `for-dev`
 * - No feedback: skip
 */
function handlePRReviews(): PRReviewResult {
  console.log('[PR REVIEW] Checking open PRs for review feedback...');

  const prs: GitHubPR[] = ghTarget(
    'pr list --search "is:open" --json number,title,headRefName,body,reviews,comments'
  );

  // Filter to atomo branches only
  const atomoPRs = prs.filter(pr => pr.headRefName.startsWith('atomo/issue-'));

  if (atomoPRs.length === 0) {
    console.log('[PR REVIEW] No open atomo PRs found.');
    return { outcome: 'no-pr-reviews' };
  }

  for (const pr of atomoPRs) {
    const issueNumber = extractIssueNumber(pr.headRefName, pr.body);
    if (!issueNumber) {
      console.log(`[PR REVIEW] PR #${pr.number}: Could not extract issue number, skipping.`);
      continue;
    }

    console.log(`[PR REVIEW] PR #${pr.number} (Issue #${issueNumber}): Checking feedback...`);

    const latestReview = getLatestReviewState(pr.reviews);
    const hasCommentFeedback = hasHumanReplyAfterBot(pr.comments);

    // Approved via formal review
    if (latestReview === 'APPROVED') {
      console.log(`[PR REVIEW] PR #${pr.number}: APPROVED → Labeling merged-ready.`);
      ghTarget(`issue edit ${issueNumber} --remove-label pr-ready`);
      ghTarget(`issue edit ${issueNumber} --add-label merged-ready`);
      ghTarget(`issue comment ${issueNumber} --body "🤖 PR #${pr.number} approved. Ready for merge."`);
      return { outcome: 'approved', prNumber: pr.number, issueNumber };
    }

    // Changes requested via formal review OR human comment feedback
    if (latestReview === 'CHANGES_REQUESTED' || hasCommentFeedback) {
      console.log(`[PR REVIEW] PR #${pr.number}: Changes requested → Re-routing to for-dev.`);
      ghTarget(`issue edit ${issueNumber} --remove-label pr-ready`);
      ghTarget(`issue edit ${issueNumber} --add-label for-dev`);
      ghTarget(`issue comment ${issueNumber} --body "🤖 PR #${pr.number} received review feedback. Re-routing for revision."`);
      return { outcome: 'changes-requested', prNumber: pr.number, issueNumber };
    }

    console.log(`[PR REVIEW] PR #${pr.number}: No feedback yet, skipping.`);
    return { outcome: 'waiting-for-review', prNumber: pr.number };
  }

  return { outcome: 'no-pr-reviews' };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/guyklainer/Developer/atomo && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/dev.ts
git commit -m "feat: add deterministic handlePRReviews() to dev agent"
```

---

### Task 3: Wire `handlePRReviews()` into the main execution flow

**Files:**
- Modify: `src/dev.ts:62-135` (the bottom half — issue picking and agent invocation)

- [ ] **Step 1: Replace the synchronous main flow with async entry point**

Replace everything from line 62 (`const targetIssue = pickHighestPriorityIssue();`) to end of file with:

```typescript
(async () => {
  // Step 1: Deterministic PR review pre-processing
  let reviewResult: PRReviewResult;
  try {
    reviewResult = handlePRReviews();
  } catch (error) {
    console.error('[PR REVIEW] Error during PR review handling:', error);
    reviewResult = { outcome: 'no-pr-reviews' };
  }

  // Step 2: Route based on review result
  switch (reviewResult.outcome) {
    case 'approved':
      console.log(`[PR REVIEW] PR #${reviewResult.prNumber} approved (Issue #${reviewResult.issueNumber}). Exiting.`);
      return;

    case 'changes-requested':
      console.log(`[PR REVIEW] PR #${reviewResult.prNumber} needs changes (Issue #${reviewResult.issueNumber}). Re-labeled for-dev. Exiting.`);
      return;

    case 'waiting-for-review':
      console.log(`[PR REVIEW] PR #${reviewResult.prNumber} waiting for review. Proceeding to new issues.`);
      break;

    case 'no-pr-reviews':
      break;
  }

  // Step 3: Pick highest priority issue and run LLM (existing logic)
  const targetIssue = pickHighestPriorityIssue();

  if (!targetIssue) {
    console.log('[Orchestrator] No actionable for-dev issues found. Exiting.');
    return;
  }

  const SYSTEM_PROMPT = `
You are the autonomous Atomo Dev Execution Agent.
Your objective is to implement the specific GitHub Issue #${targetIssue.number}: "${targetIssue.title}".
Do NOT re-query for another issue. Your task is already assigned.

You MUST strictly follow the 'Atomo: The Methodical Dev Protocol' loop defined below.

--- INJECTED PROTOCOLS ---
${CLAUDE_MD}

---

${ATOMO_DEV_PROTO}

---

${PLANNING_PROTO}

---

${TDD_PROTO}

---

${EPIC_PROTO}
-------------------------

PHASE 1: GROUNDING & BRANCHING
1. Fetch the full issue and comments: 'gh issue view ${targetIssue.number} --json number,title,body,comments'.
2. Read the associated 'docs/plans/TECH_SPEC_${targetIssue.number}.md'.
3. Verify architectural boundaries and acceptance criteria.
4. IMMEDIATELY create a scoped feature branch: 'git checkout -b atomo/issue-${targetIssue.number}'.

PHASE 2: PATTERN DISCOVERY
1. Use 'Grep' to find 2-3 existing implementations of similar logic in the codebase.
2. Search '.claude/', '.agents/', and 'MEMORY.md' inside the target repository for custom rules or historical patterns.
3. Document your findings in your reasoning stream.

PHASE 3: SURGICAL IMPLEMENTATION
1. Document your implementation plan (line-by-line) in your reasoning stream.
2. Follow the TDD Protocol (Phase 0: Baseline Check).
3. Implement and verify in incremental units (TDD Phase 1 & 2).
4. Use 'Bash', 'Read', and 'Write' tools for surgical modification.

PHASE 4: VERIFICATION & REPORTING
1. FINAL GATE: Run 'npx tsc --noEmit && npm run lint && npm test' (TDD Phase 3).
2. CROSS-CHECK: Explicitly verify that each **Acceptance Criterion** from the TECH_SPEC has been met.
3. BRANCH HANDOFF:
   - git add . && git commit -m "Implement Issue #${targetIssue.number}: ${targetIssue.title}"
   - gh pr create --title "Resolve #${targetIssue.number}: ${targetIssue.title}" --body "Resolves #${targetIssue.number}\\n\\nAutomated PR following Atomo Protocol."
   - gh issue edit ${targetIssue.number} --add-label pr-ready --remove-label for-dev
4. COMPLETION REPORT: Post a final comment on Issue #${targetIssue.number} with the following format:
   \`\`\`
   🤖 Atomo Completion Report
   - Changes: <summary>
   - Verification: <tsc/lint/test results>
   - Acceptance: <confirmation of each criterion>
   \`\`\`
5. DEPENDENCY CASCADE: If issue body contains "Blocks: #<number>", use 'gh issue edit <number> --remove-label blocked'.
`;

  await runAgent('AtomoDev', SYSTEM_PROMPT, {
    cwd: targetCwd,
    model: 'claude-sonnet-4-5',
    tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
    allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
  });
})().catch(console.error);
```

- [ ] **Step 2: Remove the now-unused `targetCwd` duplicate**

The old code used `process.env.TARGET_REPO_PATH || process.cwd()` inline in the `runAgent` call. The new code uses the `targetCwd` const defined at the top (alongside `ghTarget`). Make sure there's no duplicate.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/guyklainer/Developer/atomo && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/dev.ts
git commit -m "feat: wire handlePRReviews() into dev agent execution flow"
```
