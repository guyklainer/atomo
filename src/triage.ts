import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';
import { gh, hasHumanReplyAfterBot, type GitHubIssue } from './github.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();

const loadProtocol = (name: string) => fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

const CLAUDE_MD = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8');
const TRIAGE_PROTO = loadProtocol('triage');
const CONFIDENCE_PROTO = loadProtocol('confidence_gate');

// ─────────────────────────────────────────────────────────────────
// PRE-PROCESSING: Re-evaluate needs-info issues (deterministic)
// ─────────────────────────────────────────────────────────────────

/**
 * Determine which agent paused this issue based on labels.
 * - No 'triaged' label → Gatekeeper paused it
 * - Has 'triaged' but no 'for-dev' → Architect paused it
 */
function detectPausingAgent(labels: Array<{ name: string }>): 'gatekeeper' | 'architect' | null {
  const labelNames = labels.map(l => l.name);
  const hasTriaged = labelNames.includes('triaged');
  const hasForDev = labelNames.includes('for-dev');

  if (!hasTriaged) {
    return 'gatekeeper';
  } else if (hasTriaged && !hasForDev) {
    return 'architect';
  }

  return null;
}

/**
 * Re-evaluate issues waiting for human clarification.
 * - Gatekeeper Re-Entry: removes needs-info so the LLM re-triages the issue.
 * - Architect Re-Entry: removes needs-info and routes back to the Architect.
 */
async function reEvaluateNeedsInfo(): Promise<void> {
  console.log('[pre-processing] Checking needs-info issues...');

  const issues: GitHubIssue[] = gh(
    'issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt',
    targetCwd
  );

  if (!issues || issues.length === 0) {
    console.log('[pre-processing] No needs-info issues found.');
    return;
  }

  console.log(`[pre-processing] Found ${issues.length} needs-info issue(s)`);

  for (const issue of issues) {
    console.log(`[pre-processing] Processing issue #${issue.number}...`);

    const fullIssue: GitHubIssue = gh(
      `issue view ${issue.number} --json number,title,body,labels,comments`,
      targetCwd
    );

    const hasReply = hasHumanReplyAfterBot(fullIssue.comments);

    if (!hasReply) {
      console.log(`[pre-processing] Issue #${issue.number}: No human reply yet, skipping.`);
      continue;
    }

    console.log(`[pre-processing] Issue #${issue.number}: Human reply detected!`);

    const pausingAgent = detectPausingAgent(fullIssue.labels);

    if (pausingAgent === 'gatekeeper') {
      console.log(`[pre-processing] Issue #${issue.number}: Gatekeeper re-entry → removing needs-info`);
      gh(`issue edit ${issue.number} --remove-label needs-info`, targetCwd);

    } else if (pausingAgent === 'architect') {
      console.log(`[pre-processing] Issue #${issue.number}: Architect re-entry → routing back to Architect`);
      gh(`issue edit ${issue.number} --remove-label needs-info`, targetCwd);
      gh(`issue comment ${issue.number} --body "🤖 Clarification received. Routing back to the Architect for planning."`, targetCwd);

    } else {
      console.warn(`[pre-processing] Issue #${issue.number}: Unexpected label state, skipping.`);
    }
  }

  console.log('[pre-processing] Re-evaluation complete.');
}

// ─────────────────────────────────────────────────────────────────
// LLM AGENT: Triage new issues
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the autonomous Triage Gatekeeper.
Your objective is to ingest open GitHub issues and classify them using strict heuristic guidelines.

---

### STEP 1: DATA INGESTION
Use the Bash tool to execute:
  gh issue list --search "is:open -label:triaged -label:for-dev" --limit 1 --json number,title,createdAt

If an issue exists, fetch its full detail:
  gh issue view <number> --json number,title,body,labels,comments

If there are no open untriaged issues, you're done.

### STEP 2: COGNITIVE ANALYSIS (CHAIN OF THOUGHT)
Document your reasoning step-by-step. Apply the 'Meta-Prompt Heuristic Matrix' defined in the injected Triage Protocol rules to classify the issue.

### STEP 3: CONFIDENCE GATE
Before acting, apply the Confidence Gate Protocol defined in the injected rules below.
Calculate your confidence score.

IMPORTANT: Before posting a needs-info comment, check the issue comments for a prior needs-info exchange
(a 🤖 comment asking for clarification followed by a human reply). If clarification was already provided,
do NOT ask again — proceed to STEP 4 with the information available, even if confidence is below 85.
You may only post a NEW needs-info if no prior clarification exchange exists in the comments.

If score < 85 AND no prior clarification was provided:
- Post a needs-info comment and add ONLY the 'needs-info' label (do NOT add 'triaged').
- Do NOT proceed to STEP 4.

### STEP 4: REPOSITORY ACTION (only if confidence >= 85, OR prior clarification was already provided)
Use the Bash tool to interact with the repository:
- If Bug (missingReproSteps=true) AND no prior clarification exists: Execute 'gh issue comment <number> --body "🤖 Automated Triage: Please provide reproduction steps so we can route this appropriately."' AND 'gh issue edit <number> --add-label needs-repro' (do NOT add 'triaged')
- If Ambiguous AND no prior clarification exists: Execute 'gh issue comment <number> --body "🤖 Automated Triage: This issue lacks technical depth. Please clarify your request."' AND 'gh issue edit <number> --add-label needs-triage' (do NOT add 'triaged')
- If prior clarification was already provided: Do NOT post a clarifying comment. Classify using your best judgment based on the available context, and execute 'gh issue edit <number> --add-label <Classification-Label>,triaged'
- If Bug (missingReproSteps=false) / Enhancement / Question: Execute 'gh issue edit <number> --add-label <Classification-Label>,triaged'

### STEP 5: CLASSIFICATION DECISION
Output a structured JSON block:
{
  "issueNumber": <number>,
  "classification": "Bug" | "Enhancement" | "Question" | "Ambiguous",
  "confidenceScore": <0-100>,
  "action": "labeled" | "needs-info-posted" | "skipped-no-issues",
  "missingReproSteps": <boolean>,
  "reasoningSummary": "..."
}

---

## INJECTED PROTOCOL RULES
${CLAUDE_MD}

---

${TRIAGE_PROTO}

---

${CONFIDENCE_PROTO}

`;

/**
 * Check if there are untriaged issues that need LLM classification.
 */
function hasUntriagedIssues(): boolean {
  const issues: GitHubIssue[] = gh(
    'issue list --search "is:open -label:triaged -label:for-dev" --limit 1 --json number',
    targetCwd
  );
  return issues && issues.length > 0;
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    await reEvaluateNeedsInfo();
  } catch (error) {
    console.error('[pre-processing] Error during needs-info handling:', error);
  }

  if (!hasUntriagedIssues()) {
    console.log('[Gatekeeper] No untriaged issues found. Skipping LLM invocation.');
    return;
  }

  await runAgent('Gatekeeper', SYSTEM_PROMPT, {
    model: 'claude-haiku-4-5',
    tools: ['Bash'],
    allowedTools: ['Bash']
  });
})().catch(console.error);
