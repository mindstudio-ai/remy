/**
 * Background status label generator.
 *
 * Runs alongside the agent loop and periodically calls a lightweight
 * endpoint to generate descriptive status labels ("Aligning on design",
 * "Planning the data model") based on recent conversation context.
 *
 * Completely passive — the main agent loop doesn't know it exists.
 * Fails silently on errors. Deduplicates consecutive identical labels.
 */

export interface StatusWatcherConfig {
  apiConfig: { baseUrl: string; apiKey: string };
  getContext: () => {
    assistantText: string;
    lastToolName?: string;
    lastToolResult?: string;
    onboardingState?: string;
    userMessage?: string;
  };
  onStatus: (label: string) => void;
  interval?: number;
  signal?: AbortSignal;
}

export interface StatusWatcher {
  stop: () => void;
}

export function startStatusWatcher(config: StatusWatcherConfig): StatusWatcher {
  const { apiConfig, getContext, onStatus, interval = 3000, signal } = config;

  let lastLabel = '';
  let inflight = false;
  let stopped = false;
  const url = `${apiConfig.baseUrl}/_internal/v2/agent/remy/generate-status`;

  async function tick(): Promise<void> {
    if (stopped || signal?.aborted || inflight) {
      return;
    }
    inflight = true;

    try {
      const ctx = getContext();

      // Skip if there's no context to work with
      if (!ctx.assistantText && !ctx.lastToolName && !ctx.userMessage) {
        return;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          assistantText: ctx.assistantText.slice(-500),
          lastToolName: ctx.lastToolName,
          lastToolResult: ctx.lastToolResult?.slice(-200),
          onboardingState: ctx.onboardingState,
          userMessage: ctx.userMessage?.slice(-200),
        }),
        signal,
      });

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as { label?: string };
      if (!data.label || data.label === lastLabel) {
        return;
      }

      lastLabel = data.label;
      if (stopped) {
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
