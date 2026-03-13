/** Create or overwrite a file. Auto-creates parent directories. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from './index.js';

export const writeFileTool: Tool = {
  definition: {
    name: 'writeFile',
    description:
      'Create or overwrite a file with the given content. Parent directories are created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write, relative to the project root.',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },

  async execute(input) {
    try {
      await fs.mkdir(path.dirname(input.path), { recursive: true });
      await fs.writeFile(input.path, input.content, 'utf-8');
      const lines = input.content.split('\n').length;
      return `Created ${input.path} (${lines} lines)`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
