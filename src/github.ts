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
export function hasHumanReplyAfterBot(comments: GitHubIssue['comments']): boolean {
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
