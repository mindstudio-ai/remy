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
import { getSubAgentHistory } from '../common/history.js';

export const productVisionTool: Tool = {
  clearable: false,
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
        background: {
          type: 'boolean',
          description:
            "Run in background — returns immediately and doesn't block while continuing to do work in the background. Reports results when finished working.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: product vision requires execution context';
    }

    const history = context.conversationMessages
      ? getSubAgentHistory(context.conversationMessages, 'productVision')
      : [];

    const result = await runSubAgent({
      system: getProductVisionPrompt(),
      task: input.task,
      history: history.length > 0 ? history : undefined,
      tools: VISION_TOOLS,
      externalTools: new Set<string>(),
      executeTool: (name, input) => executeVisionTool(name, input, context),
      apiConfig: context.apiConfig,
      model: context.model,
      subAgentId: 'productVision',
      signal: context.signal,
      parentToolId: context.toolCallId,
      requestId: context.requestId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
      toolRegistry: context.toolRegistry,
      background: input.background as boolean | undefined,
      onBackgroundComplete: input.background
        ? (bgResult) => {
            context.onBackgroundComplete?.(
              context.toolCallId,
              'productVision',
              bgResult.text,
              bgResult.messages,
            );
          }
        : undefined,
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
