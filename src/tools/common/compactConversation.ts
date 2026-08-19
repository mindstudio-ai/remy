/** Trigger conversation compaction to free up context space. */

import type { Tool } from '../index.js';
import {
  triggerCompaction,
  formatSummariesResult,
} from '../../compaction/trigger.js';

export const compactConversationTool: Tool = {
  backgroundOnly: true,
  // Silent: the completed summary is written onto the tool block for the UI
  // detail view only. The model must never receive it as a message — it gets
  // the summary the correct way, as the checkpoint prefix in every later API
  // call (cleanMessagesForApi).
  backgroundNotify: 'silent',
  definition: {
    clearable: false,
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

    // Lifecycle events are emitted by the trigger's registered listener; the
    // agent gets the synchronous "started" ack below, and the finished
    // summary lands on this tool block via onBackgroundComplete (silent
    // class — UI only). A coalesced join resolves with the originator's
    // summaries and still completes the block.
    const { toolCallId, onBackgroundComplete, toolRegistry } = context;
    triggerCompaction(
      { messages: context.conversationMessages },
      context.apiConfig,
      // origin/toolCallId tell the headless listener a real block exists —
      // it must not synthesize a UI-only one for this compaction.
      {
        blocking: false,
        requestId: context.requestId,
        origin: 'tool',
        toolCallId,
      },
    )
      .then((summaries) => {
        onBackgroundComplete?.(
          toolCallId,
          'compactConversation',
          formatSummariesResult(summaries),
        );
      })
      .catch((err: any) => {
        onBackgroundComplete?.(
          toolCallId,
          'compactConversation',
          `Error: ${err.message || 'Compaction failed'}`,
        );
      })
      .finally(() => {
        // Background calls skip the turn-end unregister in agent.ts (the
        // subagent runner normally owns their lifecycle); this tool has no
        // runner, so release the registry entry here.
        toolRegistry?.unregister(toolCallId);
      });

    return 'Compaction started in the background.';
  },
};
