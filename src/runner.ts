import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

export async function runAgent(agentName: string, prompt: string, options: Options) {
  console.log(`[${agentName}] Starting Pipeline...`);

  const stream = query({ prompt, options });

  try {
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
  } catch (error) {
    console.error(`[${agentName}] encountered an error:`, error);
  }
}
