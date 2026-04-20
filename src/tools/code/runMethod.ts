/**
 * Run a method synchronously for testing.
 *
 * External tool. The sandbox sends the command to the dev tunnel,
 * which executes the method and returns the full result including
 * output, errors, console output, and duration.
 */

import type { Tool } from '../index.js';

export const runMethodTool: Tool = {
  clearable: true,
  definition: {
    name: 'runMethod',
    description:
      'Run a method in the dev environment and return the result. Use for testing methods after writing or modifying them. Returns output, captured console output, errors with stack traces, and duration. If it fails, check .logs/tunnel.log or .logs/requests.ndjson for more details. Returns synchronously — no need to sleep before checking results.\n\nBy default methods run unauthenticated. If the method is auth-gated (calls `auth.requireRole()`, filters on `auth.userId`, etc.), pass `userId: "testUser"` to run as the default test user — no scenario setup required, no userId lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description: 'The method export name (camelCase, e.g. "listHaikus").',
        },
        input: {
          type: 'object',
          description:
            'The input payload to pass to the method. Omit for methods that take no input.',
        },
        userId: {
          type: 'string',
          description:
            'Optional. Run the method as a specific user. Pass "testUser" to auto-auth as the default test user (the sandbox handles user creation/lookup — no scenario setup needed). Or pass a real user ID from scenario-seeded data for a specific user. Overrides session-level impersonation for this call only.',
        },
        roles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Role names for this request (e.g. ["admin"]). Combine with `userId` to test a specific role, or use alone to test role-gated logic without a full identity. Overrides session-level impersonation for this call only.',
        },
      },
      required: ['method'],
    },
  },

  async execute() {
    return 'ok';
  },
};
