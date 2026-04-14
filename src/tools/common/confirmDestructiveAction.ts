/**
 * Confirm a destructive or irreversible action with the user.
 *
 * External tool. The sandbox intercepts this at tool_start and renders
 * a consent screen. Use only for actions the user might regret, like
 * deleting data or discarding work.
 *
 * Do NOT use this after presentSyncPlan, presentPublishPlan, or
 * writePlan (those already include approval). Do NOT use before
 * onboarding state transitions (those are automatic).
 *
 * Results:
 *   "confirmed" — user approved
 *   {"_dismissed": true} — user declined
 */

import type { Tool } from '../index.js';

export const confirmDestructiveActionTool: Tool = {
  clearable: false,
  definition: {
    name: 'confirmDestructiveAction',
    description:
      'Confirm a destructive or irreversible action with the user. Use for things like deleting data, resetting the database, or discarding draft work. Do not use after presentSyncPlan, presentPublishPlan, or writePlan (those already include approval). Do not use before onboarding state transitions.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'Explanation of what is about to happen and why confirmation is needed in natural language - avoid technical terms or mentions of variables, bash commands, or other system-level concepts..',
        },
        confirmLabel: {
          type: 'string',
          description:
            'Custom label for the confirm button (e.g., "Delete", "Reset Database"). Defaults to "Confirm".',
        },
        dismissLabel: {
          type: 'string',
          description:
            'Custom label for the dismiss button (e.g., "Keep It", "Go Back"). Defaults to "Cancel".',
        },
      },
      required: ['message'],
    },
  },

  async execute() {
    return 'confirmed';
  },
};
