/**
 * System prompt for the design expert sub-agent.
 *
 * Assembles the prompt from markdown templates (prompts/) and injects
 * session-stable samples of fonts and inspiration images. Samples are
 * generated once per session and persisted to .remy-design-sample.json
 * so the design expert has a consistent aesthetic frame of reference
 * across calls (and prompt caching stays effective).
 */

import fs from 'node:fs';
import { readAsset } from '../../assets.js';
import { loadSpecIndex } from '../common/context.js';
import { getSampleIndices } from './data/sampleCache.js';
import { getFontLibrarySample, fontData } from './data/getFontLibrarySample.js';
import {
  getDesignReferencesSample,
  inspirationImages,
} from './data/getDesignReferencesSample.js';
import {
  getUiInspirationSample,
  uiScreens,
} from './data/getUiInspirationSample.js';

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
 * Build the design research prompt with session-stable samples.
 * Call per invocation — samples are stable across calls within a session.
 */
export function getDesignExpertPrompt(onboardingState?: string): string {
  const specContext = loadSpecIndex();

  // Get or create stable sample indices for this session
  const indices = getSampleIndices(
    {
      uiInspiration: uiScreens.length,
      designReferences: inspirationImages.length,
      fonts: fontData.fonts.length,
    },
    {
      uiInspiration: 50,
      designReferences: 25,
      fonts: 50,
    },
  );

  let prompt = PROMPT_TEMPLATE.replace(
    '{{font_library}}',
    getFontLibrarySample(indices.fonts),
  )
    .replace(
      '{{visual_design_references}}',
      getDesignReferencesSample(indices.designReferences),
    )
    .replace(
      '{{ui_case_studies}}',
      getUiInspirationSample(indices.uiInspiration),
    );

  prompt += '\n\n<!-- cache_breakpoint -->';
  if (specContext) {
    prompt += `\n\n${specContext}`;
  }

  const state = onboardingState ?? 'onboardingFinished';
  if (state !== 'onboardingFinished') {
    prompt += `\n\n<project_phase>\nThis project is in the "${state}" phase. The codebase is a placeholder scaffold or is being generated for the first time.\n</project_phase>`;
  }

  return prompt;
}
