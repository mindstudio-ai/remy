/**
 * Design research sub-agent.
 *
 * Exports a tool that the main agent can call to research visual design:
 * color palettes, typography, inspiration sites, imagery. Returns
 * structured proposals that the main agent can use directly in specs.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { runSubAgent } from '../runner.js';
import { DESIGN_RESEARCH_TOOLS, executeDesignTool } from './tools.js';
import { getDesignResearchPrompt } from './prompt.js';

const DESCRIPTION = `
Visual design expert. Handles fonts, colors, palettes, gradients, layouts, imagery, icons, and visual direction. Can answer from expertise alone or research the web. Returns concrete resources: hex values, font names with CSS URLs, image URLs, layout descriptions. Include app context in your task — the agent cannot see your conversation with the user.
`.trim();

export const designExpertTool: Tool = {
  definition: {
    name: 'visualDesignExpert',
    description: DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What you need, in natural language. Include context about the app when relevant.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: design research requires execution context';
    }

    const result = await runSubAgent({
      system: getDesignResearchPrompt(),
      task: input.task,
      tools: DESIGN_RESEARCH_TOOLS,
      externalTools: new Set<string>(),
      executeTool: executeDesignTool,
      apiConfig: context.apiConfig,
      model: context.model,
      subAgentId: 'designExpert',
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
