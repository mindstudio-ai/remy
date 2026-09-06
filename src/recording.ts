/**
 * Browser-test recording references.
 *
 * The dev tunnel records every interactive `browserCommand` batch with rrweb,
 * uploads the chunk to the app's private `_recordings` store, and appends a
 * `recording` object to the tool result. That object is the editor's only
 * handle on the chunk, and tool results are byte-capped on their way into
 * history (see historyLimits.ts) — a truncated result is no longer JSON, so a
 * reference left inside it is lost. `liftRecording` moves the reference onto
 * the tool block (`ContentBlock.recording`), where nothing caps it, and leaves
 * the model a plain `recorded: true` flag: the sub-agent only needs to know a
 * replay exists, never the storage path.
 */

export interface RecordingRef {
  /** Private-bucket storage ref (`s3://bucket/key`); the editor signs it. */
  path: string;
  /** Recording session — one per tunnel process. Chunks stitch by this + seq. */
  sessionId: string;
  /** Document lifetime. A new runId means a fresh FullSnapshot. */
  runId: string;
  seq: number;
  containsSnapshot: boolean;
  startTs: number;
  endTs: number;
  /** Recorded viewport in CSS px; 0 on chunks that predate the field. The
   *  editor reserves the player's box from it before fetching anything. */
  width: number;
  height: number;
}

/**
 * Split a raw `browserCommand` result into the model-visible string and the
 * recording reference. Results without a valid `recording` (non-JSON, no
 * interactive step, already lifted) pass through unchanged, so this is
 * idempotent and safe to run on every history load.
 */
export function liftRecording(result: string): {
  result: string;
  recording?: RecordingRef;
} {
  if (!result.includes('"recording"')) {
    return { result };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return { result };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { result };
  }
  const obj = parsed as Record<string, unknown>;
  const r = obj.recording;
  if (!r || typeof r !== 'object') {
    return { result };
  }
  const ref = r as Record<string, unknown>;
  if (
    typeof ref.path !== 'string' ||
    typeof ref.sessionId !== 'string' ||
    typeof ref.runId !== 'string' ||
    typeof ref.seq !== 'number'
  ) {
    return { result };
  }
  const recording: RecordingRef = {
    path: ref.path,
    sessionId: ref.sessionId,
    runId: ref.runId,
    seq: ref.seq,
    containsSnapshot: ref.containsSnapshot === true,
    startTs: typeof ref.startTs === 'number' ? ref.startTs : 0,
    endTs: typeof ref.endTs === 'number' ? ref.endTs : 0,
    width: typeof ref.width === 'number' ? ref.width : 0,
    height: typeof ref.height === 'number' ? ref.height : 0,
  };
  const rest = { ...obj };
  delete rest.recording;
  return {
    result: JSON.stringify({ ...rest, recorded: true }),
    recording,
  };
}
