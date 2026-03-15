/**
 * Targeted string replacement in a file.
 *
 * Content-anchored matching (no line numbers). Exact match first,
 * whitespace-flexible fallback. Optional replace_all for bulk changes.
 */

import fs from 'node:fs/promises';
import type { Tool } from './index.js';
import { unifiedDiff } from './diff.js';
import {
  findOccurrences,
  flexibleMatch,
  formatOccurrenceError,
} from './editHelpers.js';

export const editFileTool: Tool = {
  definition: {
    name: 'editFile',
    description:
      'Replace a string in a file. old_string must appear exactly once (minor indentation differences are handled automatically). Set replace_all to true to replace every occurrence at once. For bulk mechanical substitutions (renaming a variable, swapping colors), prefer replace_all. Always read the file first so you know the exact text to match.',
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
            'The exact string to find and replace. Must be unique in the file unless replace_all is true.',
        },
        new_string: {
          type: 'string',
          description: 'The replacement string.',
        },
        replace_all: {
          type: 'boolean',
          description:
            'If true, replace every occurrence of old_string in the file. Defaults to false.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  async execute(input) {
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const { old_string, new_string, replace_all } = input;

      // Find exact occurrences
      const occurrences = findOccurrences(content, old_string);

      // Replace-all mode
      if (replace_all) {
        if (occurrences.length === 0) {
          return `Error: old_string not found in ${input.path}.`;
        }
        // Replace from end to start so indices stay valid
        let updated = content;
        for (let i = occurrences.length - 1; i >= 0; i--) {
          const idx = occurrences[i].index;
          updated =
            updated.slice(0, idx) +
            new_string +
            updated.slice(idx + old_string.length);
        }
        await fs.writeFile(input.path, updated, 'utf-8');
        return `Replaced ${occurrences.length} occurrence${occurrences.length > 1 ? 's' : ''} in ${input.path}\n${unifiedDiff(input.path, content, updated)}`;
      }

      // Single-match mode (default)
      if (occurrences.length === 1) {
        const idx = occurrences[0].index;
        const updated =
          content.slice(0, idx) +
          new_string +
          content.slice(idx + old_string.length);
        await fs.writeFile(input.path, updated, 'utf-8');
        return `Updated ${input.path}\n${unifiedDiff(input.path, content, updated)}`;
      }

      if (occurrences.length > 1) {
        const lines = occurrences.map((o) => o.line);
        return `Error: ${formatOccurrenceError(occurrences.length, lines, input.path)}`;
      }

      // Exact match found nothing — try whitespace-flexible match
      const flex = flexibleMatch(content, old_string);
      if (flex) {
        const updated =
          content.slice(0, flex.index) +
          new_string +
          content.slice(flex.index + flex.matchedText.length);
        await fs.writeFile(input.path, updated, 'utf-8');
        return `Updated ${input.path} (matched with flexible whitespace at line ${flex.line})\n${unifiedDiff(input.path, content, updated)}`;
      }

      // Nothing found
      return `Error: old_string not found in ${input.path}. Make sure you've read the file first and copied the exact text.`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
