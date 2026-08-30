/**
 * SDK consultant sub-agent.
 *
 * Shells out to `mindstudio ask` which runs its own agent loop
 * with full knowledge of every SDK action, model, connector, and
 * configuration option.
 */

import type { Tool } from '../../tools/index.js';
import { runCli, formatCliResult } from '../common/runCli.js';

export const askMindStudioSdkTool: Tool = {
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
    // `mindstudio ask` returns markdown, not JSON, so runMindstudioCli's
    // envelope-parsing path doesn't apply. Cost data for this surface is
    // unavailable until/unless the CLI exposes a metadata format for `ask`.
    //
    // The timeout covers the CLI's entire multi-turn agent loop, not one LLM
    // call. A batched query typically runs 2-3 tool-call turns plus a long
    // reasoning+answer turn; the chat endpoint's single-turn p99 alone is
    // ~156s, so anything under ~400s kills healthy tail-latency loops
    // mid-generation (RPT-1189 died at a 200s cap with the final turn 140s
    // into a normal Bedrock stream).
    const result = await runCli('mindstudio', ['ask', query], {
      timeout: 480_000,
      maxBuffer: 512 * 1024,
      onLog: context?.onLog,
    });
    return formatCliResult(result);
  },
};
