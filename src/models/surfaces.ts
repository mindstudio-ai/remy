/**
 * Authoritative registry of every pickable model surface in Remy.
 *
 * Single source of truth for defaults, picker metadata, user-facing
 * labels/descriptions, and allow-lists. Every call site that needs a
 * model goes through `resolveModel(surfaceId, models, fallback)` —
 * three-tier resolution: explicit user pick > startup-time global
 * override > registry default.
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
  copyEditor: {
    default: 'claude-5-sonnet',
    label: 'Copy Agent',
    description:
      'Tightens prose and copy across your app and its launch materials so it reads sharp and human, never machine-made.',
    modelType: 'text',
    userPickable: true,
  },
  imageGeneration: {
    default: 'seedream-4.5',
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
 * Allow-list of pickable model IDs by model type.
 *
 * `text` surfaces are constrained to the chat-endpoint allow-list (7 IDs
 * spanning Anthropic, OpenAI, and Google). `vision` and `image_generation`
 * surfaces are unconstrained — the frontend renders them from its own
 * model catalog. An undefined value means "no allow-list — pick anything
 * of this type from the catalog."
 */
export const ALLOWED_MODELS_BY_TYPE: Partial<Record<ModelType, string[]>> = {
  text: [
    'claude-4-8-opus',
    'claude-4-7-opus',
    'claude-4-6-opus',
    'claude-4-6-sonnet',
    'claude-fable-5',
    'claude-5-sonnet',
    'gpt-5.5',
    'gemini-3-pro',
    'gemini-3.1-pro',
    'gemini-3-flash',
    'gemini-3.5-flash',
    'grok-build-0.1',
    'grok-4.5',
    'glm-5.2',
    'muse-spark-1.1',
    'kimi-k2-7-code',
  ],
  // vision: undefined — unconstrained
  // image_generation: undefined — unconstrained
};

/**
 * Three-tier resolution: explicit user pick > global startup override >
 * registry default. Always returns a non-empty string.
 */
export function resolveModel(
  surfaceId: SurfaceId,
  models?: Record<string, string>,
  fallback?: string,
): string {
  return models?.[surfaceId] ?? fallback ?? MODEL_SURFACES[surfaceId].default;
}
