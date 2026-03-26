/**
 * System prompt for the design expert sub-agent.
 *
 * Assembles the prompt from markdown templates (prompts/) and injects
 * fresh random samples of fonts and inspiration images on each call.
 * Also injects current spec files so the agent has project context.
 */

import fs from 'node:fs';
import { readAsset } from '../../assets.js';
import { loadSpecContext } from '../common/context.js';
import { getFontLibrarySample } from './data/getFontLibrarySample.js';
import { getDesignReferencesSample } from './data/getDesignReferencesSample.js';
import { getUiInspirationSample } from './data/getUiInspirationSample.js';

const SUBAGENT = 'subagents/designExpert';

// ---------------------------------------------------------------------------
// Template assembly (runs once at module init)
// ---------------------------------------------------------------------------

const RUNTIME_PLACEHOLDERS = new Set([
  'font_library',
  'visual_design_references',
  'ui_case_studies',
]);

const PROMPT_TEMPLATE = readAsset(SUBAGENT, 'prompt.md')
  .replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const k = key.trim();
    return RUNTIME_PLACEHOLDERS.has(k) ? match : readAsset(SUBAGENT, k);
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
  )
    .replace('{{visual_design_references}}', getDesignReferencesSample())
    .replace('{{ui_case_studies}}', getUiInspirationSample());

  if (specContext) {
    prompt += `\n\n${specContext}`;
  }

  try {
    fs.writeFileSync(`.design-prompt.md`, prompt);
  } catch {}

  return prompt;
}
