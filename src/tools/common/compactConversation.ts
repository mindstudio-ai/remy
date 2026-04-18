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

    triggerCompaction(
      { messages: context.conversationMessages },
      context.apiConfig,
    );

    return 'Compaction started in the background.';
  },
};
