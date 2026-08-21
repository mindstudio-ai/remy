/**
 * The main agent's skill catalog.
 *
 * A skill here is a reference doc for a platform capability most apps never
 * use — task agents, agent interfaces, MCP interfaces, data sources. Carrying
 * them in the system prompt cost ~8.5k tokens on every turn of every session
 * and put vector search and MCP annotations in front of the agent while it
 * built apps that would never need either. So they live one layer away: the
 * catalog stays resident, and the body arrives as a `loadSkill` tool result
 * when the trigger fires. Mechanics live in the shared factory
 * (`src/skillCatalog.ts`); this module is the `prompt/skills/` instance.
 */

import { buildSkillCatalog, type Skill } from '../../skillCatalog.js';
import { assetPath } from '../../assets.js';

export type { Skill } from '../../skillCatalog.js';

const INTRO = `Platform capabilities most apps don't use, so their references are kept out of this prompt rather than competing for your attention on every task — not because they're marginal.

Read what follows as part of what the platform can do, not as a lookup table. Recognising that one of these fits a feature is your job, and proposing one is fair game — several of them are the difference between an app that works and an app worth showing off. When a trigger fires, load the reference with loadSkill before writing the code rather than after. Loading is cheap and expected; guessing at one of these APIs is not.

A loaded reference drops out of the conversation once it ages out. Re-read it at the path listed with readFile whenever you need it again.`;

const catalog = buildSkillCatalog({
  dir: assetPath('prompt', 'skills'),
  tag: 'available_skills',
  intro: INTRO,
});

export const SKILLS: Skill[] = catalog.skills;

/** Valid `loadSkill` ids, sorted. Used for the tool's input enum. */
export const SKILL_IDS: string[] = catalog.ids;

export function getSkill(id: string): Skill | undefined {
  return catalog.get(id);
}

/** The doc with its frontmatter stripped. Read fresh on every call. */
export function readSkillBody(skill: Skill): string {
  return catalog.readBody(skill);
}

/**
 * The resident catalog block. Empty string when there are no skills, so the
 * prompt carries no dangling section.
 */
export function loadSkillsCatalog(): string {
  return catalog.renderCatalogBlock();
}
