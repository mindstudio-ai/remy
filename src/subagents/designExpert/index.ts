/**
 * Visual design expert sub-agent.
 *
 * Handles fonts, colors, palettes, gradients, layouts, imagery, icons,
 * and visual direction. Can answer from expertise alone or research the web.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { runSubAgent } from '../runner.js';
import { DESIGN_EXPERT_TOOLS, executeDesignExpertTool } from './tools.js';
import { getDesignExpertPrompt } from './prompt.js';

const DESCRIPTION = `
Visual design expert. Describe the situation and what you need — the agent decides what to deliver. It reads the spec files automatically. Include relevant user requirements and context it can't get from the spec, but do not list specific deliverables or tell it how to do its job.
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
      return 'Error: visual design expert requires execution context';
    }

    const result = await runSubAgent({
      system: getDesignExpertPrompt(),
      task: input.task,
      tools: DESIGN_EXPERT_TOOLS,
      externalTools: new Set<string>(),
      executeTool: executeDesignExpertTool,
      apiConfig: context.apiConfig,
      model: context.model,
      subAgentId: 'visualDesignExpert',
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
