/** Restart a managed sandbox process. */

import type { Tool } from '../index.js';
import { lspRequest } from '../_helpers/lsp.js';

export const restartProcessTool: Tool = {
  definition: {
    name: 'restartProcess',
    description:
      'Restart a managed sandbox process. "devServer": after running npm install or changing package.json in the app frontend, so the dev server picks up new dependencies. "methodsWorker": after upgrading @mindstudio-ai/agent in the methods package — the long-lived methods worker caches the SDK module and will not pick up the new version otherwise (method source and other dependencies are always fresh; only an SDK upgrade needs this).',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Process name to restart: "devServer" or "methodsWorker".',
        },
      },
      required: ['name'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/restart-process', { name: input.name });
    if (data.ok) {
      // Give the dev server time to fully start before the agent continues.
      // The methods worker respawns lazily on the next method run — nothing
      // to wait for.
      if (input.name !== 'methodsWorker') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return `Restarted ${input.name}.`;
    }
    return `Error: unexpected response: ${JSON.stringify(data)}`;
  },
};
