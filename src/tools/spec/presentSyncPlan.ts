/**
 * Present a sync plan to the user for approval.
 *
 * External tool — the sandbox intercepts this at tool_start and renders
 * a full-screen markdown view of the plan. The content streams in via
 * tool_input_delta. The user approves or dismisses, and the sandbox
 * sends back the result.
 *
 * Only available during sync turns.
 */

import type { Tool } from '../index.js';

export const presentSyncPlanTool: Tool = {
  definition: {
    name: 'presentSyncPlan',
    description:
      'Present a structured sync plan to the user for approval. Write a clear markdown summary of what changed and what you intend to update. The user will see this in a full-screen view and can approve or dismiss. Call this BEFORE making any sync edits.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'Markdown plan describing what changed and what will be updated.',
        },
      },
      required: ['content'],
    },
  },

  streaming: {},

  async execute() {
    return 'approved';
  },
};
