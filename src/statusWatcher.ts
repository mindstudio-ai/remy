/**
 * Background status label generator.
 *
 * Runs alongside the agent loop and periodically calls a lightweight
 * endpoint to generate descriptive status labels ("Aligning on design",
 * "Planning the data model") based on recent conversation context.
 *
 * Completely passive — the main agent loop doesn't know it exists.
 * Fails silently on errors. Always emits on each tick, even when the
 * context hasn't changed, so the user sees continuous activity. The
 * model's temperature produces natural variation across polls.
 */

import type { ApiConfig } from './config.js';

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

  async function tick(): Promise<void> {
    // Skip if a previous call is still running — don't pile up requests.
    if (stopped || signal?.aborted || inflight || pauseCount > 0) {
      return;
    }
    inflight = true;

    try {
      const context = getContext();
      if (!context) {
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

      if (!res.ok || stopped) {
        return;
      }

      const data = (await res.json()) as { label?: string };
      if (!data.label) {
        return;
      }

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
