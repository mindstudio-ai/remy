/** List directory contents. Directories first, then files. Excludes .git and node_modules. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';

export const listDirTool: Tool = {
  clearable: true,
  definition: {
    name: 'listDir',
    description:
      "List the contents of a directory. Shows entries with / suffix for directories, sorted directories-first then alphabetically. Use this for a quick overview of a directory's contents. For finding files across the whole project, use glob instead.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Directory path to list, relative to project root. Defaults to ".".',
        },
      },
    },
  },

  async execute(input) {
    const dirPath = input.path || '.';
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const lines = entries
        .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
        .sort((a, b) => {
          // Directories first, then files
          if (a.isDirectory() && !b.isDirectory()) {
            return -1;
          }
          if (!a.isDirectory() && b.isDirectory()) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        })
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return lines.join('\n') || '(empty directory)';
    } catch (err: any) {
      return `Error listing directory: ${err.message}`;
    }
  },
};
