import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

function isOverloadedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('overloaded_error');
}

export async function runAgent(agentName: string, prompt: string, options: Options) {
  console.log(`[${agentName}] Starting Pipeline...`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = query({ prompt, options });

      for await (const message of stream) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              console.log(`[Reasoning]: ${block.text}`);
            } else if (block.type === 'tool_use') {
              console.log(`[Tool Call]: Initiating ${block.name}...`);
            }
          }
        } else if (message.type === 'result') {
          console.log(`[${agentName}] Pipeline execution complete.`);
        }
      }
      return;
    } catch (error) {
      if (isOverloadedError(error) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[${agentName}] API overloaded. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[${agentName}] encountered an error:`, error);
        return;
      }
    }
  }
}
