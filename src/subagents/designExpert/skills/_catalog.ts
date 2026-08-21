/**
 * The design expert's craft-skill catalog.
 *
 * A craft skill is a deep, implementable design reference for a specific
 * surface — the kind of recipe that's decisive when the brief touches its
 * area and dead weight on every other invocation. Keeping them out of the
 * resident prompt is what lets them be *deep*: a resident section earns its
 * tokens on every call; a skill only has to earn them when loaded. Mechanics
 * live in the shared factory (`src/skillCatalog.ts`); this module is the
 * `subagents/designExpert/skills/` instance.
 */

import { buildSkillCatalog, type SkillCatalog } from '../../../skillCatalog.js';
import { assetPath } from '../../../assets.js';

const INTRO = `Deep craft references for specific surfaces, kept out of this prompt so they can go far beyond what a resident section could — full technique recipes, worked examples, quality bars. Recognising that one of these fits the brief is part of your job as much as the design work itself: when a trigger fires, load the reference with loadSkill before designing in that area, not after. The craft in these docs is the difference between a defaulted artifact and a designed one.

A loaded reference drops out of the conversation once it ages out. Re-read it at the path listed with readFile whenever you need it again.`;

export const designSkillCatalog: SkillCatalog = buildSkillCatalog({
  dir: assetPath('subagents/designExpert', 'skills'),
  tag: 'available_skills',
  intro: INTRO,
});
