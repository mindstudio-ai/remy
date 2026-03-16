/**
 * Recompile tool (stub) — re-generate code from the spec.
 *
 * Iterating phase only. Used when the spec has diverged significantly
 * from the code. In the future this will spawn a separate compiler
 * agent process. For now it returns immediately.
 */

import type { Tool } from '../index.js';

export const recompileTool: Tool = {
  definition: {
    name: 'recompileSpec',
    description:
      'Re-generate code from the spec. Use this when the spec has diverged significantly from the code, or the user explicitly asks to regenerate. This is destructive to manual code changes in dist/ — warn the user before calling. Optionally scope to a specific section by heading path.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description:
            'Optional heading path to limit regeneration to a specific section (e.g., "Invoices"). Without this, regenerates everything.',
        },
      },
    },
  },

  async execute(input) {
    const scope = input.scope
      ? ` Scope: "${input.scope}".`
      : ' Scope: full project.';
    return `Recompilation complete (stub).${scope} Generated 0 files — compiler agent not yet implemented.`;
  },
};
