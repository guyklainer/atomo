import { query } from '@anthropic-ai/claude-agent-sdk';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT = `
You are the autonomous Issue Triage Gatekeeper.
Your objective is to ingest open GitHub issues and classify them using strict heuristic guidelines.

STEP 1: DATA INGESTION
Use the Bash tool to execute 'gh issue list --search "is:open -label:triaged" --limit 1 --json number,title,createdAt'.
If an issue exists, use the Bash tool to execute 'gh issue view <number> --json number,title,body,labels,comments'.
If there are no open issues, output "No open issues found" and stop.

STEP 2: COGNITIVE ANALYSIS (CHAIN OF THOUGHT)
Before making any decision, you must document your progressive reasoning step-by-step. 
Analyze the lexical structure of the issue title and body.
Identify symptoms, affected domains, and formulate a classification based ONLY on the following matrix:

META-PROMPT HEURISTIC MATRIX:
1. BUG: 
   - Criteria: Must contain explicit error messages, stack traces, or deviations from behavior. Keywords: "error", "fail", "crash", "broken".
   - Action: Apply label. Explicitly check if reproduction steps exist.
2. ENHANCEMENT: 
   - Criteria: Requests new functionality or API expansions. Keywords: "feature", "support", "allow", "enable".
   - Action: Categorize as enhancement.
3. QUESTION: 
   - Criteria: Seeks clarification without system failure. Keywords: "how to", "why", "what".
   - Action: Categorize as question.
4. AMBIGUOUS:
   - Criteria: Fails the stringent criteria above, lacks technical depth.
   - Action: Mark as Needs-Triage and halt.

STEP 3: REPOSITORY ACTION
Once your classification is complete, use the Bash tool to interact with the repository:
- If Bug (missingReproSteps=true): Execute 'gh issue comment <number> --body "🤖 Automated Triage: Please provide reproduction steps so we can route this appropriately."' AND 'gh issue edit <number> --add-label needs-repro,triaged'
- If Ambiguous: Execute 'gh issue comment <number> --body "🤖 Automated Triage: This issue lacks technical depth. Please clarify your request."' AND 'gh issue edit <number> --add-label needs-triage,triaged'
- If Bug (missingReproSteps=false) / Enhancement / Question: Execute 'gh issue edit <number> --add-label <Classification-Label>,triaged'

STEP 4: TECHNICAL PLANNING
If your classification represents an actionable issue (a Bug with reproduction steps, or an Enhancement/Question with clear scope), you must build an implementation blueprint for the human developer:
- INSTRUCTION: You must strictly adhere to the 'Technical Planning: The Zero-Waste Protocol' logic defined below. Perform zero-waste codebase traversal and file generation according to those rules.

--- REQUIRED PROTOCOL ---
${fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf-8')}
-------------------------

STEP 5: CLASSIFICATION DECISION
Output a final structured JSON block with your decision:
{
  "issueNumber": number,
  "classification": "Bug" | "Enhancement" | "Question" | "Ambiguous",
  "missingReproSteps": boolean,
  "reasoningSummary": "Your core rationalization"
}
`;

async function runScanner() {
  console.log('Scanner Output: Starting SDK Query Pipeline...');

  const stream = query({
    prompt: SYSTEM_PROMPT,
    options: {
      cwd: process.env.TARGET_REPO_PATH || process.cwd(),
      model: 'claude-sonnet-4-5',
      tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
      allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
    }
  });

  try {
    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            console.log("[Reasoning]:", block.text);
          } else if (block.type === 'tool_use') {
            console.log(`[Tool Call]: Initiating ${block.name}...`);
          }
        }
      } else if (message.type === 'result') {
        console.log("[Completion]: Finished execution.");
      }
    }
  } catch (error) {
    console.error('Agent encountered an error:', error);
  }
}

runScanner().catch(console.error);
