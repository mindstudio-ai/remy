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
 * The finished checkpoint waits in a module-level slot. Callers drain via
 * applyPendingSummaries() when it's safe to splice into state.messages
 * (i.e., when the agent is idle).
 */

import { compactConversation, type CompactionResult } from './index.js';
import { createLogger } from '../logger.js';
import { resolveModel } from '../models/surfaces.js';
import { saveSession } from '../session.js';
import type { AgentState } from '../types.js';
import type { ApiConfig } from '../config.js';

const log = createLogger('compaction:trigger');

/**
 * The finished checkpoint waiting to be inserted into state.messages. A single
 * slot rather than a queue: triggerCompaction refuses to start another
 * compaction while one is pending, so there is never more than one.
 */
let pending: CompactionResult | null = null;

/** The currently in-flight compaction, if any — concurrent callers join this. */
let inflightCompaction: Promise<void> | null = null;

/**
 * Drain the pending checkpoint into the session at a safe point. Call when the
 * agent is idle — splicing mid-turn can land a checkpoint between a tool_use
 * and its results.
 *
 * Every mode that can start a compaction has to call this. A checkpoint left in
 * the slot is billed and thrown away, and the conversation stays uncompacted.
 *
 * The checkpoint goes directly after the last message its summary covered, not
 * at the end of the conversation. Those differ whenever anything was appended
 * while the summary generated, and the difference is not cosmetic: everything
 * in between would be summarized by nothing and, sitting before the checkpoint,
 * dropped from every later API call by cleanMessagesForApi.
 */
export function applyPendingSummaries(state: AgentState): void {
  const drained = pending;
  pending = null;
  if (!drained || drained.checkpoints.length === 0) {
    return;
  }

  // The boundary is already a safe insertion point by construction, so it is
  // deliberately not re-snapped here — findSafeInsertionPoint only walks
  // backward, which would move the checkpoint earlier and reopen the gap.
  let idx: number;
  if (!drained.boundary) {
    idx = 0;
  } else {
    const at = state.messages.indexOf(drained.boundary);
    // Not found means rotation archived the summarized range while this waited.
    // Everything still in state.messages is then past the boundary, so the
    // checkpoint belongs in front of all of it.
    idx = at === -1 ? 0 : at + 1;
  }

  state.messages.splice(idx, 0, ...drained.checkpoints);
  log.info('Checkpoint applied', {
    index: idx,
    messageCount: state.messages.length,
  });
  saveSession(state);
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
  /** Optional global fallback model from startup-time options
   * (`HeadlessOptions.model` / `--model` CLI flag). The trigger composes
   * three-tier resolution: session pick > this fallback > registry default. */
  model?: string;
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
 *
 * A request that arrives after a compaction finishes but before it drains is
 * also a no-op. The checkpoint isn't in state.messages yet, so a second run
 * would find no checkpoint to start from and re-summarize the conversation from
 * the beginning, billing a full summary to produce a checkpoint the first one
 * already covers.
 */
export function triggerCompaction(
  state: AgentState,
  apiConfig: ApiConfig,
  opts: TriggerOptions = {},
): Promise<void> {
  if (inflightCompaction) {
    return inflightCompaction;
  }
  if (pending) {
    log.info('Compaction skipped — a checkpoint is already waiting to apply');
    return Promise.resolve();
  }

  const { blocking = false, requestId, model } = opts;
  listener?.({ type: 'started', blocking, requestId });

  inflightCompaction = compactConversation(
    state.messages,
    apiConfig,
    resolveModel('conversationSummarizer', state.models, model),
  )
    .then((result) => {
      pending = result;
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
