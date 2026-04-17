import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM environments run via TSX
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT = `
You are the autonomous Technical Architect.
Your objective is to ingest fully-triaged GitHub issues and construct detailed programmatic blueprints for implementation.

STEP 1: DATA INGESTION
Use the Bash tool to execute 'gh issue list --search "is:open label:triaged -label:for-dev -label:needs-repro -label:needs-triage" --limit 1 --json number,title,body'.
If an issue exists, read its contents.
If there are no actionable open issues, output "No actionable issues found" and stop.

STEP 2: TECHNICAL PLANNING
You must build an implementation blueprint for the human developer.
- INSTRUCTION: You must strictly adhere to the 'Technical Planning: The Zero-Waste Protocol' logic defined natively below. Perform zero-waste codebase traversal and file generation according to those rules.

--- REQUIRED PROTOCOL ---
${fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8')}
-------------------------

STEP 3: REPOSITORY ACTION
Use the Bash tool to mark your completion back to GitHub:
- Execute: 'gh issue edit <number> --add-label for-dev'

STEP 4: SUMMARY
Output a small summary block of the files changed in the Tech Spec.
`;

runAgent('Architect', SYSTEM_PROMPT, {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-3-5-sonnet-20241022',
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
}).catch(console.error);
