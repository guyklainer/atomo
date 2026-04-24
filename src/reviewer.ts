import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const atomoCwd = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface JsonlEvent {
  ts: string;
  run_id: string;
  agent: string;
  event: 'run_start' | 'tool_call' | 'reasoning' | 'api_error' | 'run_complete';
  tool?: string;
  chars?: number;
  type?: string;
  attempt?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  duration_ms?: number;
  status?: 'ok' | 'error';
}

interface AgentStats {
  agentName: string;
  runs: number;
  okRuns: number;
  errorRuns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallsByName: Record<string, number>;
  reasoningCharsTotal: number;
  reasoningBlockCount: number;
  apiErrors: number;
  durationMs: number[];
}

// ─────────────────────────────────────────────────────────────────
// JSONL delta reader
// ─────────────────────────────────────────────────────────────────

function readDeltaEvents(since: string): JsonlEvent[] {
  const eventsDir = path.join(atomoCwd, 'logs', 'events');
  if (!fs.existsSync(eventsDir)) return [];

  const sinceDate = new Date(since);
  const allEvents: JsonlEvent[] = [];

  const files = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort(); // chronological

  for (const file of files) {
    const fileDateStr = file.replace('.jsonl', ''); // YYYY-MM-DD
    const fileDate = new Date(fileDateStr + 'T00:00:00.000Z');
    // Skip files entirely before the since date (whole-day optimization)
    const sinceDayStart = new Date(sinceDate.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    if (fileDate < sinceDayStart) continue;

    const content = fs.readFileSync(path.join(eventsDir, file), 'utf-8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const event: JsonlEvent = JSON.parse(line);
        if (new Date(event.ts) > sinceDate) {
          allEvents.push(event);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return allEvents;
}

// ─────────────────────────────────────────────────────────────────
// Pre-aggregation (TypeScript math — reliable, no LLM for counting)
// ─────────────────────────────────────────────────────────────────

function aggregateByAgent(events: JsonlEvent[]): Record<string, AgentStats> {
  const stats: Record<string, AgentStats> = {};

  for (const event of events) {
    const name = event.agent;
    if (!stats[name]) {
      stats[name] = {
        agentName: name,
        runs: 0,
        okRuns: 0,
        errorRuns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallsByName: {},
        reasoningCharsTotal: 0,
        reasoningBlockCount: 0,
        apiErrors: 0,
        durationMs: [],
      };
    }
    const s = stats[name]!;

    switch (event.event) {
      case 'run_start':
        s.runs++;
        break;
      case 'tool_call':
        if (event.tool) {
          s.toolCallsByName[event.tool] = (s.toolCallsByName[event.tool] ?? 0) + 1;
        }
        break;
      case 'reasoning':
        s.reasoningCharsTotal += event.chars ?? 0;
        s.reasoningBlockCount++;
        break;
      case 'api_error':
        s.apiErrors++;
        break;
      case 'run_complete':
        if (event.status === 'ok') s.okRuns++;
        else s.errorRuns++;
        s.totalInputTokens += event.input_tokens ?? 0;
        s.totalOutputTokens += event.output_tokens ?? 0;
        if (event.duration_ms != null) s.durationMs.push(event.duration_ms);
        break;
    }
  }

  return stats;
}

function formatStats(stats: Record<string, AgentStats>): string {
  if (Object.keys(stats).length === 0) return '(no agent runs in delta)';

  return Object.values(stats).map(s => {
    const toolBreakdown = Object.entries(s.toolCallsByName)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return [
      `Agent: ${s.agentName}`,
      `  runs: ${s.runs}`,
      `  ok_runs: ${s.okRuns}`,
      `  error_runs: ${s.errorRuns}`,
      `  total_input_tokens: ${s.totalInputTokens}`,
      `  total_output_tokens: ${s.totalOutputTokens}`,
      `  tool_calls_by_name: { ${toolBreakdown || 'none'} }`,
      `  reasoning_chars_total: ${s.reasoningCharsTotal}`,
      `  reasoning_block_count: ${s.reasoningBlockCount}`,
      `  api_errors: ${s.apiErrors}`,
      `  durations_ms: [${s.durationMs.join(', ')}]`,
    ].join('\n');
  }).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

(async () => {
  const lastReviewPath = path.join(atomoCwd, 'reviewer_context', 'last_review.json');
  const thresholdsPath = path.join(atomoCwd, 'reviewer_context', 'thresholds.json');
  const reviewerProtoPath = path.join(atomoCwd, 'protocols', 'reviewer.md');

  const lastReview = JSON.parse(fs.readFileSync(lastReviewPath, 'utf-8')) as {
    last_reviewed_at: string;
    cooldowns: Record<string, string>;
  };
  const thresholds = fs.readFileSync(thresholdsPath, 'utf-8');
  const reviewerProto = fs.readFileSync(reviewerProtoPath, 'utf-8');

  const since = lastReview.last_reviewed_at;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  console.log(`[Reviewer] Reading delta since ${since}...`);
  const events = readDeltaEvents(since);

  if (events.length === 0) {
    console.log('[Reviewer] No delta since last run. Exiting.');
    return;
  }

  console.log(`[Reviewer] ${events.length} events found. Pre-aggregating...`);
  const stats = aggregateByAgent(events);
  const statsStr = formatStats(stats);
  const cooldownsStr = JSON.stringify(lastReview.cooldowns, null, 2);

  // Determine Atomo repo slug for gh pr create
  let repoSlug = '';
  try {
    const { execSync } = await import('child_process');
    const remote = execSync(`git -C ${atomoCwd} remote get-url origin`, { encoding: 'utf-8' }).trim();
    // Parse slug from https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    repoSlug = match ? (match[1] ?? '') : '';
  } catch {
    repoSlug = '(unknown — omit --repo flag from gh pr create)';
  }

  const PROMPT = `
You are the Atomo Performance Reviewer.

## Your Task

Analyze the performance delta for all Atomo agents and produce the three-tier output
defined in your protocol: report, hint files, and optionally a protocol PR.

## atomoCwd (Atomo repo path — use for ALL write/git/gh operations)
${atomoCwd}

## Atomo repo slug (for gh pr create --repo)
${repoSlug}

## Delta Window
- From: ${since}
- To: ${now}
- Report date: ${today}

## Pre-Aggregated Event Stats
${statsStr}

## Thresholds
${thresholds}

## Active Cooldowns (signals suppressed until their expiry date)
${cooldownsStr}

---

## Your Protocol

${reviewerProto}
`;

  await runAgent('Reviewer', PROMPT, {
    model: 'claude-sonnet-4-6',
    tools: ['Read', 'Write', 'Edit', 'Bash'],
    allowedTools: ['Read', 'Write', 'Edit', 'Bash'],
  });
})().catch(console.error);
