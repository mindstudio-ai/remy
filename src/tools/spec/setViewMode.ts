/**
 * Set the user's IDE view mode.
 *
 * Internal tool — the sandbox intercepts this at tool_start and
 * immediately applies the mode change. The tool result doesn't matter.
 */

import type { Tool } from '../index.js';

export const setViewModeTool: Tool = {
  definition: {
    name: 'setViewMode',
    description:
      'Switch the IDE view mode. Use this to navigate the user to the right context: "intake" for initial chat, "spec" for spec editing, "code" for code editing. For example, after finishing intake and generating specs, switch to "spec". After code generation, switch to "code".',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['intake', 'spec', 'code'],
          description: 'The view mode to switch to.',
        },
      },
      required: ['mode'],
    },
  },

  async execute() {
    return 'View mode updated.';
  },
};
