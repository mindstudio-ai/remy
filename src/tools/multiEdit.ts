/**
 * Batch multiple edits to a single file in one tool call.
 *
 * Each edit is a search-and-replace pair applied sequentially.
 * The operation is atomic — the file is only written if ALL edits succeed.
 */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';
import { unifiedDiff } from './diff.js';
import {
  findOccurrences,
  flexibleMatch,
  formatOccurrenceError,
} from './editHelpers.js';

interface Edit {
  old_string: string;
  new_string: string;
  start_line?: number;
  end_line?: number;
}

export const multiEditTool: Tool = {
  definition: {
    name: 'multiEdit',
    description:
      "Apply multiple search-and-replace edits to a single file in one call. Each edit's old_string must appear exactly once (minor indentation differences are handled automatically). Edits are applied sequentially. The operation is atomic — if any edit fails, the file is not modified. Use this instead of multiple editFile calls when you need to change several parts of the same file.",
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
            'Array of edits to apply sequentially. Each edit has old_string, new_string, and optional start_line/end_line.',
          items: {
            type: 'object',
            properties: {
              old_string: {
                type: 'string',
                description:
                  'The exact string to find. Must be unique in the file (or within the specified line range) at the time it is applied.',
              },
              new_string: {
                type: 'string',
                description: 'The replacement string.',
              },
              start_line: {
                type: 'integer',
                description:
                  'Optional. 1-based start line to restrict the search range for this edit.',
              },
              end_line: {
                type: 'integer',
                description:
                  'Optional. 1-based end line (inclusive) to restrict the search range for this edit.',
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
      const original = await fs.readFile(input.path, 'utf-8');
      let content = original;
      const edits: Edit[] = input.edits;

      if (!edits || edits.length === 0) {
        return 'Error: no edits provided.';
      }

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        // 1. Exact match
        const occurrences = findOccurrences(
          content,
          edit.old_string,
          edit.start_line,
          edit.end_line,
        );

        if (occurrences.length === 1) {
          const idx = occurrences[0].index;
          content =
            content.slice(0, idx) +
            edit.new_string +
            content.slice(idx + edit.old_string.length);
          continue;
        }

        if (occurrences.length > 1) {
          const lines = occurrences.map((o) => o.line);
          return `Error in edit ${i + 1}/${edits.length}: ${formatOccurrenceError(occurrences.length, lines, input.path)} The file has NOT been modified.`;
        }

        // 2. Try whitespace-flexible match
        const flex = flexibleMatch(
          content,
          edit.old_string,
          edit.start_line,
          edit.end_line,
        );
        if (flex) {
          content =
            content.slice(0, flex.index) +
            edit.new_string +
            content.slice(flex.index + flex.matchedText.length);
          continue;
        }

        // 3. Not found
        const rangeNote = edit.start_line
          ? ` (searched lines ${edit.start_line}–${edit.end_line ?? 'EOF'})`
          : '';
        return `Error in edit ${i + 1}/${edits.length}: old_string not found in ${input.path}${rangeNote}. The file has NOT been modified.`;
      }

      await fs.writeFile(input.path, content, 'utf-8');
      return `Applied ${edits.length} edits to ${input.path}\n${unifiedDiff(input.path, original, content)}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
