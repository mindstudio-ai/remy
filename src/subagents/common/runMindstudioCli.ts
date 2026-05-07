/**
 * Wrapper around `runCli('mindstudio', ...)` that captures cost data.
 *
 * Two distinct envelope shapes from the CLI (confirmed by probe):
 *
 *   Single-action (analyze-image, generate-text, scrape-url, etc.):
 *     {
 *       <result fields>,
 *       "$appId": "...", "$threadId": "...", "$rateLimitRemaining": ...,
 *       "$billingCost": 162000,            // nano-dollars
 *       "$billingEvents": [{ eventType, numUnits, billedAmount, ... }, ...]
 *     }
 *
 *   Batch:
 *     {
 *       "results": [
 *         { "stepType": "...", "output": {...}, "billingCost": 1254000 }
 *       ],
 *       "totalBillingCost": 1254000,        // nano-dollars
 *       "appId": "...", "threadId": "..."
 *     }
 *
 * Differences worth noting: batch uses *plain* keys (no `$` prefix), exposes
 * per-step `billingCost` but no `billingEvents` breakdown, and wraps results
 * under `results`. `--no-meta` strips top-level metadata for both shapes and
 * additionally unwraps batch into a bare array.
 *
 * Both `$billingCost` (single) and `billingCost`/`totalBillingCost` (batch)
 * are in **nano-dollars** (1e-9 USD); `UsageEntry.cost` is in **dollars** to
 * match the SSE `done` event's `cost` field. The wrapper converts.
 *
 * Behavior:
 *   - Strips `--no-meta` and `--output-key` from the input args; the wrapper
 *     takes over both responsibilities so it can see metadata regardless of
 *     what the call site passed.
 *   - Records ledger rows: one per single-action call, or one per step for
 *     batch.
 *   - Preserves the original return-value contract: bare value (with
 *     `outputKey`), bare-array string (for batch), or stripped envelope
 *     string (for single-action without `outputKey`). Existing consumers
 *     don't change shape.
 *   - On parse failure (e.g. `mindstudio ask` markdown output, error strings)
 *     returns the raw stdout unchanged.
 */

import { runCli, type RunCliOptions } from './runCli.js';
import { recordUsage, nanoToDollars } from '../../usageLedger.js';
import type { BillingEvent } from '../../api.js';

export interface RunMindstudioOptions extends RunCliOptions {
  /** Field to extract from the parsed JSON envelope. Returned as a string
   * (stringified if the value is not already a string). Ignored for batch
   * responses, which always return the bare `results` array. */
  outputKey?: string;
  /** Caller identifier for ledger attribution (e.g. 'designExpert',
   * 'browserAutomation'). Falls back to 'mindstudio-cli' if omitted. */
  caller?: string;
}

/** Remove `--no-meta` (boolean) and `--output-key X` (flag + value) from
 * the args array so the wrapper can take over both responsibilities. */
function stripFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-meta') {
      continue;
    }
    if (arg === '--output-key') {
      i++; // also skip the value
      continue;
    }
    out.push(arg);
  }
  return out;
}

export async function runMindstudioCli(
  args: string[],
  options?: RunMindstudioOptions,
): Promise<string> {
  const cleanArgs = stripFlags(args);
  const cliAction = args[0];
  const agentName = options?.caller ?? 'mindstudio-cli';
  const start = Date.now();

  const raw = await runCli('mindstudio', cleanArgs, options);

  let envelope: any;
  try {
    envelope = JSON.parse(raw);
  } catch {
    // Not JSON (e.g. `mindstudio ask` markdown, or error strings).
    // Return as-is; cost tracking unavailable for this call.
    return raw;
  }

  // ---- Batch shape: { results: [...], totalBillingCost, appId, threadId }
  if (
    envelope &&
    typeof envelope === 'object' &&
    Array.isArray(envelope.results)
  ) {
    const durationMs = Date.now() - start;
    for (const step of envelope.results) {
      if (typeof step?.billingCost === 'number') {
        recordUsage({
          ts: Date.now(),
          agentName,
          cliAction: `${cliAction}:${step.stepType ?? 'step'}`,
          cost: nanoToDollars(step.billingCost),
          inputTokens: 0,
          outputTokens: 0,
          durationMs,
          toolNames: [],
        });
      }
    }
    // Preserve the bare-array contract for existing batch consumers
    // (`JSON.parse(batchResult).map(...)`).
    return JSON.stringify(envelope.results);
  }

  // ---- Single-action shape: $-prefixed metadata
  if (typeof envelope?.$billingCost === 'number') {
    recordUsage({
      ts: Date.now(),
      agentName,
      cliAction,
      cost: nanoToDollars(envelope.$billingCost),
      billingEvents: envelope.$billingEvents as BillingEvent[] | undefined,
      // CLI billing isn't expressed as input/output tokens for most actions
      // (image gen is per-image, scrape per-page, etc). `numUnits` inside each
      // billingEvent carries the per-event unit count.
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      toolNames: [],
    });
  }

  if (options?.outputKey) {
    const v = envelope?.[options.outputKey];
    if (v === undefined || v === null) {
      return JSON.stringify(stripDollarKeys(envelope));
    }
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  return JSON.stringify(stripDollarKeys(envelope));
}

/** Shallow-copy with `$`-prefixed top-level keys removed. Matches the
 * original `--no-meta` contract for single-action envelopes so callers that
 * consume the full body don't suddenly see billing fields bleed in. */
function stripDollarKeys(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return envelope;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(envelope)) {
    if (!k.startsWith('$')) {
      out[k] = v;
    }
  }
  return out;
}
