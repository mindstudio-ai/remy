/**
 * Advance the project onboarding state.
 *
 * External tool. The sandbox intercepts this at tool_start and
 * advances the onboarding flow. Forward-only: intake → initialSpecAuthoring →
 * initialCodegen → onboardingFinished. Backward transitions are ignored.
 */

import type { Tool } from '../index.js';

export const setProjectOnboardingStateTool: Tool = {
  clearable: false,
  definition: {
    name: 'setProjectOnboardingState',
    description:
      'Advance the project onboarding state. Call when starting the initial build (building) and after the first build succeeds (onboardingFinished). Forward-only progression.',
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
