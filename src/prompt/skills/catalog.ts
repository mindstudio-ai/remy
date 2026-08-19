/**
 * Skill catalog.
 *
 * A skill is a reference doc for a capability most apps never use — task
 * agents, agent interfaces, MCP interfaces, data sources. Carrying them in the
 * system prompt cost ~8.5k tokens on every turn of every session and put vector
 * search and MCP annotations in front of the agent while it built apps that
 * would never need either. So they live one layer away: this catalog (a name, a
 * trigger, and a path per skill) stays resident, and the body arrives as a
 * `loadSkill` tool result when the trigger fires.
 *
 * The path is listed for *every* skill rather than only loaded ones, which is
 * what keeps this stateless. A `loadSkill` result ages out of the conversation
 * like any file read — the agent can always get it back from the catalog with
 * readFile, including after a compaction that dropped every trace of the
 * original call. Nothing to pin, track, or persist.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assetPath } from '../../assets.js';

export interface Skill {
  /** camelCase id — the `loadSkill` argument. */
  id: string;
  /** Human-readable label, e.g. "Task Agents". */
  name: string;
  /**
   * What the capability is and how far it reaches.
   *
   * Carries the weight `when` can't: a trigger tells the agent it may load
   * something, but it can't make the agent want to. While these docs were
   * resident, their opening argument for the capability was read on every turn —
   * taskAgents.md still contains the best pitch in the corpus, now behind the
   * load, and the load needs the pitch. This is that argument, hoisted.
   */
  what: string;
  /** When to load it, phrased as a trigger. Rendered into the prompt. */
  when: string;
  /** Absolute path to the doc, so the agent can re-read it with readFile. */
  path: string;
}

const SKILLS_DIR = assetPath('prompt', 'skills');

/**
 * Frontmatter with single-line values, matching the two parsers already in the
 * codebase (`prompt/static/projectContext.ts`, `subagents/common/context.ts`).
 * A `when` that wraps onto a second line silently loses everything after the
 * first, so keep each value on one line.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
  }
  return fields;
}

/**
 * Read the catalog once at module init, sorted by id.
 *
 * Deliberately not re-read per call: the ids become the `loadSkill` input
 * enum, and the tool definitions are the first prompt-cache prefix segment, so
 * the set a process advertises has to stay fixed for its lifetime. Skill
 * *bodies* are read on demand (see `readSkillBody`), so editing a doc takes
 * effect without a restart — only adding or removing one needs one.
 */
function loadCatalog(): Skill[] {
  let files: string[];
  try {
    files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const file of files.sort()) {
    const full = path.join(SKILLS_DIR, file);
    const id = file.replace(/\.md$/, '');
    const fields = parseFrontmatter(fs.readFileSync(full, 'utf-8'));
    if (!fields.name || !fields.what || !fields.when) {
      // Missing frontmatter means it can't be described to the agent, and a
      // skill it can't recognise the trigger for is worse than one it doesn't
      // know exists. The build-time check in tsup.config.ts catches this.
      continue;
    }
    skills.push({
      id,
      name: fields.name,
      what: fields.what,
      when: fields.when,
      path: full,
    });
  }
  return skills;
}

export const SKILLS: Skill[] = loadCatalog();

/** Valid `loadSkill` ids, sorted. Used for the tool's input enum. */
export const SKILL_IDS: string[] = SKILLS.map((s) => s.id);

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

/** The doc with its frontmatter stripped. Read fresh on every call. */
export function readSkillBody(skill: Skill): string {
  return fs
    .readFileSync(skill.path, 'utf-8')
    .replace(/^---[\s\S]*?---\s*/, '')
    .trim();
}

/**
 * The resident catalog block. Empty string when there are no skills, so the
 * prompt carries no dangling section.
 */
export function loadSkillsCatalog(): string {
  if (SKILLS.length === 0) {
    return '';
  }
  const entries = SKILLS.map((s) =>
    [
      `### ${s.name} (\`${s.id}\`)`,
      s.what,
      '',
      `When to load: ${s.when}`,
      `Reference: ${s.path}`,
    ].join('\n'),
  );
  return `<available_skills>
Platform capabilities most apps don't use, so their references are kept out of this prompt rather than competing for your attention on every task — not because they're marginal.

Read what follows as part of what the platform can do, not as a lookup table. Recognising that one of these fits a feature is your job, and proposing one is fair game — several of them are the difference between an app that works and an app worth showing off. When a trigger fires, load the reference with loadSkill before writing the code rather than after. Loading is cheap and expected; guessing at one of these APIs is not.

A loaded reference drops out of the conversation once it ages out. Re-read it at the path listed with readFile whenever you need it again.

${entries.join('\n\n')}
</available_skills>`;
}
