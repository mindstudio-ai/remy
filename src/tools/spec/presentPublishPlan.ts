/**
 * Present a publish changelog to the user for approval.
 *
 * External tool — the sandbox intercepts this at tool_start and renders
 * a full-screen markdown view of the changelog. The content streams in
 * via tool_input_delta. The user approves or dismisses, and the sandbox
 * sends back the result.
 *
 * Available on every turn (the tool list is cache-stable), because a publish
 * can start from chat ("ship it") as well as the Publish button. The release
 * playbook that drives it lives in the `publishing` skill; both the button's
 * automated action and the chat trigger load that skill. The description
 * scopes the call to a user ask — an unprompted call is the failure mode
 * (a live session once replayed the previous turn's publish playbook and
 * deployed an ordinary change request to production).
 */

import type { Tool } from '../index.js';

export const presentPublishPlanTool: Tool = {
  definition: {
    name: 'presentPublishPlan',
    description:
      'Present a publish changelog to the user for approval — the consent gate of the release flow, used when the user has asked to publish (the Publish button or an explicit chat request; the `publishing` skill covers the full sequence). Write a clear markdown summary of what changed since the last deploy. The user will see this in a full-screen view and can approve or dismiss. Call this BEFORE committing or pushing.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'Markdown changelog describing what changed and what will be deployed.',
        },
      },
      required: ['content'],
    },
  },

  streaming: {},

  async execute() {
    return 'approved';
  },
};
