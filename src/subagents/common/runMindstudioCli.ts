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

import { runCli, formatCliResult, type RunCliOptions } from './runCli.js';
import { recordUsage, nanoToDollars } from '../../usageLedger.js';
import type { BillingEvent } from '../../api.js';

export interface RunMindstudioOptions extends RunCliOptions {
  /** Field to extract from the parsed JSON envelope. Returned as a string
   * (stringified if the value is not already a string). Ignored for batch
   * responses, which always return the bare `results` array. */
  outputKey?: string;
  /** Caller identifier for ledger attribution (e.g. 'parent', 'designExpert',
   * 'browserAutomation'). Falls back to 'mindstudio-cli' if omitted. */
  caller?: string;
}

/** Structured outcome. `ok` is false when the CLI failed to run (spawn error,
 * timeout, non-zero exit) OR when an `outputKey` was requested but absent from
 * the envelope (a JSON error body). `value` carries the extracted content on
 * success and a human-readable error/body on failure — never string-sniff it. */
export interface MindstudioResult {
  ok: boolean;
  value: string;
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

/** Structured entry point. Prefer this for internal pipeline callers that
 * must not feed a failure string forward (prompt enhancement, image URLs,
 * screenshot URLs). Model-facing tools can use the string `runMindstudioCli`. */
export async function runMindstudioCliResult(
  args: string[],
  options?: RunMindstudioOptions,
): Promise<MindstudioResult> {
  const cleanArgs = stripFlags(args);
  const cliAction = args[0];
  const agentName = options?.caller ?? 'mindstudio-cli';
  const start = Date.now();

  const res = await runCli('mindstudio', cleanArgs, options);

  // Spawn error, timeout, or non-zero exit with no output. No envelope to
  // parse and no cost to record.
  if (!res.ok) {
    return { ok: false, value: formatCliResult(res) };
  }

  const truncNote = res.truncated ? '\n\n[output truncated]' : '';

  let envelope: any;
  try {
    envelope = JSON.parse(res.output);
  } catch {
    // Not JSON (e.g. `mindstudio ask` markdown). Ran fine; no cost tracking.
    return { ok: true, value: res.output + truncNote };
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
    return { ok: true, value: JSON.stringify(envelope.results) + truncNote };
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
    // Requested key absent → a JSON error body, not a real value. Flag it as
    // a failure so callers don't forward `{...}` as a URL/prompt/analysis.
    if (v === undefined || v === null) {
      return { ok: false, value: JSON.stringify(stripDollarKeys(envelope)) };
    }
    const value = typeof v === 'string' ? v : JSON.stringify(v);
    return { ok: true, value: value + truncNote };
  }

  return {
    ok: true,
    value: JSON.stringify(stripDollarKeys(envelope)) + truncNote,
  };
}

/** String convenience — returns the extracted value on success or a
 * human-readable error/body on failure. Behavior is unchanged for existing
 * model-facing tools (searchGoogle, scrapeWebUrl, analyzeImage, batch). */
export async function runMindstudioCli(
  args: string[],
  options?: RunMindstudioOptions,
): Promise<string> {
  return (await runMindstudioCliResult(args, options)).value;
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
