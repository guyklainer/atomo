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
 * Detect if a human has replied after the last bot comment.
 * Find last comment starting with 🤖, then check for subsequent non-bot comments.
 */
export function hasHumanReplyAfterBot(comments: Array<{ body: string; author: { login: string }; createdAt: string }>): boolean {
  if (!comments || comments.length === 0) return false;

  let lastBotIndex = -1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment && comment.body.trim().startsWith('🤖')) {
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
 * Check if a PR has inline review comments (code-level comments).
 * These are NOT included in gh --json comments or reviews — only available via REST API.
 */
export function hasReviewComments(prNumber: number, cwd?: string): boolean {
  try {
    const result = execSync(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments --jq 'length'`,
      { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return parseInt(result.trim(), 10) > 0;
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
