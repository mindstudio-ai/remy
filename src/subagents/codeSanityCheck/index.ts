/**
 * Code sanity check sub-agent.
 *
 * A lightweight readonly advisor that reviews an approach before the
 * main agent starts building. Has access to the codebase, web search,
 * and the SDK consultant to verify packages and architecture decisions.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { readAsset } from '../../assets.js';
import { runSubAgent } from '../runner.js';
import { loadSpecIndex, loadPlatformBrief } from '../common/context.js';
import { executeTool, deriveContext } from '../../tools/index.js';
import { SANITY_CHECK_TOOLS } from './tools.js';
import { runResearch } from '../research/index.js';
import { executeSearchGoogle } from '../research/tools.js';
import { resolveModel } from '../../models/surfaces.js';

const BASE_PROMPT = readAsset('subagents/codeSanityCheck', 'prompt.md');

export const codeSanityCheckTool: Tool = {
  definition: {
    name: 'codeSanityCheck',
    description:
      'Quick sanity check on an approach before building. Reviews architecture, package choices, and flags potential issues. Usually responds with "looks good." Occasionally catches something important. Readonly — can search the web and read code but cannot modify anything.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            "What you're about to build and how. Include the plan, packages you intend to use, and any architectural decisions you've made.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: code sanity check requires execution context';
    }

    const specIndex = loadSpecIndex();
    const parts = [BASE_PROMPT, loadPlatformBrief()];
    parts.push('<!-- cache_breakpoint -->');
    if (specIndex) {
      parts.push(specIndex);
    }
    const system = parts.join('\n\n');

    const result = await runSubAgent({
      system,
      task: input.task,
      tools: SANITY_CHECK_TOOLS,
      externalTools: new Set<string>(),
      executeTool: (name, toolInput, toolCallId, onLog, sams) => {
        const childCtx = toolCallId
          ? {
              ...deriveContext(context, toolCallId, onLog),
              subAgentMessages: sams,
            }
          : context;
        // searchGoogle no longer exists in the main registry (the main agent
        // delegates research instead) — this agent keeps its own quick search,
        // routed to the shared executor with today's fetch-top-5 behavior so a
        // package-liveness check still answers in one call.
        if (name === 'searchGoogle') {
          return executeSearchGoogle(
            { ...toolInput, fetchTopN: 5 },
            childCtx.onLog,
            'codeSanityCheck',
          );
        }
        // Nested researcher — same mechanism the main agent uses.
        if (name === 'research') {
          return runResearch(String(toolInput.task ?? ''), childCtx);
        }
        return executeTool(name, toolInput, childCtx);
      },
      apiConfig: context.apiConfig,
      model: resolveModel('codeSanityCheck', context.models, context.model),
      subAgentId: 'codeSanityCheck',
      signal: context.signal,
      parentToolId: context.toolCallId,
      requestId: context.requestId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
      toolRegistry: context.toolRegistry,
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
