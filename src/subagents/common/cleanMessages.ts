/**
 * Convert our internal message format back to what the platform API expects.
 *
 * Internally we use ContentBlock[] on assistant messages with timestamps
 * and metadata. The platform expects the original format: content as string,
 * toolCalls as a separate array, thinking as a separate array.
 *
 * Also handles conversation compaction: if a summary checkpoint exists,
 * only messages after the last checkpoint are sent to the model.
 */

import type { Message, ContentBlock } from '../../api.js';

/**
 * Find the index of the last summary checkpoint for a given name.
 * Returns -1 if no checkpoint exists.
 */
function findLastSummaryCheckpoint(messages: Message[], name: string): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'summary' && block.name === name) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Fix orphaned tool_use blocks — if an assistant message has tool calls
 * but subsequent messages don't include matching tool_results (e.g., due
 * to a crash or cancellation mid-turn), inject synthetic error results
 * so the API doesn't reject the conversation.
 */
function fixOrphanedToolCalls(messages: Message[]): Message[] {
  const toolResultIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'user' && msg.toolCallId) {
      toolResultIds.add(msg.toolCallId);
    }
  }

  const result = [...messages];
  for (let i = result.length - 1; i >= 0; i--) {
    const msg = result[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }
    const toolBlocks = (msg.content as ContentBlock[]).filter(
      (b): b is ContentBlock & { type: 'tool' } => b.type === 'tool',
    );
    const orphans = toolBlocks.filter((tc) => !toolResultIds.has(tc.id));
    if (orphans.length === 0) {
      continue;
    }
    const synthetics: Message[] = orphans.map((tc) => ({
      role: 'user' as const,
      content: 'Error: tool result lost (session recovered)',
      toolCallId: tc.id,
      isToolError: true,
    }));
    result.splice(i + 1, 0, ...synthetics);
    break; // Only the last assistant message should have orphans
  }

  return result;
}

export function cleanMessagesForApi(messages: Message[]): Message[] {
  // Find the last conversation summary checkpoint
  const checkpointIdx = findLastSummaryCheckpoint(messages, 'conversation');

  // If a checkpoint exists, include the summary as a user message
  // and only process messages after it
  let startIdx = 0;
  const prefix: Message[] = [];

  if (checkpointIdx !== -1) {
    const checkpointMsg = messages[checkpointIdx];
    const blocks = checkpointMsg.content as ContentBlock[];
    const summaryBlock = blocks.find(
      (b) => b.type === 'summary' && b.name === 'conversation',
    );
    if (summaryBlock && summaryBlock.type === 'summary') {
      prefix.push({
        role: 'user',
        content: `<conversation_summary>\n${summaryBlock.text}\n</conversation_summary>`,
        hidden: true,
      });
    }
    startIdx = checkpointIdx + 1;
  }

  // Fix orphaned tool_use blocks before processing
  const messagesToProcess = fixOrphanedToolCalls(messages.slice(startIdx));

  // Collect all tool_use IDs present in the post-checkpoint messages
  // so we can detect orphaned tool_results whose tool_use was pruned.
  const toolUseIds = new Set<string>();
  for (const msg of messagesToProcess) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'tool') {
          toolUseIds.add(block.id);
        }
      }
    }
  }

  const cleaned = messagesToProcess
    .filter((msg) => {
      // Skip summary checkpoint messages — they've been handled above
      if (Array.isArray(msg.content)) {
        const blocks = msg.content as ContentBlock[];
        if (blocks.some((b) => b.type === 'summary')) {
          return false;
        }
      }
      // Drop empty assistant messages (no content blocks)
      if (
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        (msg.content as ContentBlock[]).length === 0
      ) {
        return false;
      }
      // Drop orphaned tool_results whose tool_use was pruned by compaction
      if (
        msg.role === 'user' &&
        msg.toolCallId &&
        !toolUseIds.has(msg.toolCallId)
      ) {
        return false;
      }
      return true;
    })
    .map((msg) => {
      // Strip @@automated::...@@ sentinel from user messages before sending to LLM
      if (
        msg.role === 'user' &&
        typeof msg.content === 'string' &&
        msg.content.startsWith('@@automated::')
      ) {
        return {
          ...msg,
          content: msg.content.replace(/^@@automated::[^@]*@@[^\n]*\n?/, ''),
        };
      }

      if (!Array.isArray(msg.content)) {
        return msg;
      }

      const blocks = msg.content as ContentBlock[];

      // Extract text content as a single string
      const text = blocks
        .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Extract tool calls
      const toolCalls = blocks
        .filter((b): b is ContentBlock & { type: 'tool' } => b.type === 'tool')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));

      // Extract thinking blocks
      const thinking = blocks
        .filter(
          (b): b is ContentBlock & { type: 'thinking' } =>
            b.type === 'thinking',
        )
        .map((b) => ({ thinking: b.thinking, signature: b.signature }));

      const cleaned: Record<string, any> = {
        role: msg.role,
        content: text,
      };

      if (toolCalls.length > 0) {
        cleaned.toolCalls = toolCalls;
      }
      if (thinking.length > 0) {
        cleaned.thinking = thinking;
      }
      if (msg.hidden) {
        cleaned.hidden = true;
      }

      return cleaned as Message;
    });

  return [...prefix, ...cleaned];
}
