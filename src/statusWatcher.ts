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

export interface StatusWatcherConfig {
  apiConfig: { baseUrl: string; apiKey: string };
  getContext: () => string;
  onStatus: (label: string) => void;
  interval?: number;
  signal?: AbortSignal;
}

export interface StatusWatcher {
  stop: () => void;
}

export function startStatusWatcher(config: StatusWatcherConfig): StatusWatcher {
  const { apiConfig, getContext, onStatus, interval = 5000, signal } = config;

  let inflight = false;
  let stopped = false;
  const url = `${apiConfig.baseUrl}/_internal/v2/agent/remy/generate-status`;

  async function tick(): Promise<void> {
    // Skip if a previous call is still running — don't pile up requests.
    if (stopped || signal?.aborted || inflight) {
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
        body: JSON.stringify({ context }),
        signal,
      });

      if (!res.ok || stopped) {
        return;
      }

      const data = (await res.json()) as { label?: string };
      if (!data.label) {
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
  };
}
