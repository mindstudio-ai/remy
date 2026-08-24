/**
 * Run a scenario to seed the dev database with test data.
 *
 * External tool. The sandbox sends the command to the dev tunnel,
 * which truncates all tables, executes the scenario's seed function,
 * and assigns the scenario's roles to the dev test user. Blocks until
 * complete.
 *
 * Available scenarios are defined in mindstudio.json.
 */

import type { Tool } from '../index.js';

export const runScenarioTool: Tool = {
  definition: {
    name: 'runScenario',
    description:
      "Run a scenario to seed the dev database with test data. By default truncates all tables first, then executes the seed function and assigns the scenario's roles to the dev test user (a real user row; the roles persist on it until changed). Nobody gets signed in: the preview still shows the app's own sign-in, where the dev helper auto-fills the test account. Use skipTruncate to run the seed function against existing data without resetting. Blocks until complete. Scenario IDs are defined in mindstudio.json. If it fails, check .logs/tunnel.log or .logs/requests.ndjson for details. Returns synchronously - no need to sleep before checking results.",
    inputSchema: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The scenario ID from mindstudio.json.',
        },
        skipTruncate: {
          type: 'boolean',
          description:
            'When true, skip the database reset step and run the seed function against existing data. Defaults to false (clean-slate).',
        },
      },
      required: ['scenarioId'],
    },
  },

  async execute() {
    return 'ok';
  },
};
