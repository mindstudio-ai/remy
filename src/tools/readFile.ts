/** Read a file with line numbers (like `cat -n`). Detects binary files. */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';

const DEFAULT_MAX_LINES = 500;

/**
 * Check if a buffer likely contains binary content by looking for null bytes
 * or a high ratio of non-text bytes in the first 8KB.
 */
function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      return true;
    }
  }
  return false;
}

export const readFileTool: Tool = {
  definition: {
    name: 'readFile',
    description:
      "Read a file's contents with line numbers. Always read a file before editing it — never guess at contents. For large files, consider using symbols first to identify the relevant section, then use offset and maxLines to read just that section. Line numbers in the output correspond to what editFile and multiEdit expect. Defaults to first 500 lines. Use a negative offset to read from the end of the file (e.g., offset: -50 reads the last 50 lines).",
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
            'Line number to start reading from (1-indexed). Use a negative number to read from the end (e.g., -50 reads the last 50 lines). Defaults to 1.',
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
      const buffer = await fs.readFile(input.path);

      if (isBinary(buffer)) {
        const size = buffer.length;
        const unit =
          size > 1024 * 1024
            ? `${(size / (1024 * 1024)).toFixed(1)}MB`
            : `${(size / 1024).toFixed(1)}KB`;
        return `Error: ${input.path} appears to be a binary file (${unit}). Use bash to inspect it if needed.`;
      }

      const content = buffer.toString('utf-8');
      const allLines = content.split('\n');
      const totalLines = allLines.length;
      const maxLines =
        input.maxLines === 0 ? Infinity : input.maxLines || DEFAULT_MAX_LINES;

      let startIdx: number;
      if (input.offset && input.offset < 0) {
        // Negative offset: read from end
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
