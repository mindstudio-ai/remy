/**
 * Advance the project onboarding state.
 *
 * External tool. The sandbox intercepts this at tool_start and
 * advances the onboarding flow. Forward-only: intake → initialSpecAuthoring →
 * initialCodegen → onboardingFinished. Backward transitions are ignored.
 */

import type { Tool } from '../index.js';

export const setProjectOnboardingStateTool: Tool = {
  definition: {
    name: 'setProjectOnboardingState',
    description:
      'Advance the project onboarding state. Call at natural transition points: before writing the first spec (initialSpecAuthoring), before starting the first code generation (initialCodegen), after the first build succeeds (onboardingFinished). Forward-only progression.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: [
            'initialSpecAuthoring',
            'initialCodegen',
            'onboardingFinished',
          ],
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
