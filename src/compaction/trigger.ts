/**
 * Shared compaction trigger — used by both the headless protocol
 * and the compactConversation tool.
 *
 * Summaries are queued in a module-level array. The caller drains
 * the queue via getPendingSummaries() when it's safe to splice
 * into state.messages (i.e., when the agent is idle).
 */

import { compactConversation } from './index.js';
import { buildSystemPrompt } from '../prompt/index.js';
import { getToolDefinitions } from '../tools/index.js';
import { createLogger } from '../logger.js';
import type { AgentState } from '../types.js';
import type { Message } from '../api.js';

const log = createLogger('compaction:trigger');

/** Summaries waiting to be inserted into state.messages. */
const pendingSummaries: Message[] = [];

/** Drain and return all pending summaries. */
export function getPendingSummaries(): Message[] {
  return pendingSummaries.splice(0);
}

export interface CompactionCallbacks {
  onStart?: () => void;
  onSummariesReady?: () => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

/**
 * Trigger compaction in the background. Returns immediately.
 * Summaries are queued in the module-level pendingSummaries array.
 * The caller should drain them via getPendingSummaries() when idle.
 */
export function triggerCompaction(
  state: AgentState,
  apiConfig: { baseUrl: string; apiKey: string },
  callbacks?: CompactionCallbacks,
): void {
  callbacks?.onStart?.();

  const system = buildSystemPrompt('onboardingFinished');
  const tools = getToolDefinitions('onboardingFinished');

  compactConversation(state.messages, apiConfig, system, tools)
    .then((summaries) => {
      pendingSummaries.push(...summaries);
      callbacks?.onSummariesReady?.();
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
