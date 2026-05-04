/** Trigger conversation compaction to free up context space. */

import type { Tool } from '../index.js';
import { triggerCompaction } from '../../compaction/trigger.js';

export const compactConversationTool: Tool = {
  clearable: false,
  definition: {
    name: 'compactConversation',
    description:
      'Compact the conversation history by summarizing older messages into a checkpoint. The summary preserves key decisions, what was built, and the current state of the project, but drops the verbose tool results, diffs, and intermediate steps that are no longer useful. Runs in the background.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  async execute(_input, context) {
    if (!context?.conversationMessages || !context.apiConfig) {
      return 'Error: compaction requires execution context.';
    }

    // Fire-and-forget: lifecycle events are emitted by the trigger's
    // registered listener; the agent only needs the synchronous "started"
    // acknowledgment. Suppress the promise rejection — errors already
    // surface to the frontend via the listener's compaction_complete event.
    triggerCompaction(
      { messages: context.conversationMessages },
      context.apiConfig,
      { blocking: false, requestId: context.requestId },
    ).catch(() => {});

    return 'Compaction started in the background.';
  },
};
