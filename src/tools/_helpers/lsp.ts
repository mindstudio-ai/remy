/**
 * LSP helpers — thin wrapper over the sidecar client for LSP-specific tools.
 *
 * The actual tools live in lspDiagnostics.ts and restartProcess.ts.
 */

import {
  setSidecarBaseUrl,
  isSidecarConfigured,
  sidecarRequest,
} from './sidecar.js';

export const setLspBaseUrl = setSidecarBaseUrl;
export const isLspConfigured = isSidecarConfigured;

export async function lspRequest(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  return sidecarRequest(endpoint, body);
}
