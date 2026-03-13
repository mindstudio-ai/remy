/** Read a file with line numbers (like `cat -n`). */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';

export const readFileTool: Tool = {
  definition: {
    name: 'readFile',
    description:
      'Read the contents of a file. Returns the file content with line numbers. Use this to understand existing code before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read, relative to the project root.',
        },
      },
      required: ['path'],
    },
  },

  async execute(input) {
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const lines = content.split('\n');
      const numbered = lines
        .map((line, i) => `${String(i + 1).padStart(4)} ${line}`)
        .join('\n');
      return numbered;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
