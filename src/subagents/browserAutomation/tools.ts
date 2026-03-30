/**
 * Tool definitions for the browser automation sub-agent.
 *
 * browserCommand is an external tool handled by the sandbox.
 */

import type { ToolDefinition } from '../../api.js';

export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'browserCommand',
    description:
      "Interact with the app's live preview by sending browser commands. Commands execute sequentially with an animated cursor. Always start with a snapshot to see the current state and get ref identifiers. The result includes a snapshot field with the final page state after all steps complete. On error, the failing step has an error field and execution stops. Timeout: 120s.",
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
                  'screenshot',
                ],
                description:
                  'snapshot: accessibility tree of the page (waits for network to settle). click: click an element (animated cursor, full event sequence). type: type text into input (one char at a time, works with React/Vue/Svelte). select: select a dropdown option by text. wait: wait for an element to appear (polls 100ms, waits for network). navigate: navigate to a URL within the app (waits for load, subsequent steps run on new page). evaluate: run JS in the page. styles: read computed CSS styles from elements (pass properties array with camelCase names, or omit for defaults). screenshot: full-page viewport-stitched screenshot (returns CDN url with dimensions).',
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
              properties: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'For styles: camelCase CSS property names to read (e.g., ["backgroundColor", "borderRadius", "fontSize"]). Omit for a default set.',
              },
            },
            required: ['command'],
          },
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'screenshotFullPage',
    description:
      'Capture a full-height screenshot of the current page. Returns a CDN URL with full text analysis and description.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Navigate to this path before capturing (e.g. "/settings"). If omitted, screenshots the current page.',
        },
      },
    },
  },
  {
    name: 'resetBrowser',
    description:
      'Reset the browser to a clean state. Call this once after all tests are complete to restore the preview for the user. Fire and forget — does not wait for the reload to finish.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const BROWSER_EXTERNAL_TOOLS = new Set(['browserCommand']);
