import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM environments run via TSX
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      { encoding: 'utf-8' }
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

const targetIssue = pickHighestPriorityIssue();

if (!targetIssue) {
  console.log('[Orchestrator] No actionable for-dev issues found. Exiting.');
  process.exit(0);
}

const SYSTEM_PROMPT = `
You are the autonomous Dev Execution Agent.
Your objective is to implement the specific GitHub Issue #${targetIssue.number}: "${targetIssue.title}" which has been pre-selected with Priority Score P=${targetIssue.priority}.
Do NOT re-query for another issue. Your task is already assigned.

STEP 1: IMMUTABLE ONBOARDING
The repository's immutable laws are injected below — internalize them before acting:
--- REQUIRED PROTOCOL ---
${fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8')}
-------------------------

STEP 2: SPECIFICATION ALIGNMENT
Use the Bash tool to fetch the full issue: 'gh issue view ${targetIssue.number} --json number,title,body,comments'.
Read ALL issue comments (especially recent QA or Code Review feedback) and the associated 'docs/plans/TECH_SPEC_${targetIssue.number}.md' to fully internalize the required changes.

STEP 3: SKILL & PATTERN DISCOVERY
Use the 'Glob' tool to search '.claude/' and '.agents/' directories inside the target repository. Read any existing pattern rules that apply and adhere to them strictly.

STEP 4: COGNITIVE SIMULATION (CoT)
Before editing files, document your implementation plan in your internal context stream. Cross-reference proposed changes against existing system dependencies.

STEP 5: SURGICAL IMPLEMENTATION
Use your 'Bash', 'Read', and 'Write' tools to surgically implement the logic mandated by the Tech Spec.

STEP 6: VERIFICATION & HANDOFF
1. Use 'Bash' to run verification metrics (e.g., 'npx tsc --noEmit', tests, linters) against your changes.
2. If verification fails, fix your code.
3. If it passes, use 'Bash' to:
   - Create a new branch: git checkout -b feat/issue-${targetIssue.number}
   - Stage and commit: git add . && git commit -m "Implement Issue #${targetIssue.number}: ${targetIssue.title}"
   - Push and create PR: gh pr create --title "Resolve #${targetIssue.number}: ${targetIssue.title}" --body "Resolves #${targetIssue.number}\n\nAutomated PR implementing TECH_SPEC_${targetIssue.number}.md"
   - Edit the tracking issue: gh issue edit ${targetIssue.number} --add-label pr-ready --remove-label for-dev
4. DEPENDENCY CASCADE: Read the body of Issue #${targetIssue.number}. If it contains a line matching "Blocks: #<number>", use Bash to run: 'gh issue edit <number> --remove-label blocked'. This unblocks the next task in the dependency chain.
`;

runAgent('DevExecution', SYSTEM_PROMPT, {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-sonnet-4-5',
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
}).catch(console.error);
