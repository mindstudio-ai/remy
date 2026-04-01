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

/**
 * Build a map from tool_use id → tool name by scanning assistant messages.
 */
function buildToolNameMap(messages: Message[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'tool') {
          map.set(block.id, block.name);
        }
      }
    }
  }
  return map;
}

/**
 * Clear old tool results from previous turns to save context space.
 *
 * Only clears results from tools marked as clearable. Uses a 2-turn buffer:
 * the current turn and the previous turn are preserved, everything older
 * gets cleared.
 *
 * Turn boundaries are identified by non-tool-result user messages (i.e.,
 * messages where the user actually typed something or an automated message
 * came in, not tool_result messages).
 */
function clearOldToolResults(
  messages: Message[],
  clearableTools: Set<string>,
): Message[] {
  if (clearableTools.size === 0) {
    return messages;
  }

  // Find turn boundaries — indices of non-tool-result user messages
  const turnStarts: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && !msg.toolCallId) {
      turnStarts.push(i);
    }
  }

  // Need at least 3 turns to clear anything (2-turn buffer)
  if (turnStarts.length < 3) {
    return messages;
  }

  // Everything before the start of turn N-1 is eligible for clearing
  const clearBefore = turnStarts[turnStarts.length - 2];

  // Build tool name lookup
  const toolNames = buildToolNameMap(messages);

  // Clear eligible tool results
  const result = messages.map((msg, i) => {
    if (
      i >= clearBefore ||
      msg.role !== 'user' ||
      !msg.toolCallId ||
      typeof msg.content !== 'string'
    ) {
      return msg;
    }

    const toolName = toolNames.get(msg.toolCallId);
    if (!toolName || !clearableTools.has(toolName)) {
      return msg;
    }

    return { ...msg, content: '[Cleared]' };
  });

  return result;
}

export function cleanMessagesForApi(
  messages: Message[],
  clearableTools?: Set<string>,
): Message[] {
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

  // Fix orphaned tool_use blocks, then clear old tool results
  let messagesToProcess = fixOrphanedToolCalls(messages.slice(startIdx));
  if (clearableTools) {
    messagesToProcess = clearOldToolResults(messagesToProcess, clearableTools);
  }

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
