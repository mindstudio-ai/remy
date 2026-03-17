/**
 * Clear sync status flags after syncing spec and code.
 *
 * External tool — the sandbox intercepts this at tool_start,
 * clears the dirty flags, updates refs/sync-point, and sends
 * back a tool_result.
 */

import type { Tool } from '../index.js';

export const clearSyncStatusTool: Tool = {
  definition: {
    name: 'clearSyncStatus',
    description:
      'Clear the sync status flags after syncing spec and code. Call this after finishing a sync operation.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  async execute() {
    return 'ok';
  },
};
