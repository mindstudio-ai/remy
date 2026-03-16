/**
 * Compile tool (stub) — triggers first code generation from spec.
 *
 * Authoring phase only. In the future this will spawn a separate
 * compiler agent process. For now it returns immediately with a
 * placeholder summary.
 */

import type { Tool } from '../index.js';

export const compileTool: Tool = {
  definition: {
    name: 'compileSpec',
    description:
      'Compile the spec into code for the first time. Call this when the spec is complete enough to generate meaningful code — it should define data models, workflows, roles, and at least one interface. Do not call this if the spec is incomplete or ambiguous; instead, guide the user to fill in the gaps first.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  async execute() {
    return 'Compilation complete (stub). Generated 0 files — compiler agent not yet implemented.\n\nThe project will transition to iterating phase.';
  },
};
