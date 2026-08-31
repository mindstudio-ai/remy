/**
 * Run a method synchronously for testing.
 *
 * External tool. The sandbox sends the command to the dev tunnel,
 * which executes the method and returns the full result including
 * output, errors, console output, and duration.
 */

import type { Tool } from '../index.js';

export const runMethodTool: Tool = {
  definition: {
    name: 'runMethod',
    description:
      'Run a method in the dev environment and return the result. Use for testing methods after writing or modifying them. Returns output, captured console output, errors with stack traces, and duration. If it fails, check .logs/tunnel.log or .logs/requests.ndjson for more details. Returns synchronously — no need to sleep before checking results.\n\nBy default methods run unauthenticated. If the method is auth-gated (calls `auth.requireRole()`, filters on `auth.userId`, etc.), pass `userId: "testUser"` to run as the default test user — no scenario setup required, no userId lookup. For a method gated on `auth.requireRole("system")` — cron, webhook, and email work — pass `roles: ["system"]`; that works whether or not the app has auth.',
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
            'Optional. Run the method as a specific user. Pass "testUser" to auto-auth as the default test user (the sandbox handles user creation/lookup — no scenario setup needed); works for email-code, sms-code, and "Sign in with Remy" apps (for sign-in-with-remy apps it resolves to the developer\'s own delegated identity rather than the test user). Or pass a real user ID from scenario-seeded data for a specific user.',
        },
        roles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Role names for this request (e.g. ["admin"]). Roles without a userId bind to the dev test user holding exactly these roles — a real user row, so `auth.userId` and `requireRole` behave like production. `["system"]` is the exception and needs no user: it runs as the platform system identity, the same one cron, webhook, and email invocations get, so a system-gated method is testable in an app with no auth configured. Any other role requires an `auth` block in mindstudio.json — without one the app has no users to hold a role, and the call is rejected saying so. Applies to this call only.',
        },
      },
      required: ['method'],
    },
  },

  async execute() {
    return 'ok';
  },
};
