/**
 * Product vision sub-agent.
 *
 * Reads the completed spec files from disk and generates ambitious,
 * creative roadmap ideas. Writes them directly to src/roadmap/ as MSFM files.
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

const BASE_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8').trim();

// ---------------------------------------------------------------------------
// Read all spec files from src/ and concatenate into context
// ---------------------------------------------------------------------------

function loadSpecContext(): string {
  const specDir = 'src';
  const files: string[] = [];

  function walk(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip roadmap dir — we're generating those
          if (entry.name !== 'roadmap') {
            walk(full);
          }
        } else if (entry.name.endsWith('.md')) {
          files.push(full);
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  walk(specDir);

  if (files.length === 0) {
    return '';
  }

  const sections = files
    .map((f) => {
      try {
        const content = fs.readFileSync(f, 'utf-8').trim();
        return `<file path="${f}">\n${content}\n</file>`;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return `<spec_files>\n${sections.join('\n\n')}\n</spec_files>`;
}

// ---------------------------------------------------------------------------
// Tool: writeRoadmapItem
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool definition for Remy
// ---------------------------------------------------------------------------

export const productVisionTool: Tool = {
  definition: {
    name: 'productVision',
    description: `A product visionary that imagines where the project could go next. It automatically reads all spec files from src/ for context. Pass a brief description of the app and who it's for. It generates 10-15 ambitious, creative roadmap ideas and writes them directly to src/roadmap/. Use this at the end of spec authoring to populate the roadmap.`,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            "Brief description of the app and who it's for. The tool reads the full spec files automatically — no need to repeat their contents.",
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: product vision requires execution context';
    }

    // Build system prompt with spec context injected
    const specContext = loadSpecContext();
    const system = specContext
      ? `${BASE_PROMPT}\n\n${specContext}`
      : BASE_PROMPT;

    return runSubAgent({
      system,
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
