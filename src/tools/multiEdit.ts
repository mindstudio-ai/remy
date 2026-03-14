/**
 * Batch multiple edits to a single file in one tool call.
 * Each edit is a search-and-replace pair applied sequentially.
 */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';

export const multiEditTool: Tool = {
  definition: {
    name: 'multiEdit',
    description:
      "Apply multiple search-and-replace edits to a single file in one call. Each edit's old_string must appear exactly once in the file. Edits are applied sequentially top-to-bottom. Use this instead of multiple editFile calls when you need to change several parts of the same file — it's faster and avoids intermediate states.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to edit, relative to the project root.',
        },
        edits: {
          type: 'array',
          description:
            'Array of edits to apply sequentially. Each edit has old_string and new_string.',
          items: {
            type: 'object',
            properties: {
              old_string: {
                type: 'string',
                description:
                  'The exact string to find. Must be unique in the file at the time it is applied.',
              },
              new_string: {
                type: 'string',
                description: 'The replacement string.',
              },
            },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },

  async execute(input) {
    try {
      let content = await fs.readFile(input.path, 'utf-8');
      const edits: Array<{ old_string: string; new_string: string }> =
        input.edits;

      if (!edits || edits.length === 0) {
        return 'Error: no edits provided.';
      }

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const occurrences = content.split(edit.old_string).length - 1;

        if (occurrences === 0) {
          return `Error in edit ${i + 1}/${edits.length}: old_string not found in ${input.path}. ${i > 0 ? `(${i} earlier edits were applied successfully — the file has been partially modified.)` : ''}`;
        }
        if (occurrences > 1) {
          return `Error in edit ${i + 1}/${edits.length}: old_string found ${occurrences} times in ${input.path} — must be unique. Provide more surrounding context.${i > 0 ? ` (${i} earlier edits were applied successfully — the file has been partially modified.)` : ''}`;
        }

        content = content.replace(edit.old_string, edit.new_string);
      }

      await fs.writeFile(input.path, content, 'utf-8');
      return `Applied ${edits.length} edits to ${input.path}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
