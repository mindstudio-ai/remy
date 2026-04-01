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
      'Run a method in the dev environment and return the result. Use for testing methods after writing or modifying them. Returns output, captured console output, errors with stack traces, and duration. If it fails, check .logs/tunnel.log or .logs/requests.ndjson for more details. Return synchronously - no need to sleep before checking results.',
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
      },
      required: ['method'],
    },
  },

  async execute() {
    return 'ok';
  },
};
