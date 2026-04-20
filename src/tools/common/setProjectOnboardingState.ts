/**
 * Advance the project onboarding state.
 *
 * External tool. The sandbox intercepts this at tool_start and
 * advances the onboarding flow. Forward-only: intake → building →
 * buildComplete → onboardingFinished. Backward transitions are ignored.
 */

import type { Tool } from '../index.js';

export const setProjectOnboardingStateTool: Tool = {
  clearable: false,
  definition: {
    name: 'setProjectOnboardingState',
    description:
      "Advance the project onboarding state. Only call this when an automated action explicitly instructs you to — calling it at the wrong time skips stages the user hasn't experienced. Forward-only: building → buildComplete → onboardingFinished. `onboardingFinished` is set by the frontend after the user dismisses the reveal; do not call it yourself.",
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['building', 'buildComplete', 'onboardingFinished'],
          description: 'The onboarding state to advance to.',
        },
      },
      required: ['state'],
    },
  },

  async execute() {
    return 'ok';
  },
};
