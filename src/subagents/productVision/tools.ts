/**
 * Tool definitions for the product vision sub-agent.
 */

import type { ToolDefinition } from '../../api.js';

export const VISION_TOOLS: ToolDefinition[] = [
  {
    name: 'writeRoadmapItem',
    description: 'Create a new roadmap item in src/roadmap/.',
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
            'Full MSFM body: prose description for the user, followed by ~~~annotation~~~ with technical implementation notes.',
        },
      },
      required: ['slug', 'name', 'description', 'effort', 'requires', 'body'],
    },
  },
  {
    name: 'updateRoadmapItem',
    description:
      'Update an existing roadmap item. Only include the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The slug of the item to update (filename without .md).',
        },
        status: {
          type: 'string',
          enum: ['done', 'in-progress', 'not-started'],
          description: 'New status.',
        },
        name: {
          type: 'string',
          description: 'Updated feature name.',
        },
        description: {
          type: 'string',
          description: 'Updated summary.',
        },
        effort: {
          type: 'string',
          enum: ['quick', 'small', 'medium', 'large'],
          description: 'Updated effort level.',
        },
        requires: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated prerequisites.',
        },
        body: {
          type: 'string',
          description: 'Full replacement body (overwrites existing body).',
        },
        appendHistory: {
          type: 'string',
          description:
            'A history entry to append. Format: "- **2026-03-22** — Description of what was done."',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'deleteRoadmapItem',
    description:
      'Remove a roadmap item. Use when an idea is no longer relevant or has been absorbed into another item.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The slug of the item to delete (filename without .md).',
        },
      },
      required: ['slug'],
    },
  },
];
