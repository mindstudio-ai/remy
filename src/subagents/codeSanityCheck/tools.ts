/**
 * Tool definitions for the code sanity check sub-agent.
 * Common read tools + web search + SDK consultant.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';

export const SANITY_CHECK_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
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
    name: 'scrapeWebUrl',
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
      'Check if the MindStudio SDK has a managed action for something before writing custom code. Use bullet points to ask many questions at once.',
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
