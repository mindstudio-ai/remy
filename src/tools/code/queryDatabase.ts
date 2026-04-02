/**
 * Execute a raw SQL query against the dev database.
 *
 * External tool. The sandbox forwards the query to the dev tunnel,
 * which executes it via the platform's db-query endpoint and returns
 * the result.
 */

import type { Tool } from '../index.js';

export const queryDatabaseTool: Tool = {
  clearable: true,
  definition: {
    name: 'queryDatabase',
    description:
      'Execute a raw SQL query against the dev database and return the results. Use for inspecting data and debugging issues.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL query to execute.',
        },
      },
      required: ['sql'],
    },
  },

  async execute() {
    return 'ok';
  },
};
