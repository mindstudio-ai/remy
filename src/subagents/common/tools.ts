/**
 * Shared read-only tool definitions for subagents.
 *
 * These match the main agent's tool names and schemas exactly,
 * so they route through the main executeTool with no custom logic.
 */

import type { ToolDefinition } from '../../api.js';

export const COMMON_READ_TOOLS: ToolDefinition[] = [
  {
    name: 'readFile',
    description:
      "Read a file's contents with line numbers. Always read a file before editing it — never guess at contents. For large files, consider using symbols first to identify the relevant section, then use offset and maxLines to read just that section. Line numbers in the output correspond to what editFile expects. Defaults to first 500 lines. Use a negative offset to read from the end of the file (e.g., offset: -50 reads the last 50 lines).",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read, relative to the project root.',
        },
        offset: {
          type: 'number',
          description:
            'Line number to start reading from (1-indexed). Use a negative number to read from the end (e.g., -50 reads the last 50 lines). Defaults to 1.',
        },
        maxLines: {
          type: 'number',
          description:
            'Maximum number of lines to return. Defaults to 500. Set to 0 for no limit.',
        },
      },
      required: ['path'],
    },
  },
  {
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
  {
    name: 'grep',
    description:
      "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers (default 50 results). Use this to find where something is used, locate function definitions, or search for patterns across the codebase. For finding a symbol's definition precisely, prefer the definition tool if LSP is available. Automatically excludes node_modules and .git.",
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The search pattern (regex supported).',
        },
        path: {
          type: 'string',
          description:
            'Directory or file to search in. Defaults to current directory.',
        },
        glob: {
          type: 'string',
          description:
            'File glob to filter (e.g., "*.ts"). Only used with ripgrep.',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of matching lines to return. Defaults to 50. Increase if you need more comprehensive results.',
        },
      },
      required: ['pattern'],
    },
  },
  {
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
];

/** Set of common read tool names, for routing in executeTool callbacks. */
export const COMMON_READ_TOOL_NAMES = new Set(
  COMMON_READ_TOOLS.map((t) => t.name),
);
