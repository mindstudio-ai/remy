/**
 * Load a craft reference that isn't carried in the design expert's prompt.
 *
 * Mirrors the main agent's loadSkill (tools/common/loadSkill.ts) over the
 * design expert's own catalog. The catalog of what's available — and the
 * trigger for each — is resident in <available_skills>; a loaded body ages
 * out of the conversation at the next compaction like any file read, and the
 * catalog keeps the path resident so it can be re-read.
 */

import type { ToolDefinition } from '../../../api.js';
import { designSkillCatalog } from '../skills/_catalog.js';

export const definition: ToolDefinition = {
  name: 'loadSkill',
  description:
    "Load the full craft reference for a design surface that isn't in your prompt. The available skills and the trigger for each are listed in <available_skills>. Load one before designing in its area, not after — these are hard-won technique recipes, and the defaulted version of these surfaces is exactly what they exist to prevent. Calling this is cheap and expected — if you're unsure whether you need it, load it.",
  inputSchema: {
    type: 'object',
    properties: {
      skill: {
        type: 'string',
        // Omitted when the catalog is empty: an empty enum is a schema no
        // provider accepts, and failing one tool call beats failing every
        // request if the docs ever go missing from a build.
        ...(designSkillCatalog.ids.length > 0
          ? { enum: designSkillCatalog.ids }
          : {}),
        description: 'The skill id, as listed in <available_skills>.',
      },
    },
    required: ['skill'],
  },
};

export async function execute(input: Record<string, any>): Promise<string> {
  const id = String(input.skill ?? '');
  const skill = designSkillCatalog.get(id);
  if (!skill) {
    return `Error: unknown skill "${id}". Available: ${designSkillCatalog.ids.join(', ') || '(none)'}`;
  }
  try {
    const body = designSkillCatalog.readBody(skill);
    return `${body}\n\n---\nThis reference lives at ${skill.path}. Re-read it with readFile if you need it again later — it won't stay in the conversation.`;
  } catch (err: any) {
    return `Error loading skill "${id}": ${err.message}`;
  }
}
