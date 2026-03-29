/**
 * Extract prior conversation history for a subagent from Remy's message history.
 *
 * Subagent messages are stored on tool ContentBlocks (block.subAgentMessages)
 * in Remy's conversation. This function collects all prior exchanges for a
 * given subagent name, in order, so the subagent can resume with full context.
 */

import type { Message, ContentBlock } from '../../api.js';

export function getSubAgentHistory(
  messages: Message[],
  subAgentName: string,
): Message[] {
  const history: Message[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }

    for (const block of msg.content as ContentBlock[]) {
      if (
        block.type === 'tool' &&
        block.name === subAgentName &&
        block.subAgentMessages?.length
      ) {
        history.push(...block.subAgentMessages);
      }
    }
  }

  return history;
}
