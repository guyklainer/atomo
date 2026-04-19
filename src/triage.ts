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
const TRIAGE_PROTO = loadProtocol('triage');
const CONFIDENCE_PROTO = loadProtocol('confidence_gate');
const REEVALUATION_PROTO = loadProtocol('reevaluation');

// ─────────────────────────────────────────────────────────────────
// FLOW B: DETERMINISTIC PRE-PROCESSING (runs before LLM invocation)
// ─────────────────────────────────────────────────────────────────

// Type definitions for GitHub CLI responses
interface GitHubIssue {
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
 * Execute GitHub CLI command and parse JSON response
 */
function gh(command: string): any {
  try {
    const result = execSync(`gh ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'inherit'] // Inherit stderr for visibility
    });
    return command.includes('--json') ? JSON.parse(result) : result;
  } catch (error) {
    console.error(`[GH CLI Error]: ${command}`, error);
    throw error;
  }
}

/**
 * Detect if a human has replied after the last bot comment
 * Per reevaluation protocol: Find last comment starting with 🤖,
 * then check if any subsequent comments exist that don't start with 🤖
 */
function hasHumanReplyAfterBot(comments: GitHubIssue['comments']): boolean {
  if (!comments || comments.length === 0) return false;

  // Scan in reverse to find last bot comment
  let lastBotIndex = -1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment && comment.body.trim().startsWith('🤖')) {
      lastBotIndex = i;
      break;
    }
  }

  // If no bot comment found, any comment counts as human reply
  if (lastBotIndex === -1) {
    return comments.length > 0;
  }

  // Check if there are comments after the last bot comment
  for (let i = lastBotIndex + 1; i < comments.length; i++) {
    const comment = comments[i];
    if (comment && !comment.body.trim().startsWith('🤖')) {
      return true;
    }
  }

  return false;
}

/**
 * Determine which agent paused this issue based on labels
 * Per reevaluation protocol step 4:
 * - No 'triaged' label → Gatekeeper paused it
 * - Has 'triaged' but no 'for-dev' → Architect paused it
 */
function detectPausingAgent(labels: Array<{ name: string }>): 'gatekeeper' | 'architect' | null {
  const labelNames = labels.map(l => l.name);
  const hasTriaged = labelNames.includes('triaged');
  const hasForDev = labelNames.includes('for-dev');

  if (!hasTriaged) {
    return 'gatekeeper'; // Paused before classification
  } else if (hasTriaged && !hasForDev) {
    return 'architect'; // Paused after classification, before planning
  }

  return null; // Shouldn't happen for needs-info issues, but handle gracefully
}

/**
 * FLOW B: Re-evaluate needs-info issues (deterministic pre-processing)
 * Handles Architect Re-Entry fully in code.
 * For Gatekeeper Re-Entry, removes needs-info label and lets FLOW A re-process.
 */
async function handleNeedsInfoIssues(): Promise<void> {
  console.log('[FLOW B] Checking needs-info issues...');

  // Step 1: Query for pending issues
  const issues: GitHubIssue[] = gh(
    'issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt'
  );

  if (!issues || issues.length === 0) {
    console.log('[FLOW B] No needs-info issues found.');
    return;
  }

  console.log(`[FLOW B] Found ${issues.length} needs-info issue(s)`);

  // Process each issue
  for (const issue of issues) {
    console.log(`[FLOW B] Processing issue #${issue.number}...`);

    // Step 2: Fetch full details
    const fullIssue: GitHubIssue = gh(
      `issue view ${issue.number} --json number,title,body,labels,comments`
    );

    // Step 3: Detect human reply
    const hasReply = hasHumanReplyAfterBot(fullIssue.comments);

    if (!hasReply) {
      console.log(`[FLOW B] Issue #${issue.number}: No human reply yet, skipping.`);
      continue;
    }

    console.log(`[FLOW B] Issue #${issue.number}: Human reply detected!`);

    // Step 4: Determine which agent paused it
    const pausingAgent = detectPausingAgent(fullIssue.labels);

    if (pausingAgent === 'gatekeeper') {
      // Gatekeeper Re-Entry: Remove needs-info, let FLOW A re-triage
      console.log(`[FLOW B] Issue #${issue.number}: Gatekeeper Re-Entry → Removing needs-info`);
      gh(`issue edit ${issue.number} --remove-label needs-info`);
      // FLOW A will pick this up as untriaged (no 'triaged' label) and re-classify with new context

    } else if (pausingAgent === 'architect') {
      // Architect Re-Entry: Complete handling here (no LLM needed)
      console.log(`[FLOW B] Issue #${issue.number}: Architect Re-Entry → Routing back to Architect`);
      gh(`issue edit ${issue.number} --remove-label needs-info`);
      gh(`issue comment ${issue.number} --body "🤖 Clarification received. Routing back to the Architect for planning."`);
      // Architect will pick this up on next run (has 'triaged', no 'for-dev', no 'needs-info')

    } else {
      console.warn(`[FLOW B] Issue #${issue.number}: Unexpected state (pausing agent: ${pausingAgent}), skipping.`);
    }
  }

  console.log('[FLOW B] Re-evaluation complete.');
}

// ─────────────────────────────────────────────────────────────────
// SYSTEM PROMPT (FLOW A only - FLOW B now runs in code above)
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the autonomous Triage Gatekeeper.
Your objective is to ingest open GitHub issues and classify them using strict heuristic guidelines.
FLOW B (needs-info re-evaluation) is now handled before you run, so focus only on FLOW A below.

---

## FLOW A — Triage New Issues

### STEP A1: DATA INGESTION
Use the Bash tool to execute:
  gh issue list --search "is:open -label:triaged -label:for-dev" --limit 1 --json number,title,createdAt

If an issue exists, fetch its full detail:
  gh issue view <number> --json number,title,body,labels,comments

If there are no open untriaged issues, you're done.

### STEP A2: COGNITIVE ANALYSIS (CHAIN OF THOUGHT)
Document your reasoning step-by-step. Apply the 'Meta-Prompt Heuristic Matrix' defined in the injected Triage Protocol rules to classify the issue.

### STEP A3: CONFIDENCE GATE
Before acting, apply the Confidence Gate Protocol defined in the injected rules below.
Calculate your confidence score. If score < 85, do NOT label the issue — instead post a needs-info comment and label needs-info.

### STEP A4: REPOSITORY ACTION (only if confidence >= 85)
Use the Bash tool to interact with the repository:
- If Bug (missingReproSteps=true): Execute 'gh issue comment <number> --body "🤖 Automated Triage: Please provide reproduction steps so we can route this appropriately."' AND 'gh issue edit <number> --add-label needs-repro,triaged'
- If Ambiguous: Execute 'gh issue comment <number> --body "🤖 Automated Triage: This issue lacks technical depth. Please clarify your request."' AND 'gh issue edit <number> --add-label needs-triage,triaged'
- If Bug (missingReproSteps=false) / Enhancement / Question: Execute 'gh issue edit <number> --add-label <Classification-Label>,triaged'

### STEP A5: CLASSIFICATION DECISION
Output a structured JSON block:
{
  "flow": "A",
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

---

${REEVALUATION_PROTO}
`;

// ─────────────────────────────────────────────────────────────────
// MAIN EXECUTION: Run FLOW B (deterministic), then FLOW A (LLM)
// ─────────────────────────────────────────────────────────────────

// Execute FLOW B (needs-info re-evaluation) BEFORE invoking LLM
(async () => {
  try {
    await handleNeedsInfoIssues(); // Deterministic pre-processing
  } catch (error) {
    console.error('[FLOW B] Error during needs-info handling:', error);
    // Continue to FLOW A even if FLOW B fails (they're independent)
  }

  // Now execute FLOW A (triage new issues) via LLM
  await runAgent('Gatekeeper', SYSTEM_PROMPT, {
    model: 'claude-haiku-4-5',
    tools: ['Bash'],
    allowedTools: ['Bash']
  });
})().catch(console.error);
