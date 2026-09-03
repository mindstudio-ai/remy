/**
 * Authoritative registry of every pickable model surface in Remy.
 *
 * Single source of truth for defaults, picker metadata, user-facing
 * labels/descriptions, and allow-lists. Every call site that needs a
 * model goes through `resolveModel(surfaceId, models, fallback)` —
 * four-tier resolution: explicit user pick > startup-time global
 * override > org default > registry default.
 *
 * The frontend reads this registry over the stdin protocol (shipped on
 * `session_restored` and `get_history` payloads) and renders the picker
 * UI from it. No duplicated default/label/description knowledge on
 * either side.
 */

export type ModelType = 'text' | 'vision' | 'image_generation';

export interface ModelSurface {
  /** Authoritative default model ID. Remy always resolves to this when
   * the user hasn't picked and no global override is set. */
  default: string;
  /** Short display name for the picker UI (e.g. "Roadmap Agent"). */
  label: string;
  /** Longer user-facing description for the picker. */
  description: string;
  /** Model family this surface picks from. The frontend uses this to
   * scope the picker's options list (text agents pick from the chat
   * allow-list; vision and image_generation pick from their respective
   * catalogs). */
  modelType: ModelType;
  /** Whether this surface appears in the picker UI. False for internal
   * surfaces that Remy uses but the user shouldn't see. */
  userPickable: boolean;
}

// Object key order is preserved by JS — match the frontend's picker order.
export const MODEL_SURFACES = {
  parent: {
    default: 'claude-4-8-opus',
    label: 'Remy',
    description:
      'The main Remy agent you chat with about your product. Writes code and manages delegation to other agents.',
    modelType: 'text',
    userPickable: true,
  },
  visualDesignExpert: {
    default: 'claude-4-8-opus',
    label: 'Design Agent',
    description:
      "Designs your product's interfaces, including components, layouts, typography, color, and visual identity.",
    modelType: 'text',
    userPickable: true,
  },
  productVision: {
    default: 'claude-5-sonnet',
    label: 'Roadmap Agent',
    description:
      "Owns your product's roadmap and pitch deck. Helps decide what to build next and how to frame the big picture.",
    modelType: 'text',
    userPickable: true,
  },
  browserAutomation: {
    default: 'claude-5-sonnet',
    label: 'QA Agent',
    description:
      'Tests features and UI flows in an automated browser to verify they work end to end.',
    modelType: 'text',
    userPickable: true,
  },
  codeSanityCheck: {
    default: 'claude-5-sonnet',
    label: 'Architecture Agent',
    description:
      'Reviews the architecture and structure of code changes to avoid technical debt.',
    modelType: 'text',
    userPickable: true,
  },
  research: {
    default: 'claude-5-sonnet',
    label: 'Research Agent',
    description: 'Researches using the web and reports back with citations.',
    modelType: 'text',
    userPickable: true,
  },
  copyEditor: {
    default: 'claude-5-sonnet',
    label: 'Copy Agent',
    description:
      'Tightens prose and copy across your app and its launch materials so it reads sharp and human, never machine-made.',
    modelType: 'text',
    userPickable: true,
  },
  specSync: {
    default: 'claude-5-sonnet',
    label: 'Spec Sync Agent',
    description:
      'Keeps your spec in sync with the code as you build, updating the affected sections in the background after changes.',
    modelType: 'text',
    userPickable: true,
  },
  imageGeneration: {
    default: 'gpt-image-2',
    label: 'Image Generation',
    description:
      'Creates images for your product — icons, illustrations, photos, and any other visual assets.',
    modelType: 'image_generation',
    userPickable: true,
  },
  imageAnalysis: {
    default: 'claude-5-sonnet',
    label: 'Image Analysis',
    description:
      'Reads screenshots taken by the QA agent during automated browser tests. Other agents use their own built-in image analysis when they need to read images.',
    modelType: 'vision',
    userPickable: true,
  },
  conversationSummarizer: {
    default: 'claude-5-sonnet',
    label: 'Compaction Utility',
    description:
      'Compresses long conversations into summaries to keep things responsive.',
    modelType: 'text',
    userPickable: true,
  },
  brandExtractor: {
    default: 'claude-5-sonnet',
    label: 'Brand Utility',
    description:
      "Extracts your product's name, colors, and fonts from your spec for use in branded documents.",
    modelType: 'text',
    userPickable: true,
  },
  // Internal surface — not user-pickable. Remy uses this to rewrite design
  // briefs into model-optimized image prompts before image generation.
  imagePromptEnhancer: {
    default: 'claude-5-sonnet',
    label: 'Image Prompt Enhancer',
    description:
      'Rewrites image briefs into model-optimized prompts before image generation.',
    modelType: 'text',
    userPickable: false,
  },
} as const satisfies Record<string, ModelSurface>;

export type SurfaceId = keyof typeof MODEL_SURFACES;

/**
 * Context-management thresholds for one text model, in provider-reported
 * input tokens. Explicit per-model numbers, not percentages derived from a
 * context window: what actually matters — the usable input ceiling under the
 * provider's output/reasoning reserve, and where the pricing tier flips — is
 * per-model knowledge that no formula recovers (RPT-1209: a fixed 850K gate
 * sat above gpt-5.6-terra's ~794K truncation ceiling, so the gate never
 * fired and the session paid max-context prices on every call, forever).
 */
export interface ModelContextLimits {
  /** Force a blocking compaction before the next turn once the previous
   * turn's last API call exceeded this. Must sit comfortably below the
   * model's usable input ceiling — for OpenAI models the platform sends
   * `truncation: 'auto'`, which silently caps reported input below the
   * window (and churns the prompt cache), so provider-reported context can
   * NEVER reach a threshold set at or above that ceiling. Leave enough
   * headroom under the ceiling for a heavy turn's own growth (~150K+). */
  forceCompactAt: number;
  /** Where the frontend composer starts suggesting `/compact` to the user
   * (the ContextBar affordance). Set just below the model's pricing-tier
   * boundary — the point where the provider bills all input at a higher
   * rate — so the suggestion appears before the price flips. Omitted for
   * flat-priced models, which fall back to DEFAULT_SUGGEST_COMPACT_AT. */
  suggestCompactAt?: number;
}

// The /compact suggestion point for models without their own
// suggestCompactAt (flat-priced — no price cliff to stay under, so this is
// purely the "worth condensing by now" size; it matches the frontend's
// historical threshold). Tiered models set explicit values in TEXT_MODELS,
// just below their pricing-tier boundary.
const DEFAULT_SUGGEST_COMPACT_AT = 300_000;

/**
 * The chat-endpoint text-model allow-list, with each model's context
 * thresholds. Single source of truth: ALLOWED_MODELS_BY_TYPE.text derives
 * from these keys, so adding a model here is what allow-lists it — and
 * forces choosing its thresholds at the same time.
 *
 * Sources for the numbers: context windows and pricing tiers from the
 * platform model catalog (youai-api src/common/AIModels/catalog) and its
 * adapters — OpenAI doubles rates above 272K input, Anthropic and Grok
 * above 200K, Google (gemini-3.1-pro) above 200K.
 */
export const TEXT_MODELS: Record<string, ModelContextLimits> = {
  // Anthropic 1M-context, flat-priced.
  'claude-5-opus': { forceCompactAt: 850_000 },
  'claude-4-8-opus': { forceCompactAt: 850_000 },
  'claude-4-7-opus': { forceCompactAt: 850_000 },
  // Anthropic 1M-context with 2x long-context pricing above 200K input.
  'claude-4-6-opus': { forceCompactAt: 850_000, suggestCompactAt: 180_000 },
  'claude-4-6-sonnet': { forceCompactAt: 850_000, suggestCompactAt: 180_000 },
  'claude-fable-5': { forceCompactAt: 850_000 },
  'claude-fable-5-1': { forceCompactAt: 850_000 },
  'claude-5-sonnet': { forceCompactAt: 850_000 },
  // OpenAI gpt-5.5/5.6: ~1M window, but the usable input ceiling under
  // `truncation: 'auto'` is ~794K (output + reasoning reserve), and all
  // rates double above 272K input.
  'gpt-5.5': { forceCompactAt: 600_000, suggestCompactAt: 250_000 },
  'gpt-5.6-sol': { forceCompactAt: 600_000, suggestCompactAt: 250_000 },
  'gpt-5.6-terra': { forceCompactAt: 600_000, suggestCompactAt: 250_000 },
  'gpt-5.6-luna': { forceCompactAt: 600_000, suggestCompactAt: 250_000 },
  // Google ~1M-context; only 3.1-pro is tiered (higher rates above 200K).
  'gemini-3-pro': { forceCompactAt: 850_000 },
  'gemini-3.1-pro': { forceCompactAt: 850_000, suggestCompactAt: 180_000 },
  'gemini-3-flash': { forceCompactAt: 850_000 },
  'gemini-3.5-flash': { forceCompactAt: 850_000 },
  'gemini-3.7-flash': { forceCompactAt: 850_000 },
  // 256K window; its 200K pricing tier sits above the gate, so no nudge.
  'grok-build-0.1': { forceCompactAt: 180_000 },
  'grok-4.5': { forceCompactAt: 400_000 }, // 500K window
  'grok-4.6': { forceCompactAt: 400_000 }, // 500K window
  'glm-5.2': { forceCompactAt: 850_000 },
  'muse-spark-1.1': { forceCompactAt: 850_000 },
  'kimi-k2-7-code': { forceCompactAt: 200_000 }, // 262K window
  'kimi-k3': { forceCompactAt: 850_000 },
  'deepseek-v4-flash-0731': { forceCompactAt: 850_000 },
  'qwen3.8-2.4t-a95b-deepinfra': { forceCompactAt: 200_000 }, // 262K window
  'qwen3.8-27b-deepinfra': { forceCompactAt: 200_000 }, // 262K window
  'minimax-m3': { forceCompactAt: 420_000 }, // 524K window
};

/**
 * Thresholds for models outside TEXT_MODELS — reachable only via a dev
 * `--model` override, since picks are validated against the allow-list.
 * Matches the historical fixed gate.
 */
const DEFAULT_CONTEXT_LIMITS: ModelContextLimits = { forceCompactAt: 850_000 };

/** Context thresholds for a model id, with the conservative-for-1M-class
 * default for unknown ids. */
export function getContextLimits(modelId: string): ModelContextLimits {
  return TEXT_MODELS[modelId] ?? DEFAULT_CONTEXT_LIMITS;
}

/** Where the frontend starts suggesting `/compact` for this model: the
 * model's pricing-tier point when it has one, the flat-rate default
 * otherwise. Shipped on the stats payload (.remy-stats.json) so the
 * composer's ContextBar threshold tracks the active parent model. */
export function getSuggestCompactAt(modelId: string): number {
  return (
    getContextLimits(modelId).suggestCompactAt ?? DEFAULT_SUGGEST_COMPACT_AT
  );
}

/**
 * Allow-list of pickable model IDs by model type.
 *
 * `text` surfaces are constrained to the chat-endpoint allow-list (the
 * TEXT_MODELS keys). `vision` and `image_generation` surfaces are
 * unconstrained — the frontend renders them from its own model catalog. An
 * undefined value means "no allow-list — pick anything of this type from
 * the catalog."
 */
export const ALLOWED_MODELS_BY_TYPE: Partial<Record<ModelType, string[]>> = {
  text: Object.keys(TEXT_MODELS),
  // vision: undefined — unconstrained
  // image_generation: undefined — unconstrained
};

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
    if (!(key in MODEL_SURFACES)) {
      continue; // unknown surface
    }
    const surface = MODEL_SURFACES[key as SurfaceId];
    if (!surface.userPickable) {
      continue; // internal surface (e.g. imagePromptEnhancer)
    }
    if (typeof value !== 'string' || value.length === 0) {
      continue; // require a non-empty string
    }
    const allow = ALLOWED_MODELS_BY_TYPE[surface.modelType];
    if (allow && !allow.includes(value)) {
      continue; // out of allow-list (text only; vision/image_generation skip)
    }
    out[key] = value;
  }
  return out;
}

/**
 * MODEL_SURFACES with each `default` overlaid from the org defaults (registry
 * default where the org hasn't set that surface). This is what ships to the
 * frontend picker, so it displays — and "reset to default" lands on — the org
 * default. Identical to MODEL_SURFACES when no org defaults are set.
 */
export function getEffectiveModelSurfaces(): Record<string, ModelSurface> {
  const out: Record<string, ModelSurface> = {};
  for (const [id, surface] of Object.entries(MODEL_SURFACES)) {
    const orgDefault = orgDefaultModels[id];
    out[id] = orgDefault ? { ...surface, default: orgDefault } : { ...surface };
  }
  return out;
}

/**
 * Four-tier resolution: explicit user pick > global startup override >
 * org default > registry default. Always returns a non-empty string.
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
    MODEL_SURFACES[surfaceId].default
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
