/** List directory contents with one-level expansion, path collapsing, and file sizes. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import type { Tool } from '../index.js';

const EXCLUDE = new Set(['.git', 'node_modules']);
const MAX_CHILDREN = 15;

/** Read, filter, and sort a directory's entries (dirs first, then alpha). */
async function readAndSort(dirPath: string): Promise<Dirent[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => !EXCLUDE.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) {
        return -1;
      }
      if (!a.isDirectory() && b.isDirectory()) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
}

/** Collapse single-child directory chains: a/b/c/ shown as one entry. Returns [displayName, finalPath]. */
async function collapsePath(
  basePath: string,
  name: string,
): Promise<[string, string]> {
  let display = name;
  let current = path.join(basePath, name);
  for (;;) {
    let children: Dirent[];
    try {
      children = await readAndSort(current);
    } catch {
      break;
    }
    if (children.length === 1 && children[0].isDirectory()) {
      display += '/' + children[0].name;
      current = path.join(current, children[0].name);
    } else {
      break;
    }
  }
  return [display, current];
}

/** Format bytes as human-readable size. */
function formatSize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1000).toFixed(1)} kB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Format a file entry with right-padded name and size. */
async function formatFile(
  dirPath: string,
  name: string,
  indent: string,
): Promise<string> {
  try {
    const stat = await fs.stat(path.join(dirPath, name));
    return `${indent}${name}${' '.repeat(Math.max(1, 30 - indent.length - name.length))}${formatSize(stat.size)}`;
  } catch {
    return `${indent}${name}`;
  }
}

export const listDirTool: Tool = {
  clearable: true,
  definition: {
    name: 'listDir',
    description:
      "List the contents of a directory with one level of subdirectory expansion. Shows file sizes and collapses single-child directory chains (a/b/c/ shown as one entry). Use this for a quick overview of a directory's structure. For finding files across the whole project, use glob instead.",
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
    const dirPath = (input.path as string) || '.';
    try {
      const entries = await readAndSort(dirPath);
      const lines: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const [displayName, finalPath] = await collapsePath(
            dirPath,
            entry.name,
          );
          lines.push(`${displayName}/`);

          // Expand one level
          try {
            const children = await readAndSort(finalPath);
            const capped = children.slice(0, MAX_CHILDREN);
            for (const child of capped) {
              if (child.isDirectory()) {
                lines.push(`  ${child.name}/`);
              } else {
                lines.push(await formatFile(finalPath, child.name, '  '));
              }
            }
            if (children.length > MAX_CHILDREN) {
              lines.push(`  ... and ${children.length - MAX_CHILDREN} more`);
            }
          } catch {
            // Can't read children — just show the collapsed dir
          }
        } else {
          lines.push(await formatFile(dirPath, entry.name, ''));
        }
      }

      return lines.join('\n') || '(empty directory)';
    } catch (err: any) {
      return `Error listing directory: ${err.message}`;
    }
  },
};
