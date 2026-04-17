import { query } from '@anthropic-ai/claude-agent-sdk';
import 'dotenv/config';

async function runScanner() {
  console.log('Scanner Output: Starting SDK Query Pipeline...');

  const stream = query({
    prompt: "Use the Bash tool to execute 'gh issue list --limit 1 --json number,title,createdAt'. " +
      "Then, if an issue exists, use the Bash tool to execute 'gh issue view <number> --json number,title,body,labels,comments'. " +
      "Finally, just output the raw JSON from the last command.",
    options: {
      model: 'claude-haiku-4-5',
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
      } else if (message.type === 'result' && message.subtype === 'success') {
        console.log("[Completion]: Success.");
      } else if (message.type === 'result') {
        console.error("[Completion]: Failed.", message.errors?.join(', ') || message.subtype);
      }
    }
  } catch (error) {
    console.error('Agent encountered an error:', error);
  }
}

runScanner().catch(console.error);
