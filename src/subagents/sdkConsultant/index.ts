/**
 * SDK consultant sub-agent.
 *
 * Shells out to `mindstudio ask` which runs its own agent loop
 * with full knowledge of every SDK action, model, connector, and
 * configuration option.
 */

import type { Tool } from '../../tools/index.js';
import { runCli } from '../common/runCli.js';

export const askMindStudioSdkTool: Tool = {
  clearable: false,
  definition: {
    name: 'askMindStudioSdk',
    description:
      '@mindstudio-ai/agent backend SDK expert. Knows every backend action, AI model, connector, and configuration option. Returns architectural guidance and working code. Only covers the backend SDK (@mindstudio-ai/agent) — do NOT use for frontend/interface SDK questions (@mindstudio-ai/interface) like file uploads, auth, or client-side APIs. Describe what you want to build, not just what API method you need. Batch related questions into a single query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Describe what you want to build or what you need to know. Be specific about the goal, not just the API method.',
        },
      },
      required: ['query'],
    },
  },

  async execute(input, context) {
    const query = input.query as string;
    return runCli(`mindstudio ask ${JSON.stringify(query)}`, {
      timeout: 200_000,
      maxBuffer: 512 * 1024,
      onLog: context?.onLog,
    });
  },
};
