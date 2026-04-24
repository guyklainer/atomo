// scripts/verify-events.ts
// Run after any agent run to verify JSONL event output is correct.
// Usage: npx tsx scripts/verify-events.ts logs/events/YYYY-MM-DD.jsonl triage
import fs from 'fs';
import assert from 'assert';

const [,, jsonlPath, agentName] = process.argv;
if (!jsonlPath || !agentName) {
  console.error('Usage: npx tsx scripts/verify-events.ts <jsonl-path> <agent-name>');
  process.exit(1);
}

const agentNameStr = agentName as string;
const jsonlPathStr = jsonlPath as string;

if (!fs.existsSync(jsonlPathStr)) {
  console.error(`FAIL: JSONL file not found: ${jsonlPathStr}`);
  process.exit(1);
}

const lines = fs.readFileSync(jsonlPathStr, 'utf-8').trim().split('\n').filter(Boolean);
const events: any[] = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  try {
    events.push(JSON.parse(line));
  } catch {
    console.error(`FAIL: Invalid JSON on line ${i + 1}: ${line}`);
    process.exit(1);
  }
}

const agentEvents = events.filter((e: any) => e.agent === agentNameStr);

assert(agentEvents.length > 0, `No events found for agent "${agentNameStr}"`);

const startEvents = agentEvents.filter((e: any) => e.event === 'run_start');
assert(startEvents.length > 0, 'Missing run_start event');
assert(typeof startEvents[0].run_id === 'string', 'run_start missing run_id');
assert(typeof startEvents[0].ts === 'string', 'run_start missing ts');

const completeEvents = agentEvents.filter((e: any) => e.event === 'run_complete');
assert(completeEvents.length > 0, 'Missing run_complete event');
const complete = completeEvents[0];
assert(typeof complete.duration_ms === 'number', 'run_complete missing duration_ms');
assert(complete.status === 'ok' || complete.status === 'error', 'run_complete invalid status');
assert('input_tokens' in complete, 'run_complete missing input_tokens');
assert('output_tokens' in complete, 'run_complete missing output_tokens');

const toolEvents = agentEvents.filter((e: any) => e.event === 'tool_call');
toolEvents.forEach((e: any) => {
  assert(typeof e.tool === 'string', 'tool_call missing tool name');
  assert(typeof e.run_id === 'string', 'tool_call missing run_id');
});

const reasoningEvents = agentEvents.filter((e: any) => e.event === 'reasoning');
reasoningEvents.forEach((e: any) => {
  assert(typeof e.chars === 'number', 'reasoning missing chars');
});

console.log(`✅ PASS: ${agentEvents.length} events for "${agentNameStr}" — structure valid`);
console.log(`   run_start: ${startEvents.length}, tool_calls: ${toolEvents.length}, reasoning: ${reasoningEvents.length}, run_complete: ${completeEvents.length}`);
