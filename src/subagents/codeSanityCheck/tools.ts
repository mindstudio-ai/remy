/**
 * Tool definitions for the code sanity check sub-agent.
 * All readonly — can search, read, and query but cannot modify anything.
 */

import type { ToolDefinition } from '../../api.js';

export const SANITY_CHECK_TOOLS: ToolDefinition[] = [
  {
    name: 'readFile',
    description: 'Read a file from the project.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents for a pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex).' },
        path: {
          type: 'string',
          description: 'Directory or file to search in.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'glob',
    description: 'Find files by glob pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g., "src/**/*.ts").',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'searchGoogle',
    description:
      'Search the web. Use to verify packages are current or find alternatives.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'scapeWebUrl',
    description:
      'Fetch a web page as markdown. Use to read package docs, changelogs, npm pages.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'askMindStudioSdk',
    description:
      'Check if the MindStudio SDK has a managed action for something before writing custom code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you want to check.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command. Use for reading/search/etc operations only.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run.' },
      },
      required: ['command'],
    },
  },
];
