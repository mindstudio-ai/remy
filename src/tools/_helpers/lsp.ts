/**
 * LSP sidecar configuration — shared state for LSP tools.
 *
 * The actual tools live in lspDiagnostics.ts and restartProcess.ts.
 * This module manages the base URL and provides the HTTP request helper.
 */

import { log } from '../../logger.js';

let lspBaseUrl: string | null = null;

export function setLspBaseUrl(url: string): void {
  lspBaseUrl = url;
  log.info('LSP configured', { url });
}

export function isLspConfigured(): boolean {
  return lspBaseUrl !== null;
}

export async function lspRequest(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  if (!lspBaseUrl) {
    throw new Error('LSP not available');
  }
  const url = `${lspBaseUrl}${endpoint}`;
  log.debug('LSP request', { endpoint, body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      log.error('LSP sidecar error', { endpoint, status: res.status });
      throw new Error(`LSP sidecar error: ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.startsWith('LSP sidecar')) {
      throw err;
    }
    log.error('LSP connection error', { endpoint, error: err.message });
    throw new Error(`LSP connection error: ${err.message}`);
  }
}
