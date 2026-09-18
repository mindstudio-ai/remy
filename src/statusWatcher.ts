/**
 * Background status label generator.
 *
 * Runs alongside the agent loop and periodically calls a lightweight
 * endpoint to generate descriptive status labels ("Aligning on design",
 * "Planning the data model") based on recent conversation context.
 *
 * Completely passive — the main agent loop doesn't know it exists.
 * Fails silently on errors, backing off and eventually giving up when the
 * endpoint keeps producing nothing.
 *
 * One call per CHANGE of context, not per tick. It used to re-generate on
 * every tick even when the context was byte-identical, so the label kept
 * moving while nothing happened — and a model call went out every 5 seconds
 * for as long as a turn ran. During a long tool call (a build, a browser wait)
 * that is a dozen paid calls describing the same state. RPT-1252: ~7,000 of
 * them on one app in four days, $3.91, and invisible — this watcher was the
 * only biller in the sandbox that never wrote to the usage ledger. Both halves
 * are fixed here: skip the call when the context is unchanged, and record the
 * ones we do make. A steady label during a steady state is the honest display.
 */

import { createHash } from 'node:crypto';

import { sandboxSessionHeader, type BillingEvent } from './api.js';
import type { ApiConfig } from './config.js';
import { nanoToDollars, recordUsage } from './usageLedger.js';

/**
 * Strip internal harness payloads from text destined for the status-label
 * context. Cancelled/interrupted tool results and raw background-result
 * envelopes are machine-facing — the label model would faithfully summarize
 * them into internal-flavored statuses ("Processing background results").
 */
const INTERNAL_PAYLOAD_MARKERS = [
  '[USER CANCELLED]',
  '[INTERRUPTED]',
  '[INTERRUPTED - PARTIAL OUTPUT RETRIEVED]',
  '<background_results>',
  '<workspace_status>',
  '<tool_result',
];

export function sanitizeStatusText(text: string): string {
  if (!text) {
    return '';
  }
  for (const marker of INTERNAL_PAYLOAD_MARKERS) {
    if (text.includes(marker)) {
      return '';
    }
  }
  // The truncation notice is a suffix on otherwise-real content — cut it off.
  const truncIdx = text.indexOf('(tool result truncated at');
  return truncIdx === -1 ? text : text.slice(0, truncIdx);
}

export interface StatusWatcherConfig {
  apiConfig: ApiConfig;
  getContext: () => string;
  onStatus: (label: string) => void;
  interval?: number;
  signal?: AbortSignal;
}

export interface StatusWatcher {
  stop: () => void;
  /**
   * Suppress new status labels. Refcounted so concurrent external-tool
   * waits compose correctly. The watcher keeps ticking but neither calls
   * the endpoint nor emits while paused.
   */
  pause: () => void;
  /** Decrement the pause refcount. Resumes when the count returns to 0. */
  resume: () => void;
}

export function startStatusWatcher(config: StatusWatcherConfig): StatusWatcher {
  const { apiConfig, getContext, onStatus, interval = 5000, signal } = config;

  let inflight = false;
  let stopped = false;
  let pauseCount = 0;
  /**
   * Context behind the last label we successfully generated. A tick whose
   * context still hashes to this makes no call — the label already on screen
   * describes it. Only the LAST one is remembered, so A -> B -> A does relabel
   * on the second A: by then the screen shows B's label, and A is news again.
   */
  let labeledContextHash: string | null = null;
  const url = `${apiConfig.baseUrl}/_internal/v2/agent/remy/generate-status`;

  // Circuit breaker. The endpoint signals credit exhaustion as 200 + an
  // empty label, so consecutive no-label responses count as failures right
  // alongside HTTP errors and throws. Failures back the effective interval
  // off exponentially, and a sustained streak stops the watcher for good —
  // without this, an out-of-credits org gets hammered every tick forever.
  let consecutiveFailures = 0;
  let backoffMs = 0;
  let nextAllowedAt = 0;
  const MAX_CONSECUTIVE_FAILURES = 10;
  const MAX_BACKOFF_MS = 60_000;

  function recordFailure(): void {
    consecutiveFailures++;
    backoffMs = Math.min(
      backoffMs === 0 ? interval : backoffMs * 2,
      MAX_BACKOFF_MS,
    );
    nextAllowedAt = Date.now() + backoffMs;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !stopped) {
      stopped = true;
      clearInterval(timer);
    }
  }

  async function tick(): Promise<void> {
    // Skip if a previous call is still running — don't pile up requests.
    if (stopped || signal?.aborted || inflight || pauseCount > 0) {
      return;
    }
    if (Date.now() < nextAllowedAt) {
      return;
    }
    inflight = true;

    try {
      const context = getContext();
      if (!context) {
        // Nothing to report isn't a failure — just wait for context.
        return;
      }

      // Unchanged context still pings, it just doesn't ask for a label: the
      // request is the cheap half, the model call is the expensive half. The
      // ping is kept because this tick is also the box's keepalive of last
      // resort (see the session header below) and a sandbox lease is 30
      // minutes — dropping it is harmless right up until a single tool call
      // outlives the lease with the editor tab closed. Omitting `context` is
      // already what the route reads as "nothing to label".
      const contextHash = createHash('sha1').update(context).digest('hex');
      const unchanged = contextHash === labeledContextHash;

      const startedAt = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
          // Also a liveness signal for this box, and the most frequent one there is — this ticks
          // every few seconds for as long as the agent is working, which is exactly the window in
          // which the user may have backgrounded the tab and stopped its own keepalive.
          ...sandboxSessionHeader(),
        },
        body: JSON.stringify({
          appId: apiConfig.appId,
          ...(unchanged ? {} : { context }),
        }),
        signal,
      });

      if (stopped) {
        return;
      }
      if (unchanged) {
        // Keepalive only. No label was asked for, so an empty one is not a
        // failure — the breaker exists for an endpoint that cannot produce
        // labels, not for a turn that is busy doing one thing. Discard the
        // body rather than ignoring it: an unread response holds its socket
        // until GC, and this path can now run for the length of a build.
        await res.body?.cancel().catch(() => {});
        return;
      }
      if (!res.ok) {
        recordFailure();
        return;
      }

      const data = (await res.json()) as {
        label?: string;
        modelId?: string;
        cost?: number;
        billingEvents?: BillingEvent[];
        usage?: { inputTokens?: number; outputTokens?: number };
      };
      if (!data.label) {
        recordFailure();
        return;
      }

      // Every other model call the sandbox causes lands in the ledger; this one
      // did not, which is how ~7,000 of them hid in plain sight (RPT-1252).
      recordUsage({
        ts: Date.now(),
        agentName: 'statusLabel',
        modelId: data.modelId,
        inputTokens: data.usage?.inputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
        cost: nanoToDollars(data.cost),
        billingEvents: data.billingEvents,
        durationMs: Date.now() - startedAt,
        toolNames: [],
      });

      consecutiveFailures = 0;
      backoffMs = 0;
      nextAllowedAt = 0;

      // Re-check pause AND stopped: the caller may have paused or stopped
      // the watcher while we were awaiting the fetch/JSON (e.g. the turn
      // ended and stop() ran during `await res.json()`). Without the stopped
      // re-check this trailing label would emit after turn_done, leaving the
      // frontend's agentStatusMessage populated at idle.
      if (pauseCount > 0 || stopped || signal?.aborted) {
        return;
      }

      onStatus(data.label);
      // Set only once the label is actually on its way out. Bailing at the
      // pause check above leaves the hash unset, so the state gets labelled
      // when the watcher resumes rather than being silently skipped as
      // already-described.
      labeledContextHash = contextHash;
    } catch {
      if (!stopped && !signal?.aborted) {
        recordFailure();
      }
    } finally {
      inflight = false;
    }
  }

  const timer = setInterval(tick, interval);

  // Fire once immediately
  tick().catch(() => {});

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    pause() {
      pauseCount++;
    },
    resume() {
      pauseCount = Math.max(0, pauseCount - 1);
    },
  };
}
