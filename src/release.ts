import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { gh, type GitHubPR } from './github.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();

const loadProtocol = (name: string) => {
  const protocolPath = path.join(__dirname, `../protocols/${name}.md`);
  return fs.existsSync(protocolPath)
    ? fs.readFileSync(protocolPath, 'utf-8')
    : '';
};

const RELEASE_PROTO = loadProtocol('release');
const CLAUDE_MD = fs.existsSync(path.join(__dirname, '../CLAUDE.md'))
  ? fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8')
  : '';

const SYSTEM_PROMPT = `
You are the autonomous Release Manager agent.
Your objective is to detect approved PRs, merge them, and execute the full release workflow.

Follow the 'Release Management Protocol' defined in the RELEASE_PROTO injected below.

---

## INJECTED PROTOCOL RULES
${RELEASE_PROTO || '(Protocol file not found — proceeding with inline fallback)'}

---

## CLAUDE.MD RULES
${CLAUDE_MD}

---

## RUNTIME CONTEXT
- Working Directory: ${targetCwd}
- You MUST use the Bash tool for all git and gh commands
- You MUST process approved PRs sequentially (oldest first)
- You MUST commit with author: "ReleaseManager <release@atomo.ai>"
- If any step fails, log the error and continue (do not abort entirely)
`;

/**
 * Deterministic pre-check: are there any approved PRs?
 * This prevents unnecessary LLM invocations when no work is needed.
 */
function hasApprovedPRs(): boolean {
  try {
    const prs: GitHubPR[] = gh(
      'pr list --state open --json number,reviews,comments',
      targetCwd
    );

    if (!prs || prs.length === 0) {
      console.log('[Release Manager] No open PRs found.');
      return false;
    }

    const approvedPRs = prs.filter(pr => {
      // Check for GitHub approval review (state=APPROVED)
      const hasApprovalReview = pr.reviews?.some(r => r.state === 'APPROVED');

      // Check for "APPROVED" comment (case-insensitive)
      const hasApprovedComment = pr.comments?.some(c =>
        /APPROVED/i.test(c.body)
      );

      return hasApprovalReview || hasApprovedComment;
    });

    if (approvedPRs.length > 0) {
      console.log(`[Release Manager] Found ${approvedPRs.length} approved PR(s): ${approvedPRs.map(p => `#${p.number}`).join(', ')}`);
      return true;
    }

    console.log('[Release Manager] No approved PRs found.');
    return false;
  } catch (error) {
    console.error('[Release Manager] Error checking for approved PRs:', error);
    // On error, return true to allow LLM to handle the situation
    return true;
  }
}

(async () => {
  console.log('[Release Manager] Starting release workflow...');

  if (!hasApprovedPRs()) {
    console.log('[Release Manager] No approved PRs. Skipping LLM invocation.');
    return;
  }

  await runAgent('ReleaseManager', SYSTEM_PROMPT, {
    model: 'claude-sonnet-4-5',
    tools: ['Bash', 'Read', 'Write', 'Grep'],
    allowedTools: ['Bash', 'Read', 'Write', 'Grep']
  });

  console.log('[Release Manager] Workflow complete.');
})().catch(err => {
  console.error('[Release Manager] Fatal error:', err);
  process.exit(1);
});
