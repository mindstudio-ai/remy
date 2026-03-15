/**
 * Signal that file edits are complete so the live preview can update.
 *
 * This is a no-op — the sandbox detects it from the tool_done event
 * and flushes the buffered HMR messages. If the agent forgets to call
 * it, the preview updates when the turn ends.
 */

import type { Tool } from './index.js';

export const editsFinishedTool: Tool = {
  definition: {
    name: 'editsFinished',
    description:
      'Signal that file edits are complete. Call this after you finish writing/editing files so the live preview updates cleanly. The preview is paused while you edit to avoid showing broken intermediate states — this unpauses it. If you forget to call this, the preview updates when your turn ends.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  async execute() {
    return 'Preview updated.';
  },
};
