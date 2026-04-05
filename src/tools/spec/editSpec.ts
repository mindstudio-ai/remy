/** Heading-addressed edits to spec files. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';
import {
  validateSpecPath,
  resolveHeadingPath,
  getHeadingTree,
} from './_helpers.js';
import { unifiedDiff } from '../_helpers/diff.js';
import { acquireFileLock } from '../_helpers/fileLock.js';

export const editSpecTool: Tool = {
  clearable: true,
  definition: {
    name: 'editSpec',
    description:
      'Make targeted edits to a spec file by heading path. This is the primary tool for modifying existing specs. Each edit targets a section by its heading hierarchy (e.g., "Vendors > Approval Flow") and applies an operation. Multiple edits are applied in order.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root, must start with src/ (e.g., src/app.md).',
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: {
                type: 'string',
                description:
                  'Heading path using " > " to separate nesting levels (e.g., "Vendors > Approval Flow"). Empty string targets the preamble (content before the first heading).',
              },
              operation: {
                type: 'string',
                enum: ['replace', 'insert_after', 'insert_before', 'delete'],
                description:
                  'replace: swap content under this heading (keeps the heading line). insert_after: add content after this section. insert_before: add content before this heading. delete: remove this heading and all its content.',
              },
              content: {
                type: 'string',
                description:
                  'MSFM markdown content for replace/insert operations. Not needed for delete.',
              },
            },
            required: ['heading', 'operation'],
          },
          description: 'Array of edits to apply in order.',
        },
      },
      required: ['path', 'edits'],
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
      let originalContent: string;
      try {
        originalContent = await fs.readFile(input.path, 'utf-8');
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }

      let content = originalContent;

      for (const edit of input.edits) {
        let range;
        try {
          range = resolveHeadingPath(content, edit.heading);
        } catch (err: any) {
          const tree = getHeadingTree(content);
          return `Error: ${err.message}\n\nDocument structure:\n${tree}`;
        }

        const lines = content.split('\n');

        switch (edit.operation) {
          case 'replace': {
            if (edit.content == null) {
              return 'Error: "content" is required for replace operations.';
            }
            const contentLines = edit.content.split('\n');
            lines.splice(
              range.contentStart,
              range.contentEnd - range.contentStart,
              ...contentLines,
            );
            break;
          }

          case 'insert_after': {
            if (edit.content == null) {
              return 'Error: "content" is required for insert_after operations.';
            }
            const contentLines = edit.content.split('\n');
            lines.splice(range.contentEnd, 0, ...contentLines);
            break;
          }

          case 'insert_before': {
            if (edit.content == null) {
              return 'Error: "content" is required for insert_before operations.';
            }
            const contentLines = edit.content.split('\n');
            lines.splice(range.startLine, 0, ...contentLines);
            break;
          }

          case 'delete': {
            lines.splice(range.startLine, range.contentEnd - range.startLine);
            break;
          }

          default:
            return `Error: Unknown operation "${edit.operation}". Use replace, insert_after, insert_before, or delete.`;
        }

        content = lines.join('\n');
      }

      try {
        await fs.writeFile(input.path, content, 'utf-8');
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }

      return unifiedDiff(input.path, originalContent, content);
    } finally {
      release();
    }
  },
};
