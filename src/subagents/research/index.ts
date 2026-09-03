/**
 * Research sub-agent.
 *
 * The team's researcher: web search, page fetch (JS-prerendered), workspace
 * reads, and bash for cloning repos to a scratch dir and reading real source.
 * Returns a distilled, citation-backed report; the raw pages stay in its own
 * context, not the caller's.
 *
 * Deliberately the simplest agent on the team: stateless per invocation (each
 * brief is independent), foreground only, default 'run' cache policy. It is
 * offered to the main agent, the design expert, and the code sanity check via
 * `runResearch` — the main agent has no inline web search of its own, so
 * research goes through here by construction.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { readAsset } from '../../assets.js';
import { runSubAgent } from '../runner.js';
import { loadSpecIndex, loadPlatformBrief } from '../common/context.js';
import { executeTool, deriveContext } from '../../tools/index.js';
import {
  RESEARCH_TOOLS,
  executeSearchGoogle,
  executeScrapeWebUrl,
} from './tools.js';
import { resolveModel } from '../../models/surfaces.js';

const BASE_PROMPT = readAsset('subagents/research', 'prompt.md');

/**
 * Run the researcher against an already-derived context. Used by the public
 * `research` tool and, nested, by the design expert and code sanity check
 * (same mechanism specSync uses to run the design expert): the caller derives
 * a child context for its own tool call, so the researcher's events and
 * transcript attach under that call.
 */
export async function runResearch(
  task: string,
  context: ToolExecutionContext,
): Promise<string> {
  const specIndex = loadSpecIndex();
  const parts = [BASE_PROMPT, loadPlatformBrief()];
  parts.push('<!-- cache_breakpoint -->');
  if (specIndex) {
    parts.push(specIndex);
  }
  const system = parts.join('\n\n');

  const result = await runSubAgent({
    system,
    task,
    tools: RESEARCH_TOOLS,
    externalTools: new Set<string>(),
    executeTool: (name, toolInput, toolCallId, onLog, sams) => {
      const childCtx = toolCallId
        ? {
            ...deriveContext(context, toolCallId, onLog),
            subAgentMessages: sams,
          }
        : context;
      if (name === 'searchGoogle') {
        return executeSearchGoogle(toolInput, childCtx.onLog, 'research');
      }
      if (name === 'scrapeWebUrl') {
        return executeScrapeWebUrl(toolInput, childCtx.onLog, 'research');
      }
      // Reads + bash resolve through the main registry.
      return executeTool(name, toolInput, childCtx);
    },
    apiConfig: context.apiConfig,
    model: resolveModel('research', context.models, context.model),
    subAgentId: 'research',
    signal: context.signal,
    parentToolId: context.toolCallId,
    requestId: context.requestId,
    onEvent: context.onEvent,
    resolveExternalTool: context.resolveExternalTool,
    toolRegistry: context.toolRegistry,
  });
  context.subAgentMessages?.set(context.toolCallId, result.messages);
  return result.text;
}

export const researchTool: Tool = {
  definition: {
    name: 'research',
    description:
      'Your researcher. Hand it a question and it searches the web, reads the pages and source code that matter, and returns a distilled, citation-backed report. Use it for both objective research like third-party APIs and services, as well as for subjective things like current trends, patterns, and approaches (from architecture to UI to even just high-level framings and ideas). Brief it neutrally: state the question and the relevant project context, not the answer you expect.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What you need to find out, in natural language, plus any project context it cannot get from reading the spec. Phrase it as a question to answer, not a conclusion to confirm.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: research requires execution context';
    }
    return runResearch(input.task as string, context);
  },
};
