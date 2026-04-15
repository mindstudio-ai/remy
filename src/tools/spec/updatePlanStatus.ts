/** Update the status of .remy-plan.md (approve or reject). */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';

const PLAN_FILE = '.remy-plan.md';

export const updatePlanStatusTool: Tool = {
  clearable: false,
  definition: {
    name: 'updatePlanStatus',
    description:
      'Update the status of the current implementation plan. Use when the user approves or rejects the plan via chat (e.g. "looks good, go ahead" or "scrap it"). Approving sets the plan to active so you can begin implementation. Rejecting deletes the plan.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['approved', 'rejected'],
          description: 'The new plan status.',
        },
      },
      required: ['status'],
    },
  },

  async execute(input) {
    const status = input.status as string;

    let content: string;
    try {
      content = await fs.readFile(PLAN_FILE, 'utf-8');
    } catch {
      return 'No plan file found.';
    }

    if (status === 'rejected') {
      await fs.unlink(PLAN_FILE);
      return 'Plan rejected and removed.';
    }

    await fs.writeFile(
      PLAN_FILE,
      content.replace(/^status:\s*\w+/m, `status: ${status}`),
      'utf-8',
    );
    return 'Plan approved. Proceeding with implementation.';
  },
};
