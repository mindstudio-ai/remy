/**
 * Skill-catalog factory.
 *
 * A skill is a reference doc that's too rarely needed to carry in a system
 * prompt: the catalog (a name, a trigger, and a path per skill) stays
 * resident, and the body arrives as a `loadSkill` tool result when the
 * trigger fires. The main agent's platform-capability skills
 * (`prompt/skills/`) and the design expert's craft skills
 * (`subagents/designExpert/skills/`) are both instances of this factory —
 * same frontmatter contract, same catalog block shape, different directory
 * and framing.
 *
 * The path is listed for *every* skill rather than only loaded ones, which is
 * what keeps this stateless. A `loadSkill` result ages out of the conversation
 * like any file read — the agent can always get it back from the catalog with
 * readFile, including after a compaction that dropped every trace of the
 * original call. Nothing to pin, track, or persist.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface Skill {
  /** camelCase id — the `loadSkill` argument. */
  id: string;
  /** Human-readable label, e.g. "Task Agents". */
  name: string;
  /**
   * What the capability is and how far it reaches.
   *
   * Carries the weight `when` can't: a trigger tells the agent it may load
   * something, but it can't make the agent want to. This is the doc's opening
   * argument for the capability, hoisted into the resident catalog.
   */
  what: string;
  /** When to load it, phrased as a trigger. Rendered into the prompt. */
  when: string;
  /** Absolute path to the doc, so the agent can re-read it with readFile. */
  path: string;
}

export interface SkillCatalog {
  /** All skills, sorted by id. Fixed for the process lifetime. */
  skills: Skill[];
  /** Valid `loadSkill` ids, sorted. Used for the tool's input enum. */
  ids: string[];
  get(id: string): Skill | undefined;
  /** The doc with its frontmatter stripped. Read fresh on every call. */
  readBody(skill: Skill): string;
  /** The resident catalog block. Empty string when there are no skills, so
   * the prompt carries no dangling section. */
  renderCatalogBlock(): string;
}

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
 * Build a catalog by reading `dir` once at call time (callers invoke this at
 * module init, sorted by id).
 *
 * Deliberately not re-read per call: the ids become a `loadSkill` input enum,
 * and the tool definitions are the first prompt-cache prefix segment, so the
 * set a process advertises has to stay fixed for its lifetime. Skill *bodies*
 * are read on demand (see `readBody`), so editing a doc takes effect without a
 * restart — only adding or removing one needs one.
 */
export function buildSkillCatalog(opts: {
  /** Absolute directory of skill `.md` files (use `assetPath(...)`). */
  dir: string;
  /** Wrapper tag for the catalog block, e.g. `available_skills`. */
  tag: string;
  /** The framing paragraphs rendered above the entries. */
  intro: string;
}): SkillCatalog {
  let files: string[];
  try {
    files = fs.readdirSync(opts.dir).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const skills: Skill[] = [];
  for (const file of files.sort()) {
    const full = path.join(opts.dir, file);
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

  return {
    skills,
    ids: skills.map((s) => s.id),
    get(id: string): Skill | undefined {
      return skills.find((s) => s.id === id);
    },
    readBody(skill: Skill): string {
      return fs
        .readFileSync(skill.path, 'utf-8')
        .replace(/^---[\s\S]*?---\s*/, '')
        .trim();
    },
    renderCatalogBlock(): string {
      if (skills.length === 0) {
        return '';
      }
      const entries = skills.map((s) =>
        [
          `### ${s.name} (\`${s.id}\`)`,
          s.what,
          '',
          `When to load: ${s.when}`,
          `Reference: ${s.path}`,
        ].join('\n'),
      );
      return `<${opts.tag}>\n${opts.intro}\n\n${entries.join('\n\n')}\n</${opts.tag}>`;
    },
  };
}
