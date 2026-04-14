/**
 * Shared compaction trigger — used by both the headless protocol
 * and the compactConversation tool.
 */

import { compactConversation } from './index.js';
import { buildSystemPrompt } from '../prompt/index.js';
import { getToolDefinitions } from '../tools/index.js';
import { saveSession } from '../session.js';
import { createLogger } from '../logger.js';
import type { AgentState } from '../types.js';

const log = createLogger('compaction:trigger');

export interface CompactionCallbacks {
  onStart?: () => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

/**
 * Trigger compaction in the background. Returns immediately.
 * Callbacks fire when compaction starts, completes, fails, or finishes (always).
 */
export function triggerCompaction(
  state: AgentState,
  apiConfig: { baseUrl: string; apiKey: string },
  callbacks?: CompactionCallbacks,
): void {
  callbacks?.onStart?.();

  const system = buildSystemPrompt('onboardingFinished');
  const tools = getToolDefinitions('onboardingFinished');

  compactConversation(state, apiConfig, system, tools)
    .then(() => {
      saveSession(state);
      callbacks?.onComplete?.();
      log.info('Compaction complete');
    })
    .catch((err: any) => {
      callbacks?.onError?.(err.message || 'Compaction failed');
      log.error('Compaction failed', { error: err.message });
    })
    .finally(() => {
      callbacks?.onFinally?.();
    });
}
