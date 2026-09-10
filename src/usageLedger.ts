/**
 * Append-only NDJSON usage ledger.
 *
 * One line per LLM call (parent or sub-agent). Cumulative/per-agent/time-series
 * questions are then a single-pass query over `.logs/usage.ndjson` rather than
 * walking the live session file plus every cleared archive.
 *
 * The platform's `done` event now carries authoritative `modelId`, `cost`, and
 * a per-event billing breakdown — we record them as-is. Cost is the org-marked-up
 * customer-facing dollar amount; billedAmount inside billingEvents is in
 * nano-dollars (1e-9 USD).
 */

import fs from 'node:fs';
import type { BillingEvent } from './api.js';

const LEDGER_FILE = '.logs/usage.ndjson';

export interface UsageEntry {
  ts: number;
  requestId?: string;
  agentName: string;
  parentToolId?: string;
  /** Authoritative model id resolved by the adapter (e.g. "claude-4-7-opus"). */
  modelId?: string;
  /** mindstudio CLI action name (e.g. "analyze-image", "generate-image",
   * "batch"). Present on CLI rows, absent on agent-loop rows — analytics can
   * use presence to discriminate without an explicit type field. */
  cliAction?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  /** Reasoning tokens generated this call (Google bills thinking as output,
   * disjoint from visible output). Derived from billingEvents — see
   * `thinkingTokensFromBilling`. Present only when the breakdown reveals a
   * nonzero thinking component; absent for models that don't report it. */
  thinkingTokens?: number;
  /** Org-marked-up customer cost in dollars for this call. */
  cost?: number;
  /** Per-event billing breakdown; sums to cost. */
  billingEvents?: BillingEvent[];
  durationMs: number;
  toolNames: string[];
}

/**
 * Reasoning ("thinking") tokens for a call, derived from its billing
 * breakdown. Providers that price thinking as output report a `-response`
 * billing event whose unit count is (visible output + thinking); subtracting
 * the visible `outputTokens` recovers the thinking portion. Anthropic-style
 * providers fold thinking into `outputTokens` and emit no separate signal, so
 * this returns 0 there. Never negative.
 */
export function thinkingTokensFromBilling(
  billingEvents: BillingEvent[] | undefined,
  outputTokens: number,
): number {
  if (!billingEvents?.length) {
    return 0;
  }
  const billedResponseUnits = billingEvents
    .filter((e) => e.eventType.endsWith('-response'))
    .reduce((sum, e) => sum + e.numUnits, 0);
  return Math.max(0, billedResponseUnits - outputTokens);
}

let fd: number | null = null;

/** Convert nano-dollar cost (1e-9 USD, the wire unit on every platform
 * billing field) to dollars (the unit `UsageEntry.cost` is stored in).
 * Returns undefined when the input is missing so callers can spread the
 * result without producing NaN. `billingEvents[].billedAmount` stays in
 * nano-dollars on disk — the platform doc defines that field that way. */
export function nanoToDollars(nano: number | undefined): number | undefined {
  return typeof nano === 'number' ? nano / 1_000_000_000 : undefined;
}

export function recordUsage(entry: UsageEntry): void {
  try {
    if (fd === null) {
      fs.mkdirSync('.logs', { recursive: true });
      fd = fs.openSync(LEDGER_FILE, 'a');
    }
    fs.writeSync(fd, JSON.stringify(entry) + '\n');
  } catch {
    // Best-effort — never crash a turn over a logging failure
  }
}
