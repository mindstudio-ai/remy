/**
 * Present an implementation plan to the user for approval.
 *
 * External tool — the sandbox intercepts this at tool_start and renders
 * a full-screen markdown view of the plan. The content streams in via
 * tool_input_delta. The user can approve, dismiss, or reject with
 * feedback.
 *
 * Results:
 *   "approved" — user approved, proceed with implementation
 *   {"_dismissed": true} — user dismissed without feedback
 *   {"feedback": "..."} — user rejected with specific feedback, revise the plan
 */

import type { Tool } from '../index.js';

export const presentPlanTool: Tool = {
  clearable: false,
  definition: {
    name: 'presentPlan',
    description:
      "Present an implementation plan for user approval before making changes. Use this only for large, multi-step changes like new features, new interface types, or when the user explicitly asks to see a plan. Most work should be done autonomously without a plan. Write a clear markdown summary of what you intend to do in plain language — describe the changes from the user's perspective, not as a list of files and code paths. If the user rejects with feedback, revise and present again.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Markdown plan describing what you intend to do.',
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
