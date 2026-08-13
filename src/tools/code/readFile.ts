/** Read a file with line numbers (like `cat -n`). Detects binary files. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';

const DEFAULT_WINDOW = 500;

// A line window doesn't bound bytes. 500 rows of a wide CSV — 200 columns, ~800
// chars each — is a quarter of a megabyte, and two such reads in one turn put
// ~128K tokens into the conversation permanently. Cap the emitted text by UTF-8
// bytes as well, the same way bash.ts caps command output (MAX_OUTPUT_BYTES).
// 64KB is ~16K tokens: 500 lines of 128 chars fits, so ordinary source is
// untouched and only genuinely wide files get cut.
const MAX_BYTES = 64 * 1024;

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
      "Read a file's contents with line numbers. Always read a file before editing it — never guess at contents. By default returns the first 500 lines, and at most 64KB — a file with very wide lines (a CSV, a minified bundle) comes back short of 500 lines, so read a narrower range or grep rather than paging through it. To read a specific range, pass startLine and endLine (1-indexed, inclusive) — e.g. to read lines 253–343, pass startLine: 253, endLine: 343. To read the end of a file or log, pass tail (the number of lines from the end). Line numbers in the output correspond to what editFile expects. For a large file, locate the relevant section first (symbols or grep), then read just that range.",
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

      const numberedLines = allLines
        .slice(startIdx, endIdxExclusive)
        .map((line, i) => `${String(startIdx + i + 1).padStart(4)} ${line}`);

      let kept = numberedLines;
      let byteTruncated = false;
      if (Buffer.byteLength(numberedLines.join('\n'), 'utf-8') > MAX_BYTES) {
        byteTruncated = true;
        kept = [];
        let used = 0;
        for (const line of numberedLines) {
          // +1 for the newline this line will be joined with.
          const cost =
            Buffer.byteLength(line, 'utf-8') + (kept.length > 0 ? 1 : 0);
          if (used + cost > MAX_BYTES) {
            break;
          }
          kept.push(line);
          used += cost;
        }
        if (kept.length === 0) {
          // One line wider than the whole budget — a minified bundle, or a
          // single-line JSON file. Emit a byte-exact head of it rather than
          // nothing at all.
          kept = [
            Buffer.from(numberedLines[0], 'utf-8')
              .subarray(0, MAX_BYTES)
              .toString('utf-8'),
          ];
        }
      }

      let result = kept.join('\n');
      const displayStart = startIdx + 1;
      const displayEnd = startIdx + kept.length;
      if (byteTruncated) {
        result +=
          `\n\n(showing lines ${displayStart}–${displayEnd} of ${totalLines}, ` +
          `truncated at ${(MAX_BYTES / 1024).toFixed(0)}KB — this file's lines are wide. ` +
          `Read a narrower range with startLine/endLine, or grep for what you need, ` +
          `instead of paging through it.)`;
      } else if (displayStart > 1 || displayEnd < totalLines) {
        result += `\n\n(showing lines ${displayStart}–${displayEnd} of ${totalLines} — pass startLine/endLine to read a different range)`;
      }

      return result;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
