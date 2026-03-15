/** Create or overwrite a file. Auto-creates parent directories. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from './index.js';

export const writeFileTool: Tool = {
  definition: {
    name: 'writeFile',
    description:
      "Create a new file or completely overwrite an existing one. Parent directories are created automatically. Use this only for new files or full rewrites. For targeted changes to existing files, use editFile or multiEdit instead — they preserve the parts you don't want to change and avoid errors from forgetting to include unchanged code.",
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
      const allLines = input.content.split('\n');
      const preview = allLines.slice(0, 10);
      let result = `Created ${input.path} (${allLines.length} lines)\n`;
      result += preview
        .map((l: string, i: number) => `${String(i + 1).padStart(4)} ${l}`)
        .join('\n');
      if (allLines.length > 10) {
        result += `\n     ...`;
      }
      return result;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
