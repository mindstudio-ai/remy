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
      'Switch the IDE view mode. Use this to navigate the user to the right context. When transitioning from intake to spec, write the first spec file BEFORE calling this — the user needs something to see when the spec editor opens. Switch to "code" during code generation, then to "preview" when done so the user sees the result.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: [
            'intake',
            'preview',
            'spec',
            'code',
            'databases',
            'scenarios',
            'logs',
          ],
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
