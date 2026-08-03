/** Read a file with line numbers (like `cat -n`). Detects binary files. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';

const DEFAULT_WINDOW = 500;

/**
 * Check if a buffer likely contains binary content by looking for null bytes
 * in the first 8KB.
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
  clearable: true,
  definition: {
    name: 'readFile',
    description:
      "Read a file's contents with line numbers. Always read a file before editing it — never guess at contents. By default returns the first 500 lines. To read a specific range, pass startLine and endLine (1-indexed, inclusive) — e.g. to read lines 253–343, pass startLine: 253, endLine: 343. To read the end of a file or log, pass tail (the number of lines from the end). Line numbers in the output correspond to what editFile expects. For a large file, locate the relevant section first (symbols or grep), then read just that range.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read, relative to the project root.',
        },
        startLine: {
          type: 'number',
          description:
            'First line to read (1-indexed, inclusive). Defaults to 1. Pair with endLine to read an exact range — e.g. startLine: 253, endLine: 343 reads lines 253–343.',
        },
        endLine: {
          type: 'number',
          description:
            'Last line to read (1-indexed, inclusive). Defaults to a 500-line window from startLine, capped at the end of the file. Use with startLine to read an exact range.',
        },
        tail: {
          type: 'number',
          description:
            'Read only the last N lines of the file (useful for logs). When set, startLine and endLine are ignored.',
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

      const tail =
        input.tail != null ? Math.floor(Number(input.tail)) : undefined;

      let startIdx: number;
      let endIdxExclusive: number;

      if (tail != null && tail > 0) {
        // Read the last N lines.
        startIdx = Math.max(0, totalLines - tail);
        endIdxExclusive = totalLines;
      } else {
        const startLine = Math.max(1, Math.floor(Number(input.startLine) || 1));
        startIdx = startLine - 1;

        if (startIdx >= totalLines) {
          return `${input.path} has ${totalLines} lines — startLine ${startLine} is past the end of the file.`;
        }

        if (input.endLine != null) {
          // Inclusive end line, clamped to [startLine, EOF].
          const endLine = Math.min(
            totalLines,
            Math.max(startLine, Math.floor(Number(input.endLine))),
          );
          endIdxExclusive = endLine;
        } else {
          endIdxExclusive = Math.min(startIdx + DEFAULT_WINDOW, totalLines);
        }
      }

      const sliced = allLines.slice(startIdx, endIdxExclusive);

      const numbered = sliced
        .map((line, i) => `${String(startIdx + i + 1).padStart(4)} ${line}`)
        .join('\n');

      let result = numbered;
      const displayStart = startIdx + 1;
      const displayEnd = startIdx + sliced.length;
      if (displayStart > 1 || displayEnd < totalLines) {
        result += `\n\n(showing lines ${displayStart}–${displayEnd} of ${totalLines} — pass startLine/endLine to read a different range)`;
      }

      return result;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
