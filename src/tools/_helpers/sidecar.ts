/**
 * Sidecar HTTP client — shared helper for all sidecar requests.
 *
 * The sidecar runs locally and exposes endpoints for LSP, browser status,
 * and other dev environment services. This module manages the base URL
 * and provides a typed request helper.
 */

import { createLogger } from '../../logger.js';

const log = createLogger('sidecar');

let baseUrl: string | null = null;

export function setSidecarBaseUrl(url: string): void {
  baseUrl = url;
  log.info('Configured', { url });
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
    const data = await res.json();
    // Tunnel structured errors arrive as HTTP 200 with success: false
    if (data?.success === false) {
      const code = data.errorCode ? ` [${data.errorCode}]` : '';
      throw new Error(`${data.error || 'Unknown error'}${code}`);
    }
    return data;
  } catch (err: any) {
    if (err.message.startsWith('Sidecar error')) {
      throw err;
    }
    log.error('Sidecar connection error', { endpoint, error: err.message });
    throw new Error(`Sidecar connection error: ${err.message}`);
  }
}
