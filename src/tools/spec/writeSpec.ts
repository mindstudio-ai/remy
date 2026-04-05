/** Create or overwrite a spec file in src/. Auto-creates parent directories. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from '../index.js';
import { validateSpecPath } from './_helpers.js';
import { unifiedDiff } from '../_helpers/diff.js';
import { acquireFileLock } from '../_helpers/fileLock.js';

export const writeSpecTool: Tool = {
  clearable: true,
  definition: {
    name: 'writeSpec',
    description:
      'Create a new spec file or completely overwrite an existing one in src/. Parent directories are created automatically. Use this for new spec files or full rewrites. For targeted changes to existing specs, use editSpec instead.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root, must start with src/ (e.g., src/app.md).',
        },
        content: {
          type: 'string',
          description: 'The full MSFM markdown content to write.',
        },
      },
      required: ['path', 'content'],
    },
  },

  streaming: {
    transform: async (partial) => {
      const oldContent = await fs
        .readFile(partial.path, 'utf-8')
        .catch(() => '');
      const lineCount = partial.content.split('\n').length;
      return `Writing ${partial.path} (${lineCount} lines)\n${unifiedDiff(partial.path, oldContent, partial.content)}`;
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
      await fs.mkdir(path.dirname(input.path), { recursive: true });

      let oldContent: string | null = null;
      try {
        oldContent = await fs.readFile(input.path, 'utf-8');
      } catch {
        // New file
      }

      await fs.writeFile(input.path, input.content, 'utf-8');
      const lineCount = input.content.split('\n').length;
      const label = oldContent !== null ? 'Wrote' : 'Created';
      return `${label} ${input.path} (${lineCount} lines)\n${unifiedDiff(input.path, oldContent ?? '', input.content)}`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    } finally {
      release();
    }
  },
};
