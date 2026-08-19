/**
 * Tool definitions for the browser automation sub-agent.
 *
 * browserCommand is an external tool handled by the sandbox.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';
import { readSpecTool } from '../../tools/spec/readSpec.js';

export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'setupBrowser',
    description:
      'Pre-authenticate the browser and optionally navigate to a starting page. Call this before interacting with authenticated content instead of manually logging in. Auth is optional — omit to just navigate without authenticating.',
    inputSchema: {
      type: 'object',
      properties: {
        auth: {
          type: 'object',
          description:
            "Authentication config. Upserts the user if they don't exist.",
          properties: {
            email: {
              type: 'string',
              description: 'User email address.',
            },
            phone: {
              type: 'string',
              description: 'User phone number.',
            },
            roles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Roles to set on the user.',
            },
          },
        },
        path: {
          type: 'string',
          description: 'Navigate to this path after setup (default "/").',
        },
      },
    },
  },
  {
    name: 'browserCommand',
    description:
      "Interact with the app's live preview by sending browser commands. Commands execute sequentially with an animated cursor. Always start with a snapshot to see the current state and get ref identifiers. The result includes a snapshot field with the final page state after all steps complete. On error, the failing step has an error field and execution stops. Batches that contain an interactive step (click, type, select) also return a `recording` object — one chunk of a continuous per-session rrweb recording that the viewer stitches into a single replay (not a standalone per-call clip). Timeout: 120s.",
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                enum: [
                  'snapshot',
                  'click',
                  'type',
                  'select',
                  'wait',
                  'navigate',
                  'evaluate',
                  'styles',
                  'screenshotFullPage',
                  'screenshotViewport',
                  'setViewport',
                ],
                description:
                  'snapshot: accessibility tree of the page (waits for network to settle). click: click an element (animated cursor, full event sequence). type: type text into input (one char at a time, works with React/Vue/Svelte). select: select a dropdown option by text. wait: wait for an element to appear (polls 100ms, waits for network). navigate: navigate to a URL within the app (waits for the route, subsequent steps run on the new page; soft in-app route change by default — pass `fresh: true` for a real full page load; the result reports the URL actually landed on, so app redirects are visible). evaluate: run JS in the page. styles: read computed CSS styles from elements (pass properties array with camelCase names, or omit for defaults). screenshotFullPage: screenshot of the whole page top-to-bottom (returns a CDN url with dimensions and a written analysis). screenshotViewport: screenshot of just the visible viewport — pass `scrollToSelector` (or `scrollY`) on this step to scroll a section into view and capture it in one atomic step (no separate scroll needed). setViewport: switch the browser between desktop and mobile rendering (pass `mode`: "desktop" or "mobile"). Reloads the page so responsive layouts, media queries, and matchMedia re-evaluate — use it to QA mobile/responsive views.',
              },
              ref: {
                type: 'string',
                description:
                  'Element ref from the last snapshot (most reliable targeting).',
              },
              text: {
                type: 'string',
                description:
                  'For click/wait: match by accessible name or visible text. For type: the text to type.',
              },
              role: {
                type: 'string',
                description:
                  'ARIA role to match (used with text for role+text targeting).',
              },
              label: {
                type: 'string',
                description: 'Find an input by its associated label text.',
              },
              selector: {
                type: 'string',
                description: 'CSS selector fallback (last resort).',
              },
              option: {
                type: 'string',
                description:
                  'For select: the option text to select from a dropdown.',
              },
              clear: {
                type: 'boolean',
                description: 'For type: clear the field before typing.',
              },
              timeout: {
                type: 'number',
                description: 'For wait: timeout in ms (default 5000).',
              },
              script: {
                type: 'string',
                description: 'For evaluate: JavaScript to run in the page.',
              },
              url: {
                type: 'string',
                description:
                  'For navigate: the URL to navigate to (e.g., "/quiz", "/settings").',
              },
              fresh: {
                type: 'boolean',
                description:
                  'For navigate: force a real full page load (fresh document) instead of a soft in-app route change. Use when testing what a user sees on entry — landing pages, join/invite links, signed-out views — where reusing the SPA’s in-memory state would test the wrong thing.',
              },
              properties: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'For styles: camelCase CSS property names to read (e.g., ["backgroundColor", "borderRadius", "fontSize"]). Omit for a default set.',
              },
              scrollToSelector: {
                type: 'string',
                description:
                  'For screenshotViewport: a CSS selector to scroll into view (via the capture’s own context) immediately before the shot, so scroll + capture are atomic. Prefer this over a separate evaluate-scroll step when capturing a specific section.',
              },
              scrollY: {
                type: 'number',
                description:
                  'For screenshotViewport: absolute Y offset to scroll to before the shot, when no selector is available.',
              },
              mode: {
                type: 'string',
                enum: ['desktop', 'mobile'],
                description:
                  'For setViewport: the rendering mode to switch to. "mobile" emulates a phone (narrow width, touch, device pixel ratio); "desktop" is the standard wide viewport.',
              },
            },
            required: ['command'],
          },
        },
      },
      required: ['steps'],
    },
  },
  // Captures are `browserCommand` steps only — there is deliberately no
  // standalone screenshot tool here. Both used to exist for full-page, with
  // different budgets, different result plumbing, and analysis on only one of
  // them, so which door you picked changed what you got back.
  //
  // Read tools so the QA agent can pull full spec detail on demand — the spec
  // context in its prompt is a lightweight index (see prompt.ts) that points
  // here. Routed to the global executeTool in index.ts, mirroring specSync.
  ...COMMON_READ_TOOLS,
  readSpecTool.definition,
];

export const BROWSER_EXTERNAL_TOOLS = new Set(['browserCommand']);
