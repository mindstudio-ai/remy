/**
 * Product vision sub-agent.
 *
 * Reads the completed spec context and generates ambitious, creative
 * roadmap ideas. Writes them directly to src/roadmap/ as MSFM files.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import type { ToolDefinition } from '../../api.js';
import { runSubAgent } from '../runner.js';

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

const local = path.join(base, 'prompt.md');
const PROMPT_PATH = fs.existsSync(local)
  ? local
  : path.join(base, 'subagents', 'productVision', 'prompt.md');

const PRODUCT_VISION_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8').trim();

const VISION_TOOLS: ToolDefinition[] = [
  {
    name: 'writeRoadmapItem',
    description:
      'Write a roadmap item to src/roadmap/. Call this once for each idea.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description:
            'Kebab-case filename (without .md). e.g. "ai-weekly-digest"',
        },
        name: {
          type: 'string',
          description: 'User-facing feature name.',
        },
        description: {
          type: 'string',
          description: 'Short user-facing summary (1-2 sentences).',
        },
        effort: {
          type: 'string',
          enum: ['quick', 'small', 'medium', 'large'],
        },
        requires: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Slugs of prerequisite roadmap items. Empty array if independent.',
        },
        body: {
          type: 'string',
          description:
            'Full MSFM body: prose description for the user, followed by ~~~annotation~~~ with technical implementation notes for the building agent.',
        },
      },
      required: ['slug', 'name', 'description', 'effort', 'requires', 'body'],
    },
  },
];

async function executeVisionTool(
  name: string,
  input: Record<string, any>,
): Promise<string> {
  if (name !== 'writeRoadmapItem') {
    return `Error: unknown tool "${name}"`;
  }

  const { slug, name: itemName, description, effort, requires, body } = input;
  const dir = 'src/roadmap';
  const filePath = path.join(dir, `${slug}.md`);

  try {
    fs.mkdirSync(dir, { recursive: true });

    const requiresYaml =
      requires.length === 0
        ? '[]'
        : `[${requires.map((r: string) => `"${r}"`).join(', ')}]`;

    const content = `---
name: ${itemName}
type: roadmap
status: ${slug === 'mvp' ? 'in-progress' : 'not-started'}
description: ${description}
effort: ${effort}
requires: ${requiresYaml}
---

${body}
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return `Wrote ${filePath}`;
  } catch (err: any) {
    return `Error writing ${filePath}: ${err.message}`;
  }
}

export const productVisionTool: Tool = {
  definition: {
    name: 'productVision',
    description: `A product visionary that imagines where the project could go next. Pass it the full context of what was built and it generates 10-15 ambitious, creative roadmap ideas and writes them directly to src/roadmap/. Use this at the end of spec authoring to populate the roadmap.`,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            "Full context: what the app does, who it's for, what was built, the domain, the design direction. The more context, the better the ideas.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: product vision requires execution context';
    }

    return runSubAgent({
      system: PRODUCT_VISION_PROMPT,
      task: input.task,
      tools: VISION_TOOLS,
      externalTools: new Set<string>(),
      executeTool: executeVisionTool,
      apiConfig: context.apiConfig,
      model: context.model,
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
  },
};
