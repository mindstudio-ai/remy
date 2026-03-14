/** Read a file with line numbers (like `cat -n`). */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';

const DEFAULT_MAX_LINES = 500;

export const readFileTool: Tool = {
  definition: {
    name: 'readFile',
    description:
      "Read a file's contents with line numbers. Always read a file before editing it — never guess at contents. For large files, consider using symbols first to identify the relevant section, then use offset and limit to read just that section. Line numbers in the output correspond to what editFile and multiEdit expect. Defaults to first 500 lines — use maxLines to read more, or offset to start from a specific line.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read, relative to the project root.',
        },
        offset: {
          type: 'number',
          description:
            'Line number to start reading from (1-indexed). Defaults to 1.',
        },
        maxLines: {
          type: 'number',
          description:
            'Maximum number of lines to return. Defaults to 500. Set to 0 for no limit.',
        },
      },
      required: ['path'],
    },
  },

  async execute(input) {
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const allLines = content.split('\n');
      const totalLines = allLines.length;
      const offset = Math.max(1, input.offset || 1);
      const maxLines =
        input.maxLines === 0 ? Infinity : input.maxLines || DEFAULT_MAX_LINES;

      const startIdx = offset - 1;
      const sliced = allLines.slice(startIdx, startIdx + maxLines);

      const numbered = sliced
        .map((line, i) => `${String(startIdx + i + 1).padStart(4)} ${line}`)
        .join('\n');

      let result = numbered;
      const endLine = startIdx + sliced.length;
      if (endLine < totalLines) {
        result += `\n\n(showing lines ${offset}–${endLine} of ${totalLines} — use offset and maxLines to read more)`;
      }

      return result;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
