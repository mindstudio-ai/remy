/** Create or overwrite a file. Auto-creates parent directories. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from './index.js';
import { unifiedDiff } from './diff.js';

export const writeFileTool: Tool = {
  definition: {
    name: 'writeFile',
    description:
      "Create a new file or completely overwrite an existing one. Parent directories are created automatically. Use this for new files or full rewrites. For targeted changes to existing files, use editFile instead — it preserves the parts you don't want to change and avoids errors from forgetting to include unchanged code.",
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

      // Read existing content for diff (if file exists)
      let oldContent: string | null = null;
      try {
        oldContent = await fs.readFile(input.path, 'utf-8');
      } catch {
        // New file — no old content
      }

      await fs.writeFile(input.path, input.content, 'utf-8');
      const lineCount = input.content.split('\n').length;
      const label = oldContent !== null ? 'Wrote' : 'Created';
      return `${label} ${input.path} (${lineCount} lines)\n${unifiedDiff(input.path, oldContent ?? '', input.content)}`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
