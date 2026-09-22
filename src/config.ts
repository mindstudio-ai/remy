/**
 * Config resolution — API key, base URL, and app id.
 *
 * Resolution order (first wins):
 *   1. CLI flags (--api-key, --base-url)
 *   2. Environment variables (MINDSTUDIO_API_KEY, MINDSTUDIO_BASE_URL,
 *      MINDSTUDIO_APP_ID)
 *   3. Default base URL (https://api.mindstudio.ai)
 *
 * There used to be a third source: `~/.mindstudio-local-tunnel/config.json`,
 * written by the dev tunnel's login flow when the tunnel was a standalone CLI a
 * developer ran on their own machine. Nothing writes that file any more — the
 * tunnel ships inside the sandbox's C&C server, which hands both of us our
 * credentials on the environment — so reading it could only ever have returned
 * something stale.
 *
 * `appId` is env-only — there's no CLI flag. When unset, requests omit the
 * field and the platform attributes cost to a shared per-org service-account
 * app.
 */

import { createLogger } from './logger.js';

const log = createLogger('config');

const DEFAULT_BASE_URL = 'https://api.mindstudio.ai';

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  /** Owning app for billing attribution. When set, the platform routes
   * cost to this specific app instead of the shared per-org service-account
   * app. Optional; absent on the wire when unset. */
  appId?: string;
}

export function resolveConfig(flags?: {
  apiKey?: string;
  baseUrl?: string;
}): ApiConfig {
  const apiKey = flags?.apiKey || process.env.MINDSTUDIO_API_KEY || '';

  const baseUrl =
    flags?.baseUrl || process.env.MINDSTUDIO_BASE_URL || DEFAULT_BASE_URL;

  const appId = process.env.MINDSTUDIO_APP_ID || undefined;

  if (!apiKey) {
    log.error('No API key found');
    throw new Error(
      'No API key found. Pass --api-key or set MINDSTUDIO_API_KEY. ' +
        'Inside a dev box the C&C server sets it when it spawns this process.',
    );
  }

  const keySource = flags?.apiKey ? 'cli flag' : 'env var';
  log.info('Config resolved', { baseUrl, keySource, appId });

  return { apiKey, baseUrl, appId };
}
