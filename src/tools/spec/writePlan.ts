/** Write an implementation plan to .remy-plan.md for user review. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';

const PLAN_FILE = '.remy-plan.md';

export const writePlanTool: Tool = {
  clearable: false,
  definition: {
    name: 'writePlan',
    description:
      "Write an implementation plan for user approval before making changes. Use this only for large, multi-step changes like new features, new interface types, or when the user explicitly asks to see a plan. Most work should be done autonomously without a plan. Write a clear markdown summary of what you intend to do in plain language — describe the changes from the user's perspective, not as a list of files and code paths. The plan is displayed standalone in the UI with approve/reject buttons, so write only the plan itself — no conversational text, no 'what do you think?', no next-steps narration. Say those things in your chat message instead. If the user asks for revisions, call this tool again with updated content to overwrite the plan.",
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

  async execute(input) {
    const content = input.content as string;
    const file = `---\nstatus: pending\n---\n\n${content}`;
    await fs.writeFile(PLAN_FILE, file, 'utf-8');
    return 'Plan written to .remy-plan.md. Waiting for user approval.';
  },
};
