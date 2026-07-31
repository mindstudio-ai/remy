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

  async execute(input, context) {
    const status = input.status as string;

    // During intake the plan on disk is the initial onboarding plan, which is
    // approved out-of-band: the user presses "Start Building", which fires the
    // approveInitialPlan action (that flips the file itself). The agent must
    // not self-approve it from a chat signal, so no-op and say why.
    if (context?.onboardingState === 'intake') {
      return 'The initial plan isn\'t approved or rejected through this tool — the user decides via "Start Building". Keep discussing, and revise the plan with writePlan if they want changes.';
    }

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
