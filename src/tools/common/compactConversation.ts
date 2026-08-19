/** Trigger conversation compaction to free up context space. */

import type { Tool } from '../index.js';
import {
  triggerCompaction,
  type CompactionSummary,
} from '../../compaction/trigger.js';

/** Tool-block result text for a finished compaction. */
function describeOutcome(summaries: CompactionSummary[] | null): string {
  if (summaries === null) {
    return 'A compaction checkpoint was already pending — no new compaction was needed.';
  }
  if (summaries.length === 0) {
    return 'Nothing to compact — the conversation is already fully summarized.';
  }
  return summaries.map((s) => `## ${s.name}\n\n${s.text}`).join('\n\n');
}

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
      { blocking: false, requestId: context.requestId },
    )
      .then((summaries) => {
        onBackgroundComplete?.(
          toolCallId,
          'compactConversation',
          describeOutcome(summaries),
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
