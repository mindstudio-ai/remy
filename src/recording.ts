/**
 * Browser-test recording references.
 *
 * The dev tunnel records every interactive `browserCommand` batch with rrweb,
 * uploads the chunk to the app's private `qa-recordings` store, and appends a
 * `recording` object to the tool result. That object is the editor's only
 * handle on the chunk, and tool results are byte-capped on their way into
 * history (see historyLimits.ts) — a truncated result is no longer JSON, so a
 * reference left inside it is lost. `liftRecording` moves the reference onto
 * the tool block (`ContentBlock.recording`), where nothing caps it.
 *
 * What it leaves the model is `recorded: true` plus the chunk's identifiers
 * (session, run, store, key). A replay is an ordinary private app file, so
 * those identifiers are all the agent needs to enumerate, download or publish
 * one with `remy-admin files`, or to render it as an mp4 with `remy-admin
 * qa-recordings export` — no tool, and nothing resident in the prompt. The
 * heavyweight storage ref still stays out of the capped string.
 *
 * The surviving blocks aren't a reliable carrier either, which is the other
 * half of the story. A persisted sub-agent transcript is capped by dropping
 * its oldest messages, and a run's FullSnapshot chunk — the one anchor its
 * later incremental-only chunks can play against — is always in the oldest of
 * them, because the run's page load is the first thing that happens. A QA run
 * past ~11 steps therefore committed with every chunk reference except the one
 * that made them playable, and the editor showed nothing on reload.
 * `collectRecordings` reads the whole run's references off a transcript before
 * it is capped, so they can be kept on the spawning tool block instead — see
 * attachSubAgentTranscript in historyLimits.ts.
 */

import type { ContentBlock, Message } from './api.js';

export interface RecordingRef {
  /** Private-bucket storage ref (`s3://bucket/key`); the editor signs it. */
  path: string;
  /** The app store and store-relative key this chunk was written to — an
   *  ordinary private store, so `remy-admin files ls|sign|fetch` reaches it.
   *  Absent on chunks recorded before replays left the internal store. */
  store?: string;
  key?: string;
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
 * Every chunk reference in a sub-agent transcript, in the order the run
 * produced them. Call this on the transcript as the run left it — once it has
 * been capped, the references it dropped are gone for good.
 */
export function collectRecordings(messages: Message[]): RecordingRef[] {
  const recordings: RecordingRef[] = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'tool' && block.recording) {
        recordings.push(block.recording);
      }
    }
  }
  return recordings;
}

/**
 * The playback window a set of chunks covers: the session they belong to (a
 * tunnel restart mid-run leaves earlier chunks in a different session, so key
 * on the last one) and the span from the first chunk's start to the last
 * chunk's end. Null when there is nothing to play.
 *
 * This is what names a replay to anything outside remy — the editor's embed and
 * `remy-admin qa-recordings export` both take exactly (session, startTs, endTs).
 */
export function replayWindow(
  recordings: RecordingRef[],
): { sessionId: string; startTs: number; endTs: number } | null {
  if (recordings.length === 0) {
    return null;
  }
  return {
    sessionId: recordings[recordings.length - 1].sessionId,
    startTs: Math.min(...recordings.map((r) => r.startTs)),
    endTs: Math.max(...recordings.map((r) => r.endTs)),
  };
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
    ...(typeof ref.store === 'string' ? { store: ref.store } : {}),
    ...(typeof ref.key === 'string' ? { key: ref.key } : {}),
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
  // What the MODEL sees. The storage ref stays off this string (the cap), but
  // the identifiers do not: they are ~100 bytes and they are how the agent gets
  // from "a replay exists" to the file — `remy-admin files` takes store+key,
  // and `remy-admin qa-recordings` takes the session. Named `replay` rather than
  // `recording` so the idempotency check at the top of this function still
  // holds after a round trip.
  return {
    result: JSON.stringify({
      ...rest,
      recorded: true,
      replay: {
        sessionId: recording.sessionId,
        runId: recording.runId,
        ...(recording.store ? { store: recording.store } : {}),
        ...(recording.key ? { key: recording.key } : {}),
      },
    }),
    recording,
  };
}
