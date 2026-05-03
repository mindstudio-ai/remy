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
      "Advance the project onboarding state. Forward-only: building → buildComplete → onboardingFinished. Normally driven by automated actions — don't call this out of order during a normal build, or you'll skip stages the user hasn't experienced. Exception: if the project has been in `building` for a while, the build is clearly done (the user is iterating on a working app, deploying, etc.), and the user reports the editor seems stuck — disabled Preview/Spec/Code tabs, no reveal, etc. — call `setProjectOnboardingState({ state: 'buildComplete' })` to unstick them. `onboardingFinished` is always set by the frontend after the user dismisses the reveal; never call it yourself.",
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
