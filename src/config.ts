/**
 * Config resolution — API key and base URL.
 *
 * Shares ~/.mindstudio/config.json with @mindstudio-ai/agent, so
 * `mindstudio login` sets up credentials for both tools.
 *
 * Resolution order (first wins):
 *   1. CLI flags (--api-key, --base-url)
 *   2. Environment variables (MINDSTUDIO_API_KEY, MINDSTUDIO_BASE_URL)
 *   3. Config file (~/.mindstudio/config.json)
 *   4. Default base URL (https://v1.mindstudio-api.com)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { log } from './logger.js';

interface TunnelConfig {
  environment?: string;
  environments?: Record<
    string,
    { apiBaseUrl?: string; apiKey?: string; userId?: string }
  >;
}

const CONFIG_PATH = path.join(
  os.homedir(),
  '.mindstudio-local-tunnel',
  'config.json',
);
const DEFAULT_BASE_URL = 'https://seankoji.ngrok.io';

function loadConfigFile(): TunnelConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    log.debug('Loaded config file', { path: CONFIG_PATH });
    return JSON.parse(raw);
  } catch (err: any) {
    log.debug('No config file found', {
      path: CONFIG_PATH,
      error: err.message,
    });
    return {};
  }
}

export function resolveConfig(flags?: { apiKey?: string; baseUrl?: string }): {
  apiKey: string;
  baseUrl: string;
} {
  const file = loadConfigFile();
  const activeEnv = file.environment || 'prod';
  const env = file.environments?.[activeEnv];

  const apiKey =
    flags?.apiKey || process.env.MINDSTUDIO_API_KEY || env?.apiKey || '';

  const baseUrl =
    flags?.baseUrl ||
    process.env.MINDSTUDIO_BASE_URL ||
    env?.apiBaseUrl ||
    DEFAULT_BASE_URL;

  if (!apiKey) {
    log.error('No API key found');
    throw new Error(
      'No API key found. Set MINDSTUDIO_API_KEY or configure ~/.mindstudio-local-tunnel/config.json.',
    );
  }

  const keySource = flags?.apiKey
    ? 'cli flag'
    : process.env.MINDSTUDIO_API_KEY
      ? 'env var'
      : 'config file';
  log.info('Config resolved', {
    baseUrl,
    keySource,
    environment: activeEnv,
  });

  return { apiKey, baseUrl };
}
