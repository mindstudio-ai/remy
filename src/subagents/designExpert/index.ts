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
A dedicated visual design expert. You have a lot on your plate as a coding agent, and design is a specialized skill — delegate visual design here rather than making those decisions yourself. This agent has curated font catalogs, color theory knowledge, access to design inspiration galleries, ability to create beautiful photos and images, and strong opinions about what looks good. It can answer from expertise alone or research the web when needed.

The visual design expert can be used for all things visual design, from quick questions to comprehensive plans:
- Font selection and pairings ("suggest fonts for a <x> app")
- Color palettes from a mood, domain, or seed color ("earthy tones for a <x> brand")
- Gradient, animation, and visual effect recommendations
- Layout and composition ideas that go beyond generic AI defaults
- Analyzing a reference site or screenshot for design insights (it can take screenshots and do research on its own)
- Beautiful layout images or photos
- Icon recommendations or AI image editing
- Proposing full visual design and layout directions during intake

**How to write the task:**
Include context about the app — what it does, who uses it, what mood or feeling the interface should convey. If the user has any specific requirements, be sure to include them. The agent can not see your conversation with the user, so you need to include all details. More context produces better results. For quick questions ("three font pairings for a <x> app"), brief is fine. You can ask for multiple topics, multiple options, etc.

**What it returns:**
Concrete resources: hex values, font names with CSS URLs, image URLs, layout descriptions. Use the results directly in brand spec files or as guidance when building the interface.
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

    return runSubAgent({
      system: getDesignResearchPrompt(),
      task: input.task,
      tools: DESIGN_RESEARCH_TOOLS,
      externalTools: new Set<string>(),
      executeTool: executeDesignTool,
      apiConfig: context.apiConfig,
      model: context.model,
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
  },
};
