/**
 * Every pickable model surface in Remy, and the model each one resolves to.
 *
 * The surface IDENTIFIERS live here because they are code-level vocabulary —
 * Remy has a `parent` agent, a `specSync` subagent, a `brandExtractor` utility,
 * and ~24 files call `resolveModel('parent')` with a literal. Adding a surface
 * means writing code for it, so its name has to be known at compile time.
 *
 * Everything ELSE about a surface — its label, description, default model, and
 * which models are pickable at all — comes from the platform at boot, over
 * `/v1/site-settings/remy-model-surfaces`. That is the same payload the org
 * "default models" settings UI renders from, so the two cannot disagree about
 * what is offered or what an unset surface falls back to. They used to: this
 * file and youai-api's copy drifted in both directions, and the visible symptom
 * was an org setting `gemini-3.8-flash` as a default, the platform storing it,
 * and Remy silently dropping it as out-of-allow-list.
 *
 * The compaction thresholds come from the platform too, declared per model
 * alongside the allow-list. They live there rather than here because that is
 * where the two numbers they must respect are also declared — the usable input
 * ceiling and the pricing cliff — so `defineModel` can refuse a threshold that
 * contradicts them. A copy here could be checked against nothing.
 *
 * Every call site goes through `resolveModel(surfaceId, models, fallback)` —
 * four-tier resolution: explicit user pick > startup-time global override >
 * org default > registry default.
 */

import type { ModelSurfacesPayload } from '../api.js';

export type ModelType = 'text' | 'vision' | 'image_generation';

export interface ModelSurface {
  /** Authoritative default model ID, as published by the platform. */
  default: string;
  /** Short display name for the picker UI (e.g. "Roadmap Agent"). */
  label: string;
  /** Longer user-facing description for the picker. */
  description: string;
  /** Model family this surface picks from. The frontend uses this to scope
   * the picker's options list. */
  modelType: ModelType;
  /** Whether this surface appears in the picker UI. */
  userPickable: boolean;
}

/**
 * The surfaces Remy knows how to run, in picker order.
 *
 * A surface the platform publishes but that is missing here is ignored — Remy
 * has no code to run it. A surface here that the platform does not publish is
 * a deploy-order problem and surfaces as a hard error at boot (see
 * `setModelRegistry`), rather than as an agent quietly running on a fallback.
 */
export const SURFACE_IDS = [
  'parent',
  'visualDesignExpert',
  'productVision',
  'browserAutomation',
  'codeSanityCheck',
  'research',
  'reviewExistingProject',
  'copyEditor',
  'specSync',
  'imageGeneration',
  'imageAnalysis',
  'conversationSummarizer',
  'brandExtractor',
  'imagePromptEnhancer',
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

/**
 * Context-management thresholds for one text model, in provider-reported input
 * tokens. Declared per model in the platform catalog and fetched at boot.
 *
 * Explicit numbers rather than percentages of a context window, because what
 * matters is the usable input ceiling under the provider's output/reasoning
 * reserve and where the pricing tier flips — neither of which a formula
 * recovers. RPT-1209 is the cost of getting it wrong: a fixed 850K gate sat
 * above gpt-5.6-terra's ~794K truncation ceiling, so the gate never fired and
 * the session paid max-context prices on every call, forever.
 */
export interface ModelContextLimits {
  /** Force a blocking compaction before the next turn once the previous turn's
   * last API call exceeded this. Must sit comfortably below the model's usable
   * input ceiling, with room for a heavy turn's own growth (~150K+). */
  forceCompactAt: number;
  /** Where the frontend composer starts suggesting `/compact` (the ContextBar
   * affordance). Just below the model's pricing-tier boundary, so the
   * suggestion appears before the price flips. */
  suggestCompactAt?: number;
}

// The /compact suggestion point for flat-priced models — no price cliff to
// stay under, so this is purely the "worth condensing by now" size.
const DEFAULT_SUGGEST_COMPACT_AT = 300_000;

// No local threshold table, and no derivation from context windows. Both are
// deliberate: the numbers are declared per model in youai-api's catalog
// (`defineModel({ remy: { forceCompactAt, suggestCompactAt? } })`), where
// `defineModel` can check them against the two facts they have to respect —
// the usable input ceiling and the pricing cliff. A copy here could not be
// checked against anything, and drifted: this file had `gemini-3-pro` as
// flat-priced when it declares a 200K tier, so it never warned before that
// model's input price roughly doubled.

/**
 * Conservative fallback for an id the platform published no thresholds for.
 *
 * Reachable only through a dev `--model` override naming something outside the
 * allow-list — a normal pick is validated against it, so this is not a path a
 * user can take.
 */
const FALLBACK_CONTEXT_LIMITS: ModelContextLimits = { forceCompactAt: 850_000 };

//////////////////////////////////////////////////////////////////////////////
// Boot-loaded platform state
//////////////////////////////////////////////////////////////////////////////

let surfaces: Partial<Record<SurfaceId, ModelSurface>> = {};
let allowedModelsByType: Partial<Record<ModelType, string[]>> = {};
let textModels = new Map<string, ModelContextLimits>();
let registryLoaded = false;

/**
 * Publish the platform's surface registry into this module. Called once at
 * boot, before anything resolves a model.
 *
 * Throws when the platform does not publish a surface Remy has code for: that
 * means a Remy release expecting a surface the deployed platform has not
 * shipped yet, and the honest outcome is a loud boot failure rather than every
 * agent on that surface silently running someone else's default.
 */
export function setModelRegistry(payload: ModelSurfacesPayload): void {
  const bySurface: Partial<Record<SurfaceId, ModelSurface>> = {};
  for (const surface of payload.surfaces) {
    if ((SURFACE_IDS as readonly string[]).includes(surface.id)) {
      bySurface[surface.id as SurfaceId] = {
        default: surface.default,
        label: surface.label,
        description: surface.description,
        modelType: surface.modelType,
        // The platform only publishes user-pickable surfaces; internal ones
        // (imagePromptEnhancer) are Remy's own and never appear in a picker.
        userPickable: true,
      };
    }
  }

  const missing = SURFACE_IDS.filter(
    (id) => !bySurface[id] && id !== 'imagePromptEnhancer',
  );
  if (missing.length > 0) {
    throw new Error(
      `The platform published no model surface for: ${missing.join(', ')}. ` +
        `This Remy build expects them — the platform is likely older than this release.`,
    );
  }

  // Internal surface, not published: Remy uses it to rewrite design briefs
  // into model-optimized image prompts. Follows the parent's own default.
  bySurface.imagePromptEnhancer = {
    default: bySurface.conversationSummarizer!.default,
    label: 'Image Prompt Enhancer',
    description:
      'Rewrites image briefs into model-optimized prompts before image generation.',
    modelType: 'text',
    userPickable: false,
  };

  surfaces = bySurface;
  allowedModelsByType = payload.allowedModelsByType ?? {};
  textModels = parseTextModels(payload.textModels);
  registryLoaded = true;
}

/**
 * Accept the platform's `textModels` table, keeping only entries that carry a
 * usable `forceCompactAt`.
 *
 * Validated rather than trusted because a bad number here is expensive and
 * silent in both directions: too high and the compaction gate never fires
 * (RPT-1209), too low and every session compacts constantly. An entry that
 * fails falls through to FALLBACK_CONTEXT_LIMITS, which is conservative.
 */
function parseTextModels(
  raw: Record<string, ModelContextLimits> | undefined,
): Map<string, ModelContextLimits> {
  const out = new Map<string, ModelContextLimits>();
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  for (const [id, value] of Object.entries(raw)) {
    const force = value?.forceCompactAt;
    if (
      !id ||
      typeof force !== 'number' ||
      !Number.isFinite(force) ||
      force <= 0
    ) {
      continue;
    }
    const suggest = value?.suggestCompactAt;
    out.set(id, {
      forceCompactAt: force,
      ...(typeof suggest === 'number' && Number.isFinite(suggest) && suggest > 0
        ? { suggestCompactAt: suggest }
        : {}),
    });
  }
  return out;
}

function requireSurface(surfaceId: SurfaceId): ModelSurface {
  const surface = surfaces[surfaceId];
  if (!surface) {
    throw new Error(
      registryLoaded
        ? `Unknown model surface '${surfaceId}'.`
        : `Model surfaces were read before the platform registry loaded (surface '${surfaceId}'). ` +
            `setModelRegistry must run during boot.`,
    );
  }
  return surface;
}

/** Allow-list of pickable model IDs by type, as published by the platform. */
export function getAllowedModelsByType(): Partial<Record<ModelType, string[]>> {
  return allowedModelsByType;
}

/**
 * Context thresholds for a model id, as declared by the platform.
 *
 * A missing entry means the id is outside the allow-list, which a validated
 * pick cannot be — only a dev `--model` override reaches it.
 */
export function getContextLimits(modelId: string): ModelContextLimits {
  return textModels.get(modelId) ?? FALLBACK_CONTEXT_LIMITS;
}

/** Where the frontend starts suggesting `/compact` for this model. */
export function getSuggestCompactAt(modelId: string): number {
  return (
    getContextLimits(modelId).suggestCompactAt ?? DEFAULT_SUGGEST_COMPACT_AT
  );
}

/**
 * Org-configured default model picks, validated and held for the process
 * lifetime. Populated once at boot from remy-context via setOrgDefaultModels
 * (see orgContext.initOrgContext). Empty when the org sets none or the fetch
 * fails, in which case resolution and the picker behave exactly as with the
 * registry defaults. orgContext pushes into this module (rather than surfaces
 * importing orgContext) to avoid an import cycle.
 */
let orgDefaultModels: Record<string, string> = {};

/** Replace the process-wide org default model picks. Pass an already-validated
 * map (see filterModelPicks). */
export function setOrgDefaultModels(models: Record<string, string>): void {
  orgDefaultModels = models;
}

/**
 * Validate a partial surfaceId -> modelId map against the registry, returning
 * only the entries that are safe to apply. Drops any key that is not a known
 * surface or is not user-pickable; drops any value that isn't a non-empty
 * string or — for surfaces whose modelType has an allow-list (text) — isn't in
 * it. vision and image_generation have no allow-list, so their values pass
 * through. Never throws; fully-invalid input yields {}. Dropped surfaces fall
 * back to the registry default via resolveModel, so a stale or invalid value
 * can never break a build.
 */
export function filterModelPicks(
  picks: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!picks || typeof picks !== 'object') {
    return out;
  }
  for (const [key, value] of Object.entries(picks)) {
    const surface = surfaces[key as SurfaceId];
    if (!surface) {
      continue; // unknown surface
    }
    if (!surface.userPickable) {
      continue; // internal surface (e.g. imagePromptEnhancer)
    }
    if (typeof value !== 'string' || value.length === 0) {
      continue; // require a non-empty string
    }
    const allow = allowedModelsByType[surface.modelType];
    if (allow && !allow.includes(value)) {
      continue; // out of allow-list (text only; vision/image_generation skip)
    }
    out[key] = value;
  }
  return out;
}

/**
 * The surface registry with each `default` overlaid from the org defaults
 * (platform default where the org hasn't set that surface). This is what ships
 * to the frontend picker, so it displays — and "reset to default" lands on —
 * the org default.
 */
export function getEffectiveModelSurfaces(): Record<string, ModelSurface> {
  const out: Record<string, ModelSurface> = {};
  for (const id of SURFACE_IDS) {
    const surface = surfaces[id];
    if (!surface) {
      continue;
    }
    const orgDefault = orgDefaultModels[id];
    out[id] = orgDefault ? { ...surface, default: orgDefault } : { ...surface };
  }
  return out;
}

/**
 * Four-tier resolution: explicit user pick > global startup override >
 * org default > platform default. Always returns a non-empty string.
 */
export function resolveModel(
  surfaceId: SurfaceId,
  models?: Record<string, string>,
  fallback?: string,
): string {
  return (
    models?.[surfaceId] ??
    fallback ??
    orgDefaultModels[surfaceId] ??
    requireSurface(surfaceId).default
  );
}

/**
 * Resolve the parent-agent model for an upcoming turn, including the
 * per-build-turn override that rides on an approve command. `baseline` is
 * what the user would otherwise get (their pick / overrides / default);
 * `effective` is what the turn actually runs on. They differ only when a
 * valid buildModel override is present — callers that flag the divergence
 * (agent.ts's modelOverride) need both, the forced-compaction gate needs
 * just `effective`.
 */
export function resolveParentModel(
  models?: Record<string, string>,
  fallback?: string,
  buildModel?: string,
): { baseline: string; effective: string } {
  const override = buildModel
    ? filterModelPicks({ parent: buildModel }).parent
    : undefined;
  const baseline = resolveModel('parent', models, fallback);
  return { baseline, effective: override ?? baseline };
}
