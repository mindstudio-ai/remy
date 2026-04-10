/**
 * Tool definitions for the product vision sub-agent.
 *
 * Common read tools (project-wide) + scoped write tools for
 * src/roadmap/ + design expert delegation for pitch deck.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';

export const VISION_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
  {
    name: 'writeFile',
    description:
      'Create or overwrite a file in src/roadmap/. Path is relative to src/roadmap/ (e.g. "index.json", "ai-weekly-digest.md").',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to src/roadmap/.',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'deleteFile',
    description:
      'Delete a file from src/roadmap/. Path is relative to src/roadmap/.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to src/roadmap/.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'writePitchDeck',
    description:
      'Generate a branded HTML pitch deck for the product and save it to src/roadmap/pitch.html. Delegates to the design expert who builds a beautiful self-contained slide deck from your request. Do NOT describe the design or structure of the deck, only provide the copy.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'Full description of the pitch deck content. Include the full copy of each slide in detail.',
        },
      },
      required: ['task'],
    },
  },
];
