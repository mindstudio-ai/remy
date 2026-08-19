/**
 * Background status label generator.
 *
 * Runs alongside the agent loop and periodically calls a lightweight
 * endpoint to generate descriptive status labels ("Aligning on design",
 * "Planning the data model") based on recent conversation context.
 *
 * Completely passive — the main agent loop doesn't know it exists.
 * Fails silently on errors, backing off and eventually giving up when the
 * endpoint keeps producing nothing. Otherwise emits on each tick, even when
 * the context hasn't changed, so the user sees continuous activity. The
 * model's temperature produces natural variation across polls.
 */

import type { ApiConfig } from './config.js';

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

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({ appId: apiConfig.appId, context }),
        signal,
      });

      if (stopped) {
        return;
      }
      if (!res.ok) {
        recordFailure();
        return;
      }

      const data = (await res.json()) as { label?: string };
      if (!data.label) {
        recordFailure();
        return;
      }

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
