import { execSync } from 'child_process';

export interface GitHubIssue {
  number: number;
  title: string;
  createdAt?: string;
  body: string;
  labels: Array<{ name: string }>;
  comments: Array<{
    body: string;
    author: { login: string };
    createdAt: string;
  }>;
}

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

/**
 * Execute GitHub CLI command and parse JSON response.
 */
export function gh(command: string, cwd?: string): any {
  try {
    const result = execSync(`gh ${command}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'inherit']
    });
    return command.includes('--json') ? JSON.parse(result) : result;
  } catch (error) {
    console.error(`[GH CLI Error]: ${command}`, error);
    throw error;
  }
}

/**
 * Status-only bot comments that don't ask for human input.
 * These should not reset the reply-detection window.
 */
const BOT_STATUS_PHRASES = [
  'Clarification received',
  'Routing back',
  'Spec approved',
  'PR approved',
  'Review feedback detected',
];

function isBotStatusComment(body: string): boolean {
  const trimmed = body.replace(/^🤖\s*/, '').trim();
  return BOT_STATUS_PHRASES.some(phrase => trimmed.startsWith(phrase));
}

/**
 * Detect if a human has replied after the last bot comment that asked for input.
 * Skips status-only bot comments (e.g. "Clarification received") so they don't
 * reset the detection window and hide the user's actual reply.
 */
export function hasHumanReplyAfterBot(comments: Array<{ body: string; author: { login: string }; createdAt: string }>): boolean {
  if (!comments || comments.length === 0) return false;

  let lastBotIndex = -1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment && comment.body.trim().startsWith('🤖') && !isBotStatusComment(comment.body)) {
      lastBotIndex = i;
      break;
    }
  }

  if (lastBotIndex === -1) return comments.length > 0;

  for (let i = lastBotIndex + 1; i < comments.length; i++) {
    const comment = comments[i];
    if (comment && !comment.body.trim().startsWith('🤖')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a PR has inline review comments newer than the last bot PR comment.
 * Inline review comments are NOT in gh --json comments — only available via REST API.
 */
export function hasNewReviewComments(prNumber: number, prComments: Array<{ body: string; createdAt: string }>, cwd?: string): boolean {
  try {
    // Find the timestamp of the last bot PR comment (our "addressed" marker)
    let lastBotTimestamp: string | null = null;
    for (let i = prComments.length - 1; i >= 0; i--) {
      const comment = prComments[i];
      if (comment && comment.body.trim().startsWith('🤖')) {
        lastBotTimestamp = comment.createdAt;
        break;
      }
    }

    // Fetch inline review comments via REST API
    const result = execSync(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments --jq '[.[] | .created_at]'`,
      { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const timestamps: string[] = JSON.parse(result.trim());

    if (timestamps.length === 0) return false;

    // If no bot comment exists yet, any review comment counts as new
    if (!lastBotTimestamp) return true;

    // Check if any review comment is newer than the last bot response
    return timestamps.some(t => t > lastBotTimestamp);
  } catch {
    return false;
  }
}

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
