/**
 * Visual design expert sub-agent.
 *
 * Handles fonts, colors, palettes, gradients, layouts, imagery, icons,
 * and visual direction. Can answer from expertise alone or research the web.
 */

import {
  type Tool,
  type ToolExecutionContext,
  deriveContext,
  executeTool as mainExecuteTool,
} from '../../tools/index.js';
import { runSubAgent, type SubAgentResult } from '../runner.js';
import { DESIGN_EXPERT_TOOLS, executeDesignExpertTool } from './tools/index.js';
import { COMMON_READ_TOOL_NAMES } from '../common/tools.js';
import { getDesignExpertPrompt } from './prompt.js';
import { getSubAgentHistory } from '../common/history.js';
import { resolveModel } from '../../models/surfaces.js';
import { writeFileTool } from '../../tools/code/writeFile.js';
import { editFileTool } from '../../tools/code/editFile/index.js';

const DESCRIPTION = `
Visual design expert. Describe the situation and what you need — the agent decides what to deliver. It reads the spec files automatically. Include relevant user requirements and context it can't get from the spec, but do not list specific deliverables or tell it how to do its job. Do not suggest implementation details or ideas - only relay what is needed.
`.trim();

// Render mode adds file-write capability so the design expert authors the
// branded asset (Build Overview / pitch deck) itself instead of the caller doing
// fs.writeFileSync from returned text. Kept OFF the public visualDesignExpert
// tool: only the internal runDesignExpertRender path enables it, so the public
// tool's schema — and its tool-cache prefix — are untouched.
const RENDER_WRITE_TOOL_NAMES = new Set(['writeFile', 'editFile']);
const DESIGN_EXPERT_RENDER_TOOLS = [
  ...DESIGN_EXPERT_TOOLS,
  writeFileTool.definition,
  editFileTool.definition,
];

interface DesignExpertRunOptions {
  task: string;
  background?: boolean;
  /**
   * Author the asset directly: includes + routes writeFile/editFile, and swaps
   * the system prompt's advisor contract for the authoring one. Both halves
   * matter — the tools alone leave the prompt telling it to reply with advice.
   */
  render?: boolean;
  /** Tool name used in the background-completion notification. */
  reportingName?: string;
}

/**
 * Shared core for both the public (read-only advisor) tool and the internal
 * render entry point. The only differences are the contract (prompt + tool set
 * and routing when `render`) and the background reporting name.
 */
async function runDesignExpert(
  opts: DesignExpertRunOptions,
  context: ToolExecutionContext,
): Promise<SubAgentResult> {
  const history = context.conversationMessages
    ? getSubAgentHistory(context.conversationMessages, 'visualDesignExpert')
    : [];

  return runSubAgent({
    system: getDesignExpertPrompt(context.onboardingState, {
      render: opts.render,
    }),
    task: opts.task,
    history: history.length > 0 ? history : undefined,
    tools: opts.render ? DESIGN_EXPERT_RENDER_TOOLS : DESIGN_EXPERT_TOOLS,
    externalTools: new Set<string>(),
    executeTool: (name, input, toolCallId, onLog, sams) => {
      const childCtx = toolCallId
        ? { ...deriveContext(context, toolCallId), subAgentMessages: sams }
        : { ...context, subAgentMessages: sams };
      if (COMMON_READ_TOOL_NAMES.has(name)) {
        return mainExecuteTool(name, input, childCtx);
      }
      if (opts.render && RENDER_WRITE_TOOL_NAMES.has(name)) {
        return mainExecuteTool(name, input, childCtx);
      }
      return executeDesignExpertTool(name, input, childCtx, toolCallId, onLog);
    },
    apiConfig: context.apiConfig,
    model: resolveModel('visualDesignExpert', context.models, context.model),
    subAgentId: 'visualDesignExpert',
    signal: context.signal,
    parentToolId: context.toolCallId,
    requestId: context.requestId,
    onEvent: context.onEvent,
    resolveExternalTool: context.resolveExternalTool,
    toolRegistry: context.toolRegistry,
    background: opts.background,
    onBackgroundComplete: opts.background
      ? (bgResult) => {
          context.onBackgroundComplete?.(
            context.toolCallId,
            opts.reportingName ?? 'visualDesignExpert',
            bgResult.text,
            bgResult.messages,
          );
        }
      : undefined,
  });
}

export const designExpertTool: Tool = {
  definition: {
    clearable: false,
    name: 'visualDesignExpert',
    description: DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What you need, in natural language. Include context about the project when relevant.',
        },
        background: {
          type: 'boolean',
          description:
            "Run in background — returns immediately and doesn't block while continuing to do work in the background. Reports results when finished working. Only use for generating app icons.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: visual design expert requires execution context';
    }

    const result = await runDesignExpert(
      {
        task: input.task as string,
        background: input.background as boolean | undefined,
      },
      context,
    );
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};

/**
 * Internal render entry point: runs the design expert with file-write tools so
 * it authors the branded asset directly at the path named in the task brief,
 * instead of the caller doing fs.writeFileSync from returned text. Only
 * writeBuildOverview / writePitchDeck call this — never the main agent, so the
 * public visualDesignExpert tool stays read-only.
 */
export async function runDesignExpertRender(
  opts: { task: string; background?: boolean; reportingName?: string },
  context: ToolExecutionContext,
): Promise<SubAgentResult> {
  return runDesignExpert({ ...opts, render: true }, context);
}
