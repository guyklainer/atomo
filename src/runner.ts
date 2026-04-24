import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const atomoCwd = path.join(__dirname, '..');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getNow(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendEvent(jsonlPath: string, event: Record<string, unknown>): void {
  fs.appendFileSync(jsonlPath, JSON.stringify(event) + '\n', 'utf-8');
}

function isOverloadedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('overloaded_error');
}

export async function runAgent(agentName: string, prompt: string, options: Options) {
  const today = getTodayString();
  const runId = `${agentName.slice(0, 3).toLowerCase()}-${Date.now()}`;
  const startTime = Date.now();

  // Set up daily log paths (scoped to Atomo repo, never TARGET_REPO_PATH)
  const logDir = path.join(atomoCwd, 'logs', agentName);
  const eventsDir = path.join(atomoCwd, 'logs', 'events');
  ensureDir(logDir);
  ensureDir(eventsDir);

  const logPath = path.join(logDir, `${today}.log`);
  const jsonlPath = path.join(eventsDir, `${today}.jsonl`);

  // log() writes to both stdout (for cron capture) and the dated log file
  function log(line: string): void {
    console.log(line);
    fs.appendFileSync(logPath, line + '\n', 'utf-8');
  }

  log(`[${agentName}] Starting Pipeline...`);
  appendEvent(jsonlPath, {
    ts: getNow(), run_id: runId, agent: agentName, event: 'run_start',
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = query({ prompt, options });

      for await (const message of stream) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              log(`[Reasoning]: ${block.text}`);
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'reasoning', chars: block.text.length,
              });
            } else if (block.type === 'tool_use') {
              log(`[Tool Call]: Initiating ${block.name}...`);
              appendEvent(jsonlPath, {
                ts: getNow(), run_id: runId, agent: agentName,
                event: 'tool_call', tool: block.name,
              });
            }
          }
        } else if (message.type === 'result') {
          log(`[${agentName}] Pipeline execution complete.`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = (message as any).usage ?? null;
          appendEvent(jsonlPath, {
            ts: getNow(), run_id: runId, agent: agentName,
            event: 'run_complete',
            input_tokens: usage?.input_tokens ?? null,
            output_tokens: usage?.output_tokens ?? null,
            duration_ms: Date.now() - startTime,
            status: 'ok',
          });
        }
      }
      return;

    } catch (error) {
      if (isOverloadedError(error) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log(`[${agentName}] API overloaded. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'api_error', type: 'overloaded', attempt,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        log(`[${agentName}] encountered an error: ${String(error)}`);
        appendEvent(jsonlPath, {
          ts: getNow(), run_id: runId, agent: agentName,
          event: 'run_complete',
          input_tokens: null, output_tokens: null,
          duration_ms: Date.now() - startTime,
          status: 'error',
        });
        return;
      }
    }
  }
}
