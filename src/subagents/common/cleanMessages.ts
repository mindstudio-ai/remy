/**
 * Strip client-side metadata from content blocks before sending to the API.
 * The API only accepts provider-defined fields — our timestamps and
 * subAgentMessages would be rejected.
 */

import type { Message, ContentBlock } from '../../api.js';

export function cleanMessagesForApi(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) {
      return msg;
    }
    return {
      ...msg,
      content: (msg.content as ContentBlock[]).map((block) => {
        switch (block.type) {
          case 'thinking':
            return {
              type: block.type,
              thinking: block.thinking,
              signature: block.signature,
            };
          case 'text':
            return { type: block.type, text: block.text };
          case 'tool':
            return {
              type: block.type,
              id: block.id,
              name: block.name,
              input: block.input,
            };
        }
      }) as ContentBlock[],
    };
  });
}
