import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
import {
  gh,
  hasHumanReplyAfterBot,
  ensureLatestMain,
  restorePreviousState,
  type GitState,
  type GitHubIssue
} from './github.js';

// Fix for __dirname in ESM environments run via tsx
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadProtocol = (name: string) => fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

const loadHint = (name: string): string => {
  const hintPath = path.join(__dirname, `../reviewer_context/hints/${name}.md`);
  return fs.existsSync(hintPath) ? fs.readFileSync(hintPath, 'utf-8') : '';
};

const PLANNER_HINT = loadHint('planner');

const CLAUDE_MD = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8');
const REVIEW_PROTO = loadProtocol('review');
const PLANNING_PROTO = loadProtocol('planning');
const CONFIDENCE_PROTO = loadProtocol('confidence_gate');
const EPIC_PROTO = loadProtocol('epic_breakdown');

// ─────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────

const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();
const ghTarget = (command: string) => gh(command, targetCwd);

/**
 * Check if the most recent human comment contains "APPROVED" (case-insensitive).
 */
function isApproval(comments: GitHubIssue['comments']): boolean {
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment && !comment.body.trim().startsWith('🤖')) {
      return comment.body.toLowerCase().includes('approved');
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────
// REVIEW: Deterministic pre-processing (runs before LLM)
// ─────────────────────────────────────────────────────────────────

type ReviewResult =
  | { outcome: 'no-review-issues' }
  | { outcome: 'waiting-for-reply'; issueNumber: number }
  | { outcome: 'approved'; issueNumber: number }
  | { outcome: 'feedback'; issueNumber: number; issue: GitHubIssue };

/**
 * Run the REVIEW flow deterministically.
 * - Approvals are handled entirely in code (no LLM needed).
 * - Feedback issues are returned for LLM processing.
 */
function handleReviewIssues(): ReviewResult {
  console.log('[REVIEW] Checking needs-review issues...');

  const issues = ghTarget(
    'issue list --search "is:open label:needs-review" --limit 50 --json number,title'
  );

  if (!issues || issues.length === 0) {
    console.log('[REVIEW] No needs-review issues found.');
    return { outcome: 'no-review-issues' };
  }

  let firstIssueNumber: number | null = null;

  for (const listIssue of issues) {
    const issue: GitHubIssue = ghTarget(
      `issue view ${listIssue.number} --json number,title,body,labels,comments`
    );
    console.log(`[REVIEW] Processing issue #${issue.number}...`);

    if (firstIssueNumber === null) {
      firstIssueNumber = issue.number;
    }

    // Check for human reply
    if (!hasHumanReplyAfterBot(issue.comments)) {
      console.log(`[REVIEW] Issue #${issue.number}: No human reply yet, skipping.`);
      continue;
    }

    console.log(`[REVIEW] Issue #${issue.number}: Human reply detected.`);

    // Approval — handle entirely in code
    if (isApproval(issue.comments)) {
      console.log(`[REVIEW] Issue #${issue.number}: APPROVED → Routing to Dev Agent.`);
      ghTarget(`issue edit ${issue.number} --remove-label needs-review`);
      ghTarget(`issue edit ${issue.number} --add-label for-dev`);
      ghTarget(`issue comment ${issue.number} --body "🤖 Spec approved. Routing to Dev Agent."`);
      return { outcome: 'approved', issueNumber: issue.number };
    }

    // Feedback — needs LLM to update the spec
    console.log(`[REVIEW] Issue #${issue.number}: Feedback detected → Delegating to LLM for spec iteration.`);
    return { outcome: 'feedback', issueNumber: issue.number, issue };
  }

  // If none have a human reply, just fall back to waiting for the first one
  return { outcome: 'waiting-for-reply', issueNumber: firstIssueNumber! };
}

// ─────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────────

/**
 * Build a focused prompt for iterating on a spec based on review feedback.
 */
function buildReviewPrompt(issue: GitHubIssue): string {
  return `
You are the autonomous Technical Architect.
You are processing REVIEW FEEDBACK for issue #${issue.number}.

A human has left feedback on the tech spec. Your job:
1. Re-read the existing spec at docs/plans/TECH_SPEC_${issue.number}.md
2. Read ALL comments on the issue for full context
3. Identify the requested changes or clarifications from the most recent human feedback
4. Update TECH_SPEC_${issue.number}.md incorporating the feedback (use Write tool to overwrite)
5. Follow Phase 0 branching strategy to commit updated spec:
   - If planner/issue-${issue.number} branch exists: Checkout, commit, force-push
   - If not exists: Create branch, commit, push
6. Post the updated spec as a GitHub comment in this format:

   🤖 **Tech Spec Updated (Review Iteration)**

   [Full updated TECH_SPEC_${issue.number}.md content]

   **Planner Branch**: \`planner/issue-${issue.number}\`

   ---

   Reply "APPROVED" when ready to proceed to implementation, or provide further feedback.

7. Keep the needs-review label (do NOT remove or add any labels)


Output a summary:
{
  "flow": "review",
  "issueNumber": ${issue.number},
  "action": "spec-updated-awaiting-re-review",
  "feedbackAddressed": ["summary of changes made"]
}

--- ISSUE CONTEXT (pre-fetched) ---
Title: ${issue.title}
Body: ${issue.body}

Comments:
${issue.comments.map(c => `[${c.author.login} @ ${c.createdAt}]: ${c.body}`).join('\n\n')}

--- INJECTED PROTOCOL RULES ---
${CLAUDE_MD}

---

${REVIEW_PROTO}

---

${PLANNING_PROTO}
-------------------------------
`;
}

const PLANNING_PROMPT = `
You are the autonomous Technical Architect.
Your objective is to ingest fully-triaged GitHub issues and construct detailed programmatic blueprints for implementation.

The REVIEW flow (checking needs-review issues) has already been handled before you run.
Focus only on PLANNING below.

--- PLANNING: NEW TRIAGED ISSUES ---

STEP 1: DATA INGESTION
Query: gh issue list --search "is:open label:triaged -label:for-dev -label:needs-review -label:needs-info" --limit 1 --json number,title,body

If an issue exists:
  1. Fetch full detail: gh issue view <number> --json number,title,body,labels,comments
  2. Proceed to STEP 1.5 (Confidence Gate)

If no issues found:
  Output: { "flow": "planning", "action": "skipped-no-new-issues" }
  EXIT

STEP 1.5: CONFIDENCE GATE
Before writing any Tech Spec, apply the Confidence Gate Protocol from the injected rules below.
Select the appropriate checklist based on the issue type (Bug vs Enhancement).
Calculate your weighted confidence score.

IMPORTANT: Before posting a needs-info comment, check the issue comments for a prior needs-info exchange
(a 🤖 comment asking for clarification followed by a human reply). If clarification was already provided,
do NOT ask again — proceed to STEP 2 with the information available, even if confidence is below 85.
You may only post a NEW needs-info if no prior clarification exchange exists in the comments.

- If score >= 85: proceed to STEP 2.
- If score < 85 AND no prior clarification was provided: post a needs-info clarifying comment using the exact format from the protocol, execute:
    gh issue edit <number> --add-label needs-info
  Then output the following JSON and STOP — do NOT write a TECH_SPEC:
  {
    "flow": "planning",
    "issueNumber": <number>,
    "action": "needs-info-posted",
    "confidenceScore": <score>,
    "questionAsked": "<the single question you posted>"
  }

STEP 2: GENERATE CLARIFICATION QUESTIONS
Before writing the spec, identify the 2-3 areas with the highest potential for ambiguity or misalignment.

Examples of high-ambiguity areas:
- Unclear edge case handling (e.g., "What happens if X is null?")
- Multiple valid design approaches (e.g., "Should this be a hook or a component?")
- Unspecified behavior interactions (e.g., "How does this affect existing feature Y?")
- Scope boundary uncertainties (e.g., "Should this include Z or defer to a later issue?")

Frame each as a specific, answerable question. Store these for STEP 4.

STEP 3: TECHNICAL PLANNING
Build the implementation blueprint following the Zero-Waste Protocol exactly.
- INSTRUCTION: You must strictly adhere to the 'Technical Planning: The Zero-Waste Protocol' logic defined in the injected rules. Perform zero-waste codebase traversal and file generation according to those rules.
- Write to: docs/plans/TECH_SPEC_<number>.md

STEP 3.5: COMMIT TECH SPEC TO PLANNER BRANCH
After writing the TECH_SPEC file, follow Phase 0 branching strategy (Planner workflow from ATOMO_DEV_PROTO above):
- Create planner/issue-<number> branch
- Commit docs/plans/TECH_SPEC_<number>.md with co-author tag
- Push to origin

If any git command fails, log the error but continue to STEP 4.

STEP 4: POST SPEC FOR REVIEW
Combine the tech spec and clarification questions into a single GitHub comment.

Use the Bash tool to read the spec file and post it:
1. Read the spec: cat docs/plans/TECH_SPEC_<number>.md
2. Construct a comment in this format:
   ---
   🤖 **Tech Spec Ready for Review**

   [Paste full TECH_SPEC_<number>.md content here]

   **Planner Branch**: \`planner/issue-<number>\`

   ---

   **Clarification Questions** (to reduce ambiguity):
   1. [Question 1 from STEP 2]
   2. [Question 2 from STEP 2]
   3. [Question 3 from STEP 2]

   Reply "APPROVED" when ready to proceed to implementation, or provide feedback for iteration.
   ---

3. Post comment: gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md (then append clarification questions separately if needed) OR construct the full comment string
4. Add label: gh issue edit <number> --add-label needs-review

DO NOT add for-dev label at this stage.

STEP 5: PLANNING SUMMARY
Output:
{
  "flow": "planning",
  "issueNumber": <number>,
  "action": "spec-posted-for-review",
  "confidenceScore": <score>,
  "specFile": "docs/plans/TECH_SPEC_<number>.md",
  "plannerBranch": "planner/issue-<number>",
  "clarificationQuestions": ["Q1", "Q2", "Q3"],
  "filesChanged": ["list of files identified in the spec"]
}

--- INJECTED PROTOCOL RULES ---
${CLAUDE_MD}

---

${REVIEW_PROTO}

---

${PLANNING_PROTO}

---

${CONFIDENCE_PROTO}

---

${EPIC_PROTO}
-------------------------------
${PLANNER_HINT ? `\n---\n\n## REVIEWER HINTS (supplemental guidance, not protocol rules)\n${PLANNER_HINT}` : ''}
`;

// ─────────────────────────────────────────────────────────────────
// Deterministic planning pre-check (runs before LLM)
// ─────────────────────────────────────────────────────────────────

function hasTriagedIssues(): boolean {
  console.log('[PLANNING] Checking for triaged issues...');
  const issues = ghTarget(
    'issue list --search "is:open label:triaged -label:for-dev -label:needs-review -label:needs-info" --limit 1 --json number,title'
  );
  return Array.isArray(issues) && issues.length > 0;
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXECUTION: Run REVIEW (deterministic), then PLANNING (LLM)
// ─────────────────────────────────────────────────────────────────

const agentOptions = {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-sonnet-4-5' as const,
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
};

(async () => {
  // === PHASE 0: Repository State Validation (Issue #7) ===
  let gitState: GitState | undefined;
  console.log('[PLANNER] Validating repository state...');
  const validation = ensureLatestMain(targetCwd);

  if (!validation.success) {
    console.error('[PLANNER] Git validation failed:', validation.message);
    console.error('[PLANNER] ABORTING. Please resolve git state manually and re-run.');
    process.exit(1);
  }

  gitState = validation.state!;
  console.log('[PLANNER] ✅ Git validation passed. Proceeding with planning...');

  try {
    // Step 1: Deterministic review pre-processing
    let reviewResult: ReviewResult;
    try {
      reviewResult = handleReviewIssues();
    } catch (error) {
      console.error('[REVIEW] Error during review handling:', error);
      // Fall through to PLANNING if review check fails
      reviewResult = { outcome: 'no-review-issues' };
    }

    // Step 2: Route based on review result
    switch (reviewResult.outcome) {
      case 'approved':
        // Handled entirely in code — done
        console.log(`[REVIEW] Issue #${reviewResult.issueNumber} approved and routed. Exiting.`);
        return;

      case 'feedback':
        // Needs LLM to iterate on spec — skip PLANNING
        console.log(`[REVIEW] Invoking LLM for spec iteration on issue #${reviewResult.issueNumber}...`);
        await runAgent('Architect (Review)', buildReviewPrompt(reviewResult.issue), agentOptions);
        return;

      case 'waiting-for-reply':
        // No actionable reviews — fall through to PLANNING
        console.log(`[REVIEW] Issue #${reviewResult.issueNumber} waiting for reply. Proceeding to PLANNING.`);
        break;

      case 'no-review-issues':
        // No review issues at all — fall through to PLANNING
        break;
    }

    // Step 3: PLANNING flow (only reached when no reviews needed attention)
    if (!hasTriagedIssues()) {
      console.log('[PLANNING] No triaged issues found. Skipping LLM.');
      return;
    }
    await runAgent('Architect (Planning)', PLANNING_PROMPT, agentOptions);
  } finally {
    // === CLEANUP: Restore original state (Issue #7) ===
    if (gitState) {
      console.log('[PLANNER] Restoring original git state...');
      const restoration = restorePreviousState(gitState, targetCwd);
      if (!restoration.success) {
        console.warn('[PLANNER] Warning: Failed to restore git state:', restoration.message);
        console.warn('[PLANNER] You may need to manually checkout your original branch and restore stashed changes.');
      }
    }
  }
})().catch(console.error);
