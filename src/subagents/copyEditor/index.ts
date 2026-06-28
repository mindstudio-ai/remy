/**
 * Copy editor sub-agent.
 *
 * A lightweight readonly editor that takes user-facing copy the main agent
 * (or the design expert) already wrote and rewrites it to read like a person
 * wrote it — stripping the overused words, telltale constructions, and
 * rhythms that make text read as AI-generated. It polishes; it never changes
 * the message or invents claims. Isolated on purpose: the de-AI-ing happens
 * with fresh attention, off the main loop's plate.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { readAsset } from '../../assets.js';
import { runSubAgent } from '../runner.js';
import { loadSpecIndex } from '../common/context.js';
import { executeTool } from '../../tools/index.js';
import { COPY_EDITOR_TOOLS } from './tools.js';
import { resolveModel } from '../../models/surfaces.js';

const BASE_PROMPT = readAsset('subagents/copyEditor', 'prompt.md');

export const copyEditorTool: Tool = {
  clearable: false,
  definition: {
    name: 'copyEditor',
    description:
      "Hand it user-facing copy and it hands back a sharper version — better structured for its audience and free of the overused words, telltale constructions, and rhythms that make text read as AI-generated. Think of it as a design expert for words: it elevates how the copy communicates and strips the AI fingerprints, but it never invents facts or claims you didn't give it. Use it on anything users will read: in-app strings, empty states, errors, the Build Overview, deck copy, launch posts, Slack announcements. Readonly.",
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            "The copy to polish, plus what it's for — the medium, the audience, any brand voice. Paste the text verbatim.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: copy editor requires execution context';
    }

    const specIndex = loadSpecIndex();
    const parts = [BASE_PROMPT];
    parts.push('<!-- cache_breakpoint -->');
    if (specIndex) {
      parts.push(specIndex);
    }
    const system = parts.join('\n\n');

    const result = await runSubAgent({
      system,
      task: input.task,
      tools: COPY_EDITOR_TOOLS,
      externalTools: new Set<string>(),
      executeTool: (name, toolInput) => executeTool(name, toolInput, context),
      apiConfig: context.apiConfig,
      model: resolveModel('copyEditor', context.models, context.model),
      subAgentId: 'copyEditor',
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
