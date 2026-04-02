/**
 * Run a scenario to seed the dev database with test data.
 *
 * External tool. The sandbox sends the command to the dev tunnel,
 * which truncates all tables, executes the scenario's seed function,
 * and impersonates the scenario's roles. Blocks until complete.
 *
 * Available scenarios are defined in mindstudio.json.
 */

import type { Tool } from '../index.js';

export const runScenarioTool: Tool = {
  clearable: true,
  definition: {
    name: 'runScenario',
    description:
      'Run a scenario to seed the dev database with test data. By default truncates all tables first, then executes the seed function and impersonates the scenario roles. Use skipTruncate to run the seed function against existing data without resetting. Blocks until complete. Scenario IDs are defined in mindstudio.json. If it fails, check .logs/tunnel.log or .logs/requests.ndjson for details. Return synchronously - no need to sleep before checking results.',
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
