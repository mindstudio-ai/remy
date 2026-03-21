/**
 * Set the project's display name.
 *
 * External tool. The sandbox intercepts this at tool_start and
 * updates the project name in the UI.
 */

import type { Tool } from '../index.js';

export const setProjectNameTool: Tool = {
  definition: {
    name: 'setProjectName',
    description:
      'Set the project display name. Call this after intake once you have enough context to give the project a clear, descriptive name. Keep it short (2-4 words). Use the app\'s actual name if the user mentioned one, otherwise pick something descriptive ("Vendor Procurement App", "Recipe Manager").',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The project name.',
        },
      },
      required: ['name'],
    },
  },

  async execute() {
    return 'ok';
  },
};
