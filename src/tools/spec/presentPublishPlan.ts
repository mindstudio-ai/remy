/**
 * Present a publish changelog to the user for approval.
 *
 * External tool — the sandbox intercepts this at tool_start and renders
 * a full-screen markdown view of the changelog. The content streams in
 * via tool_input_delta. The user approves or dismisses, and the sandbox
 * sends back the result.
 *
 * Only available during publish turns.
 */

import type { Tool } from '../index.js';

export const presentPublishPlanTool: Tool = {
  clearable: false,
  definition: {
    name: 'presentPublishPlan',
    description:
      'Present a publish changelog to the user for approval. Write a clear markdown summary of what changed since the last deploy. The user will see this in a full-screen view and can approve or dismiss. Call this BEFORE committing or pushing.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'Markdown changelog describing what changed and what will be deployed.',
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
