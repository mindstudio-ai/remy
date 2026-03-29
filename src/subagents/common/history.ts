/**
 * Extract prior conversation history for a subagent from Remy's message history.
 *
 * Subagent messages are stored on tool ContentBlocks (block.subAgentMessages)
 * in Remy's conversation. This function collects all prior exchanges for a
 * given subagent name, in order, so the subagent can resume with full context.
 *
 * Respects summary checkpoints: if a summary block with the subagent's name
 * exists, only history after the last checkpoint is collected from raw messages.
 * The summary text is included as the first user message in the thread.
 */

import type { Message, ContentBlock } from '../../api.js';

export function getSubAgentHistory(
  messages: Message[],
  subAgentName: string,
): Message[] {
  // Find the last summary checkpoint for this subagent
  let checkpointIdx = -1;
  let summaryText = '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'summary' && block.name === subAgentName) {
        checkpointIdx = i;
        summaryText = block.text;
        break;
      }
    }
    if (checkpointIdx !== -1) {
      break;
    }
  }

  const history: Message[] = [];

  // If there's a checkpoint, start with the summary
  if (checkpointIdx !== -1 && summaryText) {
    history.push({
      role: 'user',
      content: `<prior_conversation_summary>\n${summaryText}\n</prior_conversation_summary>`,
    });
  }

  // Collect subagent messages from after the checkpoint (or from the start)
  const startIdx = checkpointIdx !== -1 ? checkpointIdx + 1 : 0;

  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i];
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
