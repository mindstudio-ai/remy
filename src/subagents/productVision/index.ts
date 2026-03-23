/**
 * Product vision sub-agent.
 *
 * Owns the product roadmap. Handles creating, updating, and deleting
 * roadmap items. Reads spec and roadmap files from disk for context.
 *
 * Remy delegates all roadmap operations here with different task
 * descriptions: seeding initial ideas, updating status after a build,
 * adding features from user requests, reorganizing lanes.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { runSubAgent } from '../runner.js';
import { VISION_TOOLS } from './tools.js';
import { executeVisionTool } from './executor.js';
import { getProductVisionPrompt } from './prompt.js';

export const productVisionTool: Tool = {
  definition: {
    name: 'productVision',
    description:
      'Owns the product roadmap. Reads spec and roadmap files automatically. Creates, updates, and deletes roadmap items in src/roadmap/. Describe the situation and what needs to happen.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'Brief description of what happened or what is needed. Do not specify how many items to create, what topics to cover, or how to think. The agent reads the spec files and decides for itself.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: product vision requires execution context';
    }

    const result = await runSubAgent({
      system: getProductVisionPrompt(),
      task: input.task,
      tools: VISION_TOOLS,
      externalTools: new Set<string>(),
      executeTool: executeVisionTool,
      apiConfig: context.apiConfig,
      model: context.model,
      subAgentId: 'productVision',
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
