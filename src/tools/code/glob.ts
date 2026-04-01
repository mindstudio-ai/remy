/** Find files matching a glob pattern. Excludes node_modules and .git. */

import fg from 'fast-glob';
import type { Tool } from '../index.js';

const DEFAULT_MAX = 200;

export const globTool: Tool = {
  clearable: true,
  definition: {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Returns matching file paths sorted alphabetically (default 200 results). Use this to discover project structure, find files by name or extension, or check if a file exists. Common patterns: "**/*.ts" (all TypeScript files), "src/**/*.tsx" (React components in src), "*.json" (root-level JSON files). Automatically excludes node_modules and .git.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description:
            'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx", "*.json").',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of file paths to return. Defaults to 200. Increase if you need the complete list.',
        },
      },
      required: ['pattern'],
    },
  },

  async execute(input) {
    try {
      const max = input.maxResults || DEFAULT_MAX;
      const files = await fg(input.pattern, {
        ignore: ['**/node_modules/**', '**/.git/**'],
        dot: false,
      });
      if (files.length === 0) {
        return 'No files found.';
      }
      const sorted = files.sort();
      const truncated = sorted.slice(0, max);
      let result = truncated.join('\n');
      if (sorted.length > max) {
        result += `\n\n(showing ${max} of ${sorted.length} matches — increase maxResults to see all)`;
      }
      return result;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
