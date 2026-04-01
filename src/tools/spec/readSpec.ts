/** Read a spec file from src/ with line numbers. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';
import { validateSpecPath } from './_helpers.js';

const DEFAULT_MAX_LINES = 500;

export const readSpecTool: Tool = {
  clearable: true,
  definition: {
    name: 'readSpec',
    description:
      'Read a spec file from src/ with line numbers. Always read a spec file before editing it. Paths are relative to the project root and must start with src/ (e.g., src/app.md, src/interfaces/web.md).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root, must start with src/ (e.g., src/app.md).',
        },
        offset: {
          type: 'number',
          description:
            'Line number to start reading from (1-indexed). Use a negative number to read from the end. Defaults to 1.',
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
      validateSpecPath(input.path);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }

    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const allLines = content.split('\n');
      const totalLines = allLines.length;
      const maxLines =
        input.maxLines === 0 ? Infinity : input.maxLines || DEFAULT_MAX_LINES;

      let startIdx: number;
      if (input.offset && input.offset < 0) {
        startIdx = Math.max(0, totalLines + input.offset);
      } else {
        startIdx = Math.max(0, (input.offset || 1) - 1);
      }

      const sliced = allLines.slice(startIdx, startIdx + maxLines);

      const numbered = sliced
        .map((line, i) => `${String(startIdx + i + 1).padStart(4)} ${line}`)
        .join('\n');

      let result = numbered;
      const endLine = startIdx + sliced.length;
      const displayStart = startIdx + 1;
      if (endLine < totalLines) {
        result += `\n\n(showing lines ${displayStart}–${endLine} of ${totalLines} — use offset and maxLines to read more)`;
      }

      return result;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
