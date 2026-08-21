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
import { designSkillCatalog } from './skills/catalog.js';
import { loadSpecIndex } from '../common/context.js';
import { getOrgContext } from '../../orgContext.js';
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

// Render mode's contract, stated once.
//
// Everything in prompt.md casts this agent as an advisor whose deliverable is a
// message: "an expert developer who will implement exactly what you propose"
// (identity.md), "The developer interprets your results" (instructions.md), plus
// the guidance throughout on specifying layouts in prose and writing
// implementation notes. That's right for the public visualDesignExpert tool,
// which is nearly all of its traffic, and untrue when the agent writes the file
// itself. Without this block the render brief is one paragraph arguing against
// the whole system prompt, and the failure mode is the agent composing the
// document in its thinking and replying with the summary the brief asked for —
// no file, and nothing in the reply to recover it from.
//
// Names the three instructions that actually misfire rather than trying to undo
// the persona wholesale, which is what keeps it this short.
const RENDER_TASK_BLOCK = `<render_task>
This task is a render: you are the author of the artifact, not an advisor on it. Everything above describes your usual work — proposing a design to a developer who then builds it. Here there is no developer downstream. You write the file the brief names, using writeFile (or editFile when it already exists), and that file is the entire deliverable.

The guidance about specifying layouts in prose, writing implementation notes, and keeping wireframes small doesn't apply here: it exists to hand a design to someone else to build, and you are the one building it. Your reply is a receipt — one line naming what you wrote.
</render_task>`;

/**
 * Render the org-level design-system block for the prompt tail, when the org
 * has one set. Facts plus soft framing: it's a foundational reference to orient
 * toward (fetched on demand with scrapeWebUrl), not a rulebook. Returns '' when
 * no design system is set.
 */
export function renderDesignSystemBlock(designSystem?: string): string {
  if (!designSystem) {
    return '';
  }
  return [
    '<design_system>',
    `The organization that owns this app publishes a design system at ${designSystem}. Treat it as the primary reference for this app's foundational visual language — palette, type, spacing, and the core component patterns that should feel consistent with the org's other products. Consult it for foundational decisions and fetch it with scrapeWebUrl when you need specifics (it's usually a hosted doc such as an llms.txt). It's a resource to orient toward, not a rulebook: you don't need to ground every detail in it, and app-specific or expressive choices are still yours to make.`,
    '</design_system>',
  ].join('\n');
}

/**
 * Build the design research prompt with session-stable samples.
 * Call per invocation — samples are stable across calls within a session.
 *
 * `render` swaps the advisor contract for the authoring one. It lands after the
 * cache breakpoint, so both modes share a byte-identical cached prefix.
 */
export function getDesignExpertPrompt(
  onboardingState?: string,
  opts?: { render?: boolean },
): string {
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

  // The craft-skill catalog. Appended in code rather than as a prompt.md
  // include because it's computed from the skills directory, not a fragment —
  // and it must land before the breakpoint: the block is fixed for the
  // process lifetime (ids feed the loadSkill enum), so it's cache-stable.
  const skillsBlock = designSkillCatalog.renderCatalogBlock();
  if (skillsBlock) {
    prompt += `\n\n${skillsBlock}`;
  }

  prompt += '\n\n<!-- cache_breakpoint -->';
  if (specContext) {
    prompt += `\n\n${specContext}`;
  }

  const designSystemBlock = renderDesignSystemBlock(
    getOrgContext()?.designSystem,
  );
  if (designSystemBlock) {
    prompt += `\n\n${designSystemBlock}`;
  }

  const state = onboardingState ?? 'onboardingFinished';
  if (state !== 'onboardingFinished') {
    prompt += `\n\n<project_phase>\nThis project is in the "${state}" phase. The codebase is a placeholder scaffold or is being generated for the first time.\n</project_phase>`;
  }

  // Last, so the contract it states is the closest thing to the task itself.
  if (opts?.render) {
    prompt += `\n\n${RENDER_TASK_BLOCK}`;
  }

  return prompt;
}
