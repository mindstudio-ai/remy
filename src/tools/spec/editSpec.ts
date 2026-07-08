/** Targeted find/replace edits to spec files (mirrors the editFile tool). */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';
import { validateSpecPath, extractFrontmatter } from './_helpers.js';
import {
  findOccurrences,
  flexibleMatch,
  formatOccurrenceError,
  replaceAt,
} from '../code/editFile/_helpers.js';
import { unifiedDiff } from '../_helpers/diff.js';
import { acquireFileLock } from '../_helpers/fileLock.js';

export const editSpecTool: Tool = {
  clearable: true,
  definition: {
    name: 'editSpec',
    description:
      "Make a targeted find/replace edit to a spec file (src/*.md). old_string must appear exactly once (minor indentation differences are handled automatically); set replace_all to true to replace every occurrence. Read the file with readSpec first so you match the exact text, and include the full enclosing structure rather than an inner fragment. The file's YAML frontmatter (the leading --- … --- block, which holds required fields like name) is protected — an edit that would remove or malform it is refused. For a full rewrite, use writeSpec.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root, must start with src/ (e.g., src/app.md).',
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
      validateSpecPath(input.path);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }

    const release = await acquireFileLock(input.path);
    try {
      let content: string;
      try {
        content = await fs.readFile(input.path, 'utf-8');
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }

      const { old_string, new_string, replace_all } = input;
      const occurrences = findOccurrences(content, old_string);

      // Resolve the edit to a single updated string + a result-message prefix,
      // matching editFile's semantics (exact → replace_all/single/multi-error →
      // whitespace-flexible fallback → not-found).
      let updated: string;
      let notePrefix: string;

      if (replace_all) {
        if (occurrences.length === 0) {
          return `Error: old_string not found in ${input.path}.`;
        }
        // Replace from end to start so earlier indices stay valid.
        updated = content;
        for (let i = occurrences.length - 1; i >= 0; i--) {
          updated = replaceAt(
            updated,
            occurrences[i].index,
            old_string.length,
            new_string,
          );
        }
        notePrefix = `Replaced ${occurrences.length} occurrence${occurrences.length > 1 ? 's' : ''} in ${input.path}\n`;
      } else if (occurrences.length === 1) {
        updated = replaceAt(
          content,
          occurrences[0].index,
          old_string.length,
          new_string,
        );
        notePrefix = `Updated ${input.path}\n`;
      } else if (occurrences.length > 1) {
        const lines = occurrences.map((o) => o.line);
        return `Error: ${formatOccurrenceError(occurrences.length, lines, input.path)}`;
      } else {
        // Exact match found nothing — try a whitespace-flexible match.
        const flex = flexibleMatch(content, old_string);
        if (!flex) {
          return `Error: old_string not found in ${input.path}. Make sure you've read the file first and copied the exact text.`;
        }
        updated = replaceAt(
          content,
          flex.index,
          flex.matchedText.length,
          new_string,
        );
        notePrefix = `Updated ${input.path} (matched with flexible whitespace at line ${flex.line})\n`;
      }

      // Frontmatter guard: a spec that started with a well-formed --- … ---
      // block must still have one. Refuses an edit whose old_string reached
      // into the frontmatter and destroyed it, rather than writing silently.
      if (
        extractFrontmatter(content) !== null &&
        extractFrontmatter(updated) === null
      ) {
        return `Error: that edit would remove or malform the spec's YAML frontmatter (the leading \`--- … ---\` block, which holds required fields like \`name\`). Narrow old_string to the body content you meant to change and leave the frontmatter block intact.`;
      }

      try {
        await fs.writeFile(input.path, updated, 'utf-8');
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }

      return `${notePrefix}${unifiedDiff(input.path, content, updated)}`;
    } finally {
      release();
    }
  },
};
