/**
 * System prompt for the design expert sub-agent.
 *
 * Assembles the prompt from markdown templates (prompts/) and injects
 * fresh random samples of fonts and inspiration images on each call.
 * Also injects current spec files so the agent has project context.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSpecContext } from '../common/context.js';
import { getFontLibrarySample } from './data/getFontLibrarySample.js';
import { getDesignReferencesSample } from './data/getDesignReferencesSample.js';

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function resolvePath(filename: string): string {
  const local = path.join(base, filename);
  return fs.existsSync(local)
    ? local
    : path.join(base, 'subagents', 'designExpert', filename);
}

function readFile(filename: string): string {
  return fs.readFileSync(resolvePath(filename), 'utf-8').trim();
}

// ---------------------------------------------------------------------------
// Template assembly (runs once at module init)
// ---------------------------------------------------------------------------

const RUNTIME_PLACEHOLDERS = new Set(['font_library', 'design_references']);

const PROMPT_TEMPLATE = readFile('prompt.md')
  .replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const k = key.trim();
    return RUNTIME_PLACEHOLDERS.has(k) ? match : readFile(k);
  })
  .replace(/\n{3,}/g, '\n\n');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the design research prompt with fresh random samples.
 * Call per invocation, not once at init.
 */
export function getDesignExpertPrompt(): string {
  const specContext = loadSpecContext();

  let prompt = PROMPT_TEMPLATE.replace(
    '{{font_library}}',
    getFontLibrarySample(),
  ).replace('{{design_references}}', getDesignReferencesSample());

  if (specContext) {
    prompt += `\n\n${specContext}`;
  }

  return prompt;
}
