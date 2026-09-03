/**
 * Tool definitions for the code sanity check sub-agent.
 * Common read tools + web search + SDK consultant + the researcher.
 *
 * `searchGoogle` and `research` are routed explicitly in index.ts (search to
 * the shared research executor, research to the nested sub-agent); the rest
 * pass through to the main registry by name.
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
  // Appended last: tool order is part of the subagent's prompt-cache prefix.
  {
    name: 'research',
    description:
      'Deep researcher. When the plan hinges on an unfamiliar third-party service, API, or claim you cannot settle with a quick search, hand it the question — it researches properly (multiple sources, official docs, reading real source code) and returns a distilled, citation-backed report. Quick package-liveness checks stay on searchGoogle; use this when being wrong would be expensive. Brief it neutrally: the question, not the answer you expect.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What you need to find out, in natural language.',
        },
      },
      required: ['task'],
    },
  },
];
