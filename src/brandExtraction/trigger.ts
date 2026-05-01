/**
 * Fire-and-forget trigger for brand extraction.
 *
 * Coalesces bursts via inflight + dirty bit: if a trigger fires while
 * an extraction is running, the dirty flag ensures one more pass after
 * the current run completes — so the latest spec state is always
 * eventually reflected in `.remy-brand.json`.
 *
 * Mirrors src/compaction/trigger.ts.
 */

import { runExtraction } from './index.js';
import { createLogger } from '../logger.js';

const log = createLogger('brandExtraction:trigger');

let inflight = false;
let dirty = false;

export function triggerBrandExtraction(apiConfig: {
  baseUrl: string;
  apiKey: string;
}): void {
  if (inflight) {
    dirty = true;
    return;
  }
  inflight = true;
  void runExtraction(apiConfig)
    .catch((err: any) => {
      log.error('Brand extraction failed', { error: err?.message });
    })
    .finally(() => {
      inflight = false;
      if (dirty) {
        dirty = false;
        triggerBrandExtraction(apiConfig);
      }
    });
}
