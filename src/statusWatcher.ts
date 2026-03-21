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

import { log } from './logger.js';

export interface StatusWatcherConfig {
  apiConfig: { baseUrl: string; apiKey: string };
  getContext: () => {
    assistantText: string;
    lastToolName?: string;
    lastToolResult?: string;
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
  const url = `${apiConfig.baseUrl}/_internal/v2/agent/remy/generate-status`;

  async function tick(): Promise<void> {
    if (signal?.aborted || inflight) {
      return;
    }
    inflight = true;

    try {
      const ctx = getContext();

      // Skip if there's no context to work with
      if (!ctx.assistantText && !ctx.lastToolName) {
        log.debug('Status watcher: no context, skipping');
        return;
      }

      log.debug('Status watcher: requesting label', {
        textLength: ctx.assistantText.length,
        lastToolName: ctx.lastToolName,
      });

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
        }),
        signal,
      });

      if (!res.ok) {
        log.debug('Status watcher: endpoint returned non-ok', {
          status: res.status,
        });
        return;
      }

      const data = (await res.json()) as { label?: string };
      if (!data.label) {
        log.debug('Status watcher: no label in response');
        return;
      }

      // Deduplicate
      if (data.label === lastLabel) {
        log.debug('Status watcher: duplicate label, skipping', {
          label: data.label,
        });
        return;
      }
      lastLabel = data.label;

      log.debug('Status watcher: emitting', { label: data.label });
      onStatus(data.label);
    } catch (err: any) {
      log.debug('Status watcher: error', { error: err?.message ?? 'unknown' });
    } finally {
      inflight = false;
    }
  }

  const timer = setInterval(tick, interval);

  // Fire once immediately
  tick().catch(() => {});

  log.debug('Status watcher started', { interval });

  return {
    stop() {
      clearInterval(timer);
      log.debug('Status watcher stopped');
    },
  };
}
