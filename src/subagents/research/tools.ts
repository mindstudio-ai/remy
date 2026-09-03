/**
 * Tool definitions and web executors for the research sub-agent.
 *
 * Common read tools + web search + page fetch + bash. Search and fetch have
 * their own definitions here (not the deleted main-agent copies): the
 * researcher's search exposes `fetchTopN` as a model-controlled knob, and both
 * executors attribute usage-ledger rows to the invoking agent via `caller`.
 *
 * `executeSearchGoogle` is shared with codeSanityCheck, which kept its own
 * quick package-liveness search when the main agent's searchGoogle was
 * removed (its tool calls resolve by name through the main registry, so it
 * needs an explicit executor now).
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';
import { runMindstudioCli } from '../common/runMindstudioCli.js';
import { SEARCH_MAX_BUFFER, SCRAPE_MAX_BUFFER } from '../common/runCli.js';
import { bashTool } from '../../tools/code/bash.js';

export const searchGoogleDefinition: ToolDefinition = {
  name: 'searchGoogle',
  description:
    "Search Google. Returns ~25 results (title, description, URL) — fast (~5s) when `fetchTopN` is omitted. Set `fetchTopN` (3–5) to also get the top results' page content inline, capped at ~4,000 chars per page — one call delivers excerpts, but it is much slower (~30–60s). Default pattern: fire SERP-only searches in parallel, then scrape the specific pages worth reading in full.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query.',
      },
      fetchTopN: {
        type: 'number',
        description:
          'Also fetch page content (capped ~4,000 chars each) for this many top results. Omit for a fast SERP-only search.',
      },
    },
    required: ['query'],
  },
};

export const scrapeWebUrlDefinition: ToolDefinition = {
  name: 'scrapeWebUrl',
  description:
    'Fetch a web page as markdown. Renders JavaScript, so client-rendered pages come back complete. Returns the full page — long docs can run tens of thousands of tokens, so fetch only pages you have chosen to read, and fire independent fetches in parallel. For code hosted on GitHub/npm, prefer cloning with bash over scraping the repo page.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch.',
      },
    },
    required: ['url'],
  },
};

export const RESEARCH_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
  searchGoogleDefinition,
  scrapeWebUrlDefinition,
  bashTool.definition,
];

/** Run a Google search via the mindstudio CLI. `caller` attributes the
 * usage-ledger row to the invoking agent (`research`, `codeSanityCheck`). */
export async function executeSearchGoogle(
  input: Record<string, any>,
  onLog: ((line: string) => void) | undefined,
  caller: string,
): Promise<string> {
  const fetchTopN = Math.max(0, Math.round(Number(input.fetchTopN) || 0));
  return runMindstudioCli(
    [
      'search-google',
      '--query',
      String(input.query),
      '--export-type',
      'json',
      '--fetch-top-n',
      String(fetchTopN),
    ],
    {
      outputKey: 'results',
      maxBuffer: SEARCH_MAX_BUFFER,
      onLog,
      caller,
    },
  );
}

/** Fetch a page as markdown via the mindstudio CLI. */
export async function executeScrapeWebUrl(
  input: Record<string, any>,
  onLog: ((line: string) => void) | undefined,
  caller: string,
): Promise<string> {
  return runMindstudioCli(
    [
      'scrape-url',
      '--url',
      String(input.url),
      '--page-options',
      JSON.stringify({ onlyMainContent: true }),
    ],
    {
      maxBuffer: SCRAPE_MAX_BUFFER,
      onLog,
      caller,
    },
  );
}
