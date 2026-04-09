/**
 * Tool definitions for the product vision sub-agent.
 *
 * Simple file tools scoped to src/roadmap/, plus design expert
 * delegation for the pitch deck.
 */

import type { ToolDefinition } from '../../api.js';

export const VISION_TOOLS: ToolDefinition[] = [
  {
    name: 'listFiles',
    description: 'List files in src/roadmap/.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'readFile',
    description:
      'Read a file from src/roadmap/. Path is relative to src/roadmap/ (e.g. "index.json", "mute.md").',
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
    name: 'writeFile',
    description:
      'Write a file to src/roadmap/. Creates or overwrites. Path is relative to src/roadmap/ (e.g. "index.json", "ai-weekly-digest.md").',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to src/roadmap/.',
        },
        content: {
          type: 'string',
          description: 'Full file content.',
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
      'Generate a branded HTML pitch deck for the product and save it to src/roadmap/pitch.html. Delegates to the design expert who builds a beautiful self-contained slide deck from your request.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Full description of the pitch deck content. Include the full structure and copy of the deck and each slide.',
        },
      },
      required: ['prompt'],
    },
  },
];
