/** Find files matching a glob pattern. Excludes node_modules and .git. */

import fg from 'fast-glob';
import type { Tool } from './index.js';

export const globTool: Tool = {
  definition: {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Returns matching file paths. Use this to discover project structure or find files by name.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description:
            'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx", "*.json").',
        },
      },
      required: ['pattern'],
    },
  },

  async execute(input) {
    try {
      const files = await fg(input.pattern, {
        ignore: ['**/node_modules/**', '**/.git/**'],
        dot: false,
      });
      if (files.length === 0) {
        return 'No files found.';
      }
      return files.sort().join('\n');
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
