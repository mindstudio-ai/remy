/**
 * Boot-time load of the platform's model-surface registry.
 *
 * Called from BOTH entry points — the TUI (index.tsx) and the headless session
 * that runs inside a dev box (headless/index.ts) — before anything resolves a
 * model or validates an org default.
 *
 * Deliberately fatal on failure, unlike `initOrgContext` beside it. Org context
 * is an enrichment: absent, Remy builds exactly as before. The surface registry
 * is not: without it there are no surfaces, so no agent has a model and there
 * is nothing to degrade to. And no local copy is kept on purpose — a fallback
 * snapshot of this is precisely the duplication that drifted against the
 * platform and silently dropped org model defaults.
 *
 * The platform has to be reachable for Remy to do anything anyway: it cannot
 * call a model without it.
 */

import { fetchModelSurfaces } from '../api.js';
import type { ApiConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { setModelRegistry } from './surfaces.js';

const log = createLogger('models');

export async function initModelRegistry(config: ApiConfig): Promise<void> {
  const payload = await fetchModelSurfaces(config);
  setModelRegistry(payload);
  log.debug('model registry loaded', {
    surfaces: payload.surfaces.length,
    allowedTextModels: payload.allowedModelsByType?.text?.length ?? 0,
    textModels: Object.keys(payload.textModels ?? {}).length,
  });
}
