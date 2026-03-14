/**
 * Targeted string replacement in a file.
 * The old_string must appear exactly once — fails if not found or
 * ambiguous. Same semantics as Claude Code's Edit tool.
 */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';

export const editFileTool: Tool = {
  definition: {
    name: 'editFile',
    description:
      "Replace a specific string in a file. The old_string must appear exactly once — if it's ambiguous, include more surrounding lines for context. Use this for single targeted edits. For multiple changes to the same file, use multiEdit instead to apply them all at once. Always read the file first so you know the exact text to match.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to edit, relative to the project root.',
        },
        old_string: {
          type: 'string',
          description:
            'The exact string to find and replace. Must be unique in the file.',
        },
        new_string: {
          type: 'string',
          description: 'The replacement string.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  async execute(input) {
    try {
      const content = await fs.readFile(input.path, 'utf-8');

      const occurrences = content.split(input.old_string).length - 1;
      if (occurrences === 0) {
        return `Error: old_string not found in ${input.path}`;
      }
      if (occurrences > 1) {
        return `Error: old_string found ${occurrences} times in ${input.path} — must be unique. Provide more surrounding context to make it unique.`;
      }

      const updated = content.replace(input.old_string, input.new_string);
      await fs.writeFile(input.path, updated, 'utf-8');
      return `Updated ${input.path}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
