/**
 * Mark the genuine first build as finished.
 *
 * External tool. The sandbox intercepts this at tool_start, advances the
 * onboarding state to `buildComplete`, and — on the genuine transition only
 * (its forward-only gate) — sends the one-time "your first build is ready"
 * email. `buildComplete` is a transient marker: the frontend responds by
 * landing the user on the Build Overview, fully unlocking the editor, and
 * immediately self-advancing onboarding to finished. The sandbox refuses the
 * call during intake — builds are started by the user via "Start Building".
 */

import type { Tool } from '../index.js';

export const markBuildCompleteTool: Tool = {
  definition: {
    name: 'markBuildComplete',
    description:
      'Mark the initial build as finished. The frontend lands the user on the Build Overview, fully unlocks the editor, and finishes onboarding; the platform sends the one-time "your first build is ready" email. Normally called as the final step of the automated post-build flow — don\'t call it early, or you\'ll cut the build experience short. Exception: if the project has been in `building` for a while, the build is clearly done (the user is iterating on a working app, deploying, etc.), and the user reports the editor seems stuck — disabled Preview/Spec/Code tabs — call this to unstick them. Refused during intake: the user starts the build via "Start Building", never you.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  async execute() {
    return 'ok';
  },
};
