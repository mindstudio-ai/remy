/**
 * Sidecar HTTP client — shared helper for all sidecar requests.
 *
 * The sidecar runs locally and exposes endpoints for LSP, browser status,
 * and other dev environment services. This module manages the base URL
 * and provides a typed request helper.
 */

import { log } from '../../logger.js';

let baseUrl: string | null = null;

export function setSidecarBaseUrl(url: string): void {
  baseUrl = url;
  log.info('Sidecar configured', { url });
}

export function isSidecarConfigured(): boolean {
  return baseUrl !== null;
}

export function getSidecarBaseUrl(): string | null {
  return baseUrl;
}

/**
 * POST to a sidecar endpoint. Returns the parsed JSON response.
 * Throws on connection errors or non-ok responses.
 */
export async function sidecarRequest(
  endpoint: string,
  body: Record<string, unknown> = {},
  options?: { timeout?: number },
): Promise<any> {
  if (!baseUrl) {
    throw new Error('Sidecar not available');
  }
  const url = `${baseUrl}${endpoint}`;
  log.debug('Sidecar request', { endpoint, body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.timeout
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    });
    if (!res.ok) {
      log.error('Sidecar error', { endpoint, status: res.status });
      throw new Error(`Sidecar error: ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.startsWith('Sidecar error')) {
      throw err;
    }
    log.error('Sidecar connection error', { endpoint, error: err.message });
    throw new Error(`Sidecar connection error: ${err.message}`);
  }
}
