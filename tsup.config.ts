import { defineConfig } from 'tsup';
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

/** Non-code files loaded at runtime through assetPath()/readAsset(). */
const ASSET_PATTERN = /\.(md|json|sh|txt|mjs|html)$/;

/**
 * Internal docs: worth having in the repo, dead weight in the package. Design
 * notes, the fragment-compilation instructions, and prompt/sources/ (a vendored
 * ~99KB llms.txt that is an input to hand-compilation, with no runtime reader).
 */
const EXCLUDE_FILE = /(\.notes[\w-]*\.md|README\.md)$/;
const EXCLUDE_DIR = /[/\\]prompt[/\\]sources$/;

/**
 * Copy runtime assets into dist/, preserving the src/ layout so assetPath()
 * resolves identically from either root.
 *
 * One pair for all of src/ rather than a per-directory allowlist: a new
 * directory of prompts used to need a line here, and forgetting it produced a
 * build that threw `Required asset missing:` in production only.
 */
function copyAssets() {
  cpSync(resolve('src'), resolve('dist'), {
    recursive: true,
    filter: (src) =>
      statSync(src).isDirectory()
        ? !EXCLUDE_DIR.test(src)
        : ASSET_PATTERN.test(src) && !EXCLUDE_FILE.test(src),
  });
}

/**
 * Verify the prompt wiring after a build.
 *
 * Every {{include}} in the system prompt template is resolved at request time by
 * a plain file read that throws, so a typo or a missed copy surfaces as a failed
 * turn in production rather than a failed build. These checks move that to here.
 *
 * Scans the *template* in prompt/index.ts, not the assembled prompt: fragments
 * legitimately contain `{{arg}}`-style placeholders as documentation (see the
 * MCP prompt templates in interfaces.md), and resolveIncludes never rescans
 * included text, so those are content rather than dangling includes.
 */
function checkPrompts() {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Just the template literal: the file's own docstrings use `{{filename}}` and
  // `{{path/to/file.md}}` as examples. Fails loudly if the shape changes, rather
  // than silently checking an empty string.
  const source = readFileSync(resolve('src/prompt/index.ts'), 'utf-8');
  const start = source.indexOf('const template = `');
  const end = source.lastIndexOf('`;');
  if (start === -1 || end <= start) {
    throw new Error('Prompt check: could not locate the template in index.ts');
  }
  const template = source.slice(start, end);

  const includes = [...template.matchAll(/\{\{([^}]+)\}\}/g)].map((m) =>
    m[1].trim(),
  );

  for (const rel of includes) {
    for (const root of ['src', 'dist']) {
      if (!existsSync(resolve(root, 'prompt', rel))) {
        errors.push(`missing include: ${root}/prompt/${rel}`);
      }
    }
  }

  // The server splits the system prompt on the FIRST marker only; a second one
  // reaches the model as literal text.
  const markers = template.split('<!-- cache_breakpoint -->').length - 1;
  if (markers !== 1) {
    errors.push(`prompt/index.ts has ${markers} cache breakpoints, expected 1`);
  }

  const referenced = new Set(includes);
  for (const file of readdirSync(resolve('src/prompt/compiled'))) {
    if (
      file.endsWith('.md') &&
      file !== 'README.md' &&
      !referenced.has(`compiled/${file}`)
    ) {
      warnings.push(`unreferenced fragment: compiled/${file}`);
    }
  }

  // A skill missing frontmatter is skipped by its catalog, so the agent can't
  // see it exists — quieter than a missing file and just as broken. One dir
  // per skillCatalog instance: the main agent's and the design expert's.
  for (const dir of ['prompt/skills', 'subagents/designExpert/skills']) {
    if (!existsSync(resolve('src', dir))) {
      continue;
    }
    for (const file of readdirSync(resolve('src', dir))) {
      if (!file.endsWith('.md')) {
        continue;
      }
      const body = readFileSync(resolve('src', dir, file), 'utf-8');
      const fm = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      for (const field of ['name', 'what', 'when']) {
        if (!new RegExp(`^${field}:\\s*\\S`, 'm').test(fm)) {
          errors.push(`${dir}/${file} is missing \`${field}\` frontmatter`);
        }
      }
      if (!existsSync(resolve('dist', dir, file))) {
        errors.push(`skill not copied to dist: ${dir}/${file}`);
      }
    }
  }

  for (const w of warnings) {
    console.warn(`  warn  ${w}`);
  }
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`  ERROR ${e}`);
    }
    // Watch mode keeps going — killing the watcher on a half-saved file makes
    // it useless mid-edit — but a one-shot build has to fail.
    if (process.argv.includes('--watch')) {
      console.error('Prompt check failed.');
    } else {
      throw new Error(`Prompt check failed with ${errors.length} error(s)`);
    }
  }
}

export default defineConfig([
  {
    entry: ['src/index.tsx'],
    format: ['esm'],
    clean: true,
    splitting: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    onSuccess: () => {
      copyAssets();
      console.log('Copied static assets to dist/');
      checkPrompts();
    },
  },
  {
    entry: { headless: 'src/headless/index.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: false,
    dts: true,
  },
]);
