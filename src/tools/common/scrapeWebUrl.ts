/**
 * Fetch the content of a URL.
 *
 * Shells out to `mindstudio scrape-url`, which renders the page in a real
 * browser (anti-bot + JS) and extracts its main content as markdown. Callers
 * whose fetches people watch — the main agent, the design expert — also take a
 * full-page screenshot on the same request: it rides the render that is
 * already paid for and costs only image bandwidth, and the editor's Fetch URL
 * view shows it in a browser window with the markdown on a second tab. The
 * research agent fetches in volume and skips it.
 *
 * The CLI envelope is re-emitted as `{ url, screenshot?, content }`, in that
 * order, with `content` capped here so the JSON stays parseable under the
 * history cap. The blunt byte slice at ingestion would otherwise cut the tail
 * — where the screenshot URL used to sit — and leave the editor unparseable
 * JSON.
 */

import type { Tool } from '../index.js';
import { runMindstudioCli } from '../../subagents/common/runMindstudioCli.js';
import { SCRAPE_MAX_BUFFER } from '../../subagents/common/runCli.js';
import { MAX_TOOL_RESULT_BYTES } from '../../historyLimits.js';

/** Headroom under the ingestion cap for the envelope's other fields. */
const CONTENT_BUDGET_BYTES = MAX_TOOL_RESULT_BYTES - 4 * 1024;
/** runMindstudioCli appends this after the JSON when the CLI overflowed its buffer. */
const TRUNCATED_SUFFIX = '\n\n[output truncated]';

export interface FetchWebPageOptions {
  /** Also capture a full-page screenshot (returned as `screenshot`). */
  screenshot: boolean;
  /** Usage-ledger attribution ('parent', 'designExpert', 'research'). */
  caller: string;
  onLog?: (line: string) => void;
}

/** The one fetch path every caller shares. */
export async function fetchWebPage(
  url: string,
  opts: FetchWebPageOptions,
): Promise<string> {
  const raw = await runMindstudioCli(
    [
      'scrape-url',
      '--url',
      url,
      '--page-options',
      JSON.stringify({ onlyMainContent: true, screenshot: opts.screenshot }),
    ],
    {
      onLog: opts.onLog,
      maxBuffer: SCRAPE_MAX_BUFFER,
      caller: opts.caller,
    },
  );
  return shapeFetchResult(url, raw);
}

/**
 * Re-shape a CLI envelope into the tool result: `{ url, screenshot?, content }`
 * with the URL fields first and `content` capped. Anything that isn't a
 * well-formed scrape envelope (an error body, a buffer overflow that cut the
 * JSON) passes through untouched.
 */
export function shapeFetchResult(url: string, raw: string): string {
  const body = raw.endsWith(TRUNCATED_SUFFIX)
    ? raw.slice(0, -TRUNCATED_SUFFIX.length)
    : raw;
  let envelope: any;
  try {
    envelope = JSON.parse(body);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    typeof envelope.content !== 'string'
  ) {
    return raw;
  }
  const shot = envelope.screenshot;
  const screenshot =
    typeof shot === 'string'
      ? shot
      : Array.isArray(shot) && typeof shot[0] === 'string'
        ? shot[0]
        : undefined;
  return JSON.stringify({
    url,
    ...(screenshot ? { screenshot } : {}),
    content: capContent(envelope.content),
  });
}

function capContent(content: string): string {
  const total = Buffer.byteLength(content, 'utf-8');
  if (total <= CONTENT_BUDGET_BYTES) {
    return content;
  }
  const head = Buffer.from(content, 'utf-8')
    .subarray(0, CONTENT_BUDGET_BYTES)
    .toString('utf-8');
  return (
    head +
    `\n\n[page content truncated at ${(CONTENT_BUDGET_BYTES / 1024).toFixed(0)}KB of ` +
    `${(total / 1024).toFixed(0)}KB — narrow what you need or fetch a sub-page]`
  );
}

export const scrapeWebUrlTool: Tool = {
  definition: {
    name: 'scrapeWebUrl',
    description:
      'Fetch a web page. Returns its main content as markdown plus `screenshot`, a full-page capture the person sees in the editor. Read the markdown; analyze the screenshot with analyzeImage only when the visual design matters. Use this when you need to fetch or analyze content from a website.',
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
  },

  async execute(input, context) {
    return fetchWebPage(input.url as string, {
      screenshot: true,
      caller: 'parent',
      onLog: context?.onLog,
    });
  },
};
