import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM environments run via tsx
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadProtocol = (name: string) => fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

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

runAgent('AtomoDev', SYSTEM_PROMPT, {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-sonnet-4-5',
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
}).catch(console.error);
