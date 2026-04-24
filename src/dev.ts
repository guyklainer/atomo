import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
import { gh, hasHumanReplyAfterBot, hasNewReviewComments, extractIssueNumber, type GitHubPR } from './github.js';

// Fix for __dirname in ESM environments run via tsx
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    'pr list --state open --limit 50 --json number,title,headRefName,body,reviews,comments'
  );

  // Filter to atomo branches only
  const atomoPRs = prs.filter(pr => pr.headRefName.startsWith('atomo/issue-'));

  if (atomoPRs.length === 0) {
    console.log('[PR REVIEW] No open atomo PRs found.');
    return { outcome: 'no-pr-reviews' };
  }

  let lastWaitingPR: number | null = null;

  for (const pr of atomoPRs) {
    const issueNumber = extractIssueNumber(pr.headRefName, pr.body);
    if (!issueNumber) {
      console.log(`[PR REVIEW] PR #${pr.number}: Could not extract issue number, skipping.`);
      continue;
    }

    // Only process PRs whose issue still has pr-ready label (avoid re-processing)
    const issue: { labels: Array<{ name: string }> } = ghTarget(
      `issue view ${issueNumber} --json labels`
    );
    if (!issue.labels.some(l => l.name === 'pr-ready')) {
      console.log(`[PR REVIEW] PR #${pr.number} (Issue #${issueNumber}): Issue not pr-ready, skipping.`);
      continue;
    }

    console.log(`[PR REVIEW] PR #${pr.number} (Issue #${issueNumber}): Checking feedback...`);

    const latestReview = getLatestReviewState(pr.reviews);
    const hasCommentFeedback = hasHumanReplyAfterBot(pr.comments);
    const hasInlineComments = hasNewReviewComments(pr.number, pr.comments, targetCwd);

    // Approved via formal review
    if (latestReview === 'APPROVED') {
      console.log(`[PR REVIEW] PR #${pr.number}: APPROVED → Labeling merged-ready.`);
      ghTarget(`issue edit ${issueNumber} --remove-label pr-ready`);
      ghTarget(`issue edit ${issueNumber} --add-label merged-ready`);
      ghTarget(`pr comment ${pr.number} --body "🤖 PR approved. Ready for merge."`);
      return { outcome: 'approved', prNumber: pr.number, issueNumber };
    }

    // Changes requested via formal review, human comment, or inline review comments
    if (latestReview === 'CHANGES_REQUESTED' || hasCommentFeedback || hasInlineComments) {
      console.log(`[PR REVIEW] PR #${pr.number}: Changes requested → Re-routing to for-dev.`);
      ghTarget(`issue edit ${issueNumber} --remove-label pr-ready`);
      ghTarget(`issue edit ${issueNumber} --add-label for-dev`);
      // Post on the PR (not issue) so the 🤖 timestamp marks these comments as "addressed"
      ghTarget(`pr comment ${pr.number} --body "🤖 Review feedback detected. Re-routing to dev agent for revision."`);
      return { outcome: 'changes-requested', prNumber: pr.number, issueNumber };
    }

    console.log(`[PR REVIEW] PR #${pr.number}: No feedback yet, skipping.`);
    lastWaitingPR = pr.number;
  }

  if (lastWaitingPR !== null) {
    return { outcome: 'waiting-for-review', prNumber: lastWaitingPR };
  }

  return { outcome: 'no-pr-reviews' };
}

const loadProtocol = (name: string) => fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const DEV_HINT = loadHint('dev');

const CLAUDE_MD = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8');
const ATOMO_DEV_PROTO = loadProtocol('atomo_dev');
const PLANNING_PROTO = loadProtocol('planning'); // For zero-waste tool usage rules
const TDD_PROTO = loadProtocol('tdd');
const EPIC_PROTO = loadProtocol('epic_breakdown'); // For dependency cascade logic

// ─────────────────────────────────────────────────────────────────
// PRIORITIZATION ENGINE: Runs $0 in pure Node.js before the LLM
// Fetches all actionable `for-dev` issues, parses ICE Priority
// Scores from their bodies, sorts, and picks the highest-priority.
// ─────────────────────────────────────────────────────────────────
interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  priority: number;
}

function parsePriorityScore(body: string): number {
  // Matches patterns like "Priority: 6.0" or "Priority: 3.33 (I=4, C=5, E=6)"
  const match = body?.match(/Priority:\s*([\d.]+)/i);
  return match ? parseFloat(match[1]!) : 0;
}

function pickHighestPriorityIssue(): GitHubIssue | null {
  try {
    const raw = execSync(
      'gh issue list --search "is:open label:for-dev -label:pr-ready -label:blocked" --limit 50 --json number,title,body',
      { encoding: 'utf-8', cwd: targetCwd }
    );
    const issues: GitHubIssue[] = JSON.parse(raw).map((i: GitHubIssue) => ({
      ...i,
      priority: parsePriorityScore(i.body)
    }));

    if (issues.length === 0 || !issues[0]) return null;

    // Sort descending by priority score, pick the top one
    issues.sort((a, b) => b.priority - a.priority);
    const top = issues[0]!;
    console.log(`[Orchestrator] ${issues.length} actionable issue(s) found.`);
    console.log(`[Orchestrator] Top candidate → Issue #${top.number}: "${top.title}" (P=${top.priority})`);
    return top;
  } catch {
    return null;
  }
}

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
${DEV_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${DEV_HINT}` : ''}
`;

  await runAgent('AtomoDev', SYSTEM_PROMPT, {
    cwd: targetCwd,
    model: 'claude-sonnet-4-5',
    tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
    allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
  });
})().catch(console.error);
