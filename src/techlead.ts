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

  // Query BOTH needs-review AND needs-tech-lead issues (dual trigger)
  const needsReviewIssues = ghTarget('issue list --search "is:open label:needs-review" --limit 10 --json number,title,labels');
  const needsTechLeadIssues = ghTarget('issue list --search "is:open label:needs-tech-lead" --limit 10 --json number,title,labels');

  // Merge and deduplicate
  const allIssues = [...(needsReviewIssues || []), ...(needsTechLeadIssues || [])];
  const uniqueIssues = Array.from(new Map(allIssues.map(i => [i.number, i])).values());

  if (uniqueIssues.length === 0) {
    console.log('[Tech Lead] No specs awaiting review. Exiting.');
    return;
  }

  console.log(`[Tech Lead] Found ${uniqueIssues.length} issue(s) with needs-review or needs-tech-lead label.`);

  const lastReview = loadLastReview();
  let reviewed = false;

  for (const listIssue of uniqueIssues) {
    const issueNumber = listIssue.number;
    const specPath = getSpecFilePath(issueNumber);

    // Check if spec file exists
    if (!fs.existsSync(specPath)) {
      console.log(`[Tech Lead] Issue #${issueNumber}: No TECH_SPEC file found, skipping.`);
      continue;
    }

    // Check if already reviewed
    const priorReview = lastReview.reviewed_specs.find(r => r.spec_number === issueNumber);
    const hasNeedsTechLeadLabel = listIssue.labels.some((l: any) => l.name === 'needs-tech-lead');
    const specModified = priorReview && hasSpecBeenModified(issueNumber, priorReview.timestamp);

    // Re-review if: (1) never reviewed, (2) spec modified, OR (3) explicit needs-tech-lead label
    if (priorReview && !specModified && !hasNeedsTechLeadLabel) {
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
