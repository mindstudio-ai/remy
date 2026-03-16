/** Restart a managed sandbox process. */

import type { Tool } from '../index.js';
import { lspRequest } from '../_helpers/lsp.js';

export const restartProcessTool: Tool = {
  definition: {
    name: 'restartProcess',
    description:
      'Restart a managed sandbox process. Use this after running npm install or changing package.json to restart the dev server so it picks up new dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Process name to restart. Currently supported: "devServer".',
        },
      },
      required: ['name'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/restart-process', { name: input.name });
    if (data.ok) {
      return `Restarted ${input.name}.`;
    }
    return `Error: unexpected response: ${JSON.stringify(data)}`;
  },
};
