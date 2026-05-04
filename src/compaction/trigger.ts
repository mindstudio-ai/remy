/**
 * Shared compaction trigger — used by the headless protocol's forced gate,
 * the `/compact` action, and the `compactConversation` agent tool.
 *
 * The trigger owns its own lifecycle observability: a single registered
 * listener receives `started` / `complete` events for any compaction it
 * starts. Callers don't emit lifecycle events themselves — they just call
 * `triggerCompaction(...)` with a `blocking` flag and either await the
 * returned promise or fire-and-forget.
 *
 * Summaries are queued in a module-level array. Callers drain via
 * getPendingSummaries() when it's safe to splice into state.messages
 * (i.e., when the agent is idle).
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

/** The currently in-flight compaction, if any — concurrent callers join this. */
let inflightCompaction: Promise<void> | null = null;

/** Drain and return all pending summaries. */
export function getPendingSummaries(): Message[] {
  return pendingSummaries.splice(0);
}

export type CompactionLifecycleEvent =
  | { type: 'started'; blocking: boolean; requestId?: string }
  | { type: 'complete'; error?: string; requestId?: string };

export type CompactionListener = (event: CompactionLifecycleEvent) => void;

let listener: CompactionListener | null = null;

/**
 * Register the single lifecycle listener. The headless layer wires this up
 * once at startup to translate compaction lifecycle into stdout events and
 * stats updates. Pass `null` to unregister.
 */
export function setCompactionListener(l: CompactionListener | null): void {
  listener = l;
}

export interface TriggerOptions {
  /** Whether the caller is blocking the user's next turn on this compaction. */
  blocking?: boolean;
  /** Correlation id for the lifecycle events surfaced to the listener. */
  requestId?: string;
}

/**
 * Trigger compaction. Returns a promise that resolves when summaries are
 * pushed onto pendingSummaries (or rejects on failure). Callers can `await`
 * it (forced/blocking path) or `void` it (fire-and-forget path).
 *
 * Concurrent calls coalesce: while one compaction is in flight, subsequent
 * callers receive the same promise instead of starting a second one. Only
 * the call that actually starts the compaction triggers lifecycle events;
 * late joiners get the awaitable promise but no `started`/`complete`
 * notifications. Frontends should not assume `started`/`complete` pair
 * with every caller's requestId — they pair only with the originator's.
 */
export function triggerCompaction(
  state: AgentState,
  apiConfig: { baseUrl: string; apiKey: string },
  opts: TriggerOptions = {},
): Promise<void> {
  if (inflightCompaction) {
    return inflightCompaction;
  }

  const { blocking = false, requestId } = opts;
  listener?.({ type: 'started', blocking, requestId });

  const system = buildSystemPrompt('onboardingFinished');
  const tools = getToolDefinitions('onboardingFinished');

  inflightCompaction = compactConversation(
    state.messages,
    apiConfig,
    system,
    tools,
  )
    .then((summaries) => {
      pendingSummaries.push(...summaries);
      listener?.({ type: 'complete', requestId });
      log.info('Compaction complete');
    })
    .catch((err: any) => {
      const message = err.message || 'Compaction failed';
      listener?.({ type: 'complete', error: message, requestId });
      log.error('Compaction failed', { error: message });
      throw err;
    })
    .finally(() => {
      inflightCompaction = null;
    });

  return inflightCompaction;
}
