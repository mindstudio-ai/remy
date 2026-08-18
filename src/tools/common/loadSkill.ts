/**
 * Load a reference doc that isn't carried in the system prompt.
 *
 * The catalog of what's available — and the trigger for each — is resident in
 * `<available_skills>`; see prompt/skills/catalog.ts for why these docs live
 * one layer away. The result is `clearable`, so a loaded body ages out of the
 * conversation like any file read; the catalog keeps the path resident so it
 * can be re-read, which is why nothing here tracks what's currently loaded.
 */

import type { Tool } from '../index.js';
import {
  SKILL_IDS,
  getSkill,
  readSkillBody,
} from '../../prompt/skills/catalog.js';

export const loadSkillTool: Tool = {
  definition: {
    clearable: true,
    name: 'loadSkill',
    description:
      "Load the full reference for a platform capability that isn't in your system prompt — task agents, agent interfaces, voice interfaces, MCP interfaces, data sources. The available skills and the trigger for each are listed in <available_skills>. Load one before writing code in its area, not after: these are APIs where a plausible-looking guess is usually wrong. Calling this is cheap and expected — if you're unsure whether you need it, load it. Only covers the capabilities listed in the catalog; for backend SDK actions and model IDs use askMindStudioSdk.",
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          // Omitted when the catalog is empty: an empty enum is a schema no
          // provider accepts, and failing one tool call beats failing every
          // request if the docs ever go missing from a build.
          ...(SKILL_IDS.length > 0 ? { enum: SKILL_IDS } : {}),
          description: 'The skill id, as listed in <available_skills>.',
        },
      },
      required: ['skill'],
    },
  },

  async execute(input) {
    const id = String(input.skill ?? '');
    const skill = getSkill(id);
    if (!skill) {
      return `Error: unknown skill "${id}". Available: ${SKILL_IDS.join(', ') || '(none)'}`;
    }
    try {
      const body = readSkillBody(skill);
      return `${body}\n\n---\nThis reference lives at ${skill.path}. Re-read it with readFile if you need it again later — it won't stay in the conversation.`;
    } catch (err: any) {
      return `Error loading skill "${id}": ${err.message}`;
    }
  },
};
