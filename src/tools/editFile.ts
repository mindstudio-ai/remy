/**
 * Targeted string replacement in a file.
 *
 * Matches exactly first, falls back to whitespace-flexible matching,
 * and supports optional line-range restriction and replace-all mode.
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
      'Replace a string in a file. By default old_string must appear exactly once (minor indentation differences are handled automatically). Set replace_all to true to replace every occurrence. If ambiguous, include more surrounding lines or use start_line/end_line to target a specific occurrence. For bulk mechanical substitutions (e.g. renaming a variable, swapping colors), use replace_all or sed via bash. Always read the file first so you know the exact text to match.',
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
            'If true, replace every occurrence of old_string in the file (or within the line range). Defaults to false.',
        },
        start_line: {
          type: 'integer',
          description:
            'Optional. 1-based start line to restrict the search range.',
        },
        end_line: {
          type: 'integer',
          description:
            'Optional. 1-based end line (inclusive) to restrict the search range.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  async execute(input) {
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const { old_string, new_string, start_line, end_line, replace_all } =
        input;

      // 1. Find exact occurrences
      const occurrences = findOccurrences(
        content,
        old_string,
        start_line,
        end_line,
      );

      // Replace-all mode
      if (replace_all) {
        if (occurrences.length === 0) {
          const rangeNote = start_line
            ? ` (searched lines ${start_line}–${end_line ?? 'EOF'})`
            : '';
          return `Error: old_string not found in ${input.path}${rangeNote}.`;
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

      // 2. Exact match found nothing — try whitespace-flexible match
      const flex = flexibleMatch(content, old_string, start_line, end_line);
      if (flex) {
        const updated =
          content.slice(0, flex.index) +
          new_string +
          content.slice(flex.index + flex.matchedText.length);
        await fs.writeFile(input.path, updated, 'utf-8');
        return `Updated ${input.path} (matched with flexible whitespace at line ${flex.line})\n${unifiedDiff(input.path, content, updated)}`;
      }

      // 3. Nothing found
      const rangeNote = start_line
        ? ` (searched lines ${start_line}–${end_line ?? 'EOF'})`
        : '';
      return `Error: old_string not found in ${input.path}${rangeNote}. Make sure you've read the file first and copied the exact text.`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
