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
                enum: ['snapshot', 'click', 'type', 'wait', 'evaluate'],
                description:
                  'snapshot: accessibility tree of the page (waits for network to settle). click: click an element (animated cursor, full event sequence). type: type text into input (one char at a time, works with React/Vue/Svelte). wait: wait for an element to appear (polls 100ms, waits for network). evaluate: run JS in the page.',
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
            },
            required: ['command'],
          },
        },
      },
      required: ['steps'],
    },
  },
];

export const BROWSER_EXTERNAL_TOOLS = new Set(['browserCommand']);
