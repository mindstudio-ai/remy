/**
 * Convert our internal message format back to what the platform API expects.
 *
 * Internally we use ContentBlock[] on assistant messages with timestamps
 * and metadata. The platform expects the original format: content as string,
 * toolCalls as a separate array, thinking as a separate array.
 */

import type { Message, ContentBlock } from '../../api.js';

export function cleanMessagesForApi(messages: Message[]): Message[] {
  return messages.map((msg) => {
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
        (b): b is ContentBlock & { type: 'thinking' } => b.type === 'thinking',
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
}
