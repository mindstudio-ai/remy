/** List files in the src/ directory tree. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from '../index.js';

export const listSpecFilesTool: Tool = {
  definition: {
    name: 'listSpecFiles',
    description:
      'List all files in the src/ directory (spec files, brand guidelines, interface specs, references). Use this to understand what spec files exist before reading or editing them.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  async execute() {
    try {
      const entries = await listRecursive('src');
      if (entries.length === 0) {
        return 'src/ is empty — no spec files yet.';
      }
      return entries.join('\n');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return 'Error: src/ directory does not exist.';
      }
      return `Error listing spec files: ${err.message}`;
    }
  },
};

async function listRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(`${fullPath}/`);
      results.push(...(await listRecursive(fullPath)));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}
