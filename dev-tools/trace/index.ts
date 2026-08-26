/**
 * Debug-bundle trace transformer.
 *
 * Takes an unzipped debug bundle directory (the bug-report zip: remy-session.json,
 * state.json, status.json, usage.ndjson, remy-stats.json, logs/*.log) and emits
 * one normalized trace.json — see types.ts for the schema and its rationale.
 *
 * Usage:
 *   node dev-tools/trace/index.ts <bundle-dir> [-o out.json]
 *
 * Runtime-dependency-free (node builtins only). The remy type imports are
 * type-only, so they're erased before execution — Node ≥22 runs this directly.
 * Every input is best-effort: a missing or unparseable file is recorded in
 * meta.integrity and the rest of the trace still builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Message, ContentBlock } from '../../src/api.js';
import type { UsageEntry } from '../../src/usageLedger.js';
import type {
  Trace,
  TraceMeta,
  Turn,
  TurnEvent,
  ToolCall,
  SubAgentTurn,
  LlmCall,
  ErrorEvent,
  MethodExecution,
  BrowserEvent,
  ProcessRecord,
  LogLine,
} from './types.js';

const SCHEMA_VERSION = 1;

/** The marker capToolResult appends when a result was truncated at persistence. */
const TRUNCATION_MARKER = '(tool result truncated at ';

const LOG_SOURCES = [
  'agent',
  'system',
  'devServer',
  'tunnel',
  'lsp',
  'requests',
  'browser',
] as const;
type LogSource = (typeof LOG_SOURCES)[number];

// ---------------------------------------------------------------------------
// CLI + best-effort loading
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const outFlag = args.indexOf('-o');
const outPath = outFlag >= 0 ? args[outFlag + 1] : undefined;
// The `-o` value is skipped by position — but only when `-o` is actually
// present. Unguarded, `outFlag + 1` is 0 without it and the bundle dir (the
// sole argument, at index 0) was skipped as if it were the output path,
// so the tool printed usage for correct input.
const bundleDir = args.find(
  (a, i) => a !== '-o' && !(outFlag >= 0 && i === outFlag + 1),
);
if (!bundleDir || !fs.existsSync(bundleDir)) {
  console.error('Usage: node dev-tools/trace/index.ts <bundle-dir> [-o out.json]');
  process.exit(1);
}

const presentFiles: string[] = [];
const missingFiles: string[] = [];
const unparseableFiles: string[] = [];

function readText(rel: string): string | undefined {
  const p = path.join(bundleDir!, rel);
  if (!fs.existsSync(p)) {
    missingFiles.push(rel);
    return undefined;
  }
  presentFiles.push(rel);
  return fs.readFileSync(p, 'utf-8');
}

function readJson(rel: string): any | undefined {
  const text = readText(rel);
  if (text === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    unparseableFiles.push(rel);
    return undefined;
  }
}

/** Parse an NDJSON file. Unparseable lines become `{ text }` records so the
 * firehose stays complete. */
function readNdjson(rel: string): Record<string, any>[] | undefined {
  const text = readText(rel);
  if (text === undefined) {
    return undefined;
  }
  const rows: Record<string, any>[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ text: line });
    }
  }
  return rows;
}

const session = readJson('remy-session.json') as
  | { models?: Record<string, string>; messages?: Message[] }
  | undefined;
const state = readJson('state.json');
const status = readJson('status.json');
const stats = readJson('remy-stats.json');
const usageRows = (readNdjson('usage.ndjson') ?? []) as UsageEntry[];
const logRows = new Map<LogSource, Record<string, any>[]>();
for (const source of LOG_SOURCES) {
  const rows = readNdjson(`logs/${source}.log`);
  if (rows) {
    logRows.set(source, rows);
  }
}

// ---------------------------------------------------------------------------
// Pre-pass: sub-agent names from the ledger (parentToolId → agentName)
// ---------------------------------------------------------------------------

const subAgentNameByToolId = new Map<string, string>();
for (const row of usageRows) {
  if (row.parentToolId && row.agentName && !row.cliAction) {
    subAgentNameByToolId.set(row.parentToolId, row.agentName);
  }
}

// ---------------------------------------------------------------------------
// Session walk → turns + flattened tool calls
// ---------------------------------------------------------------------------

const turns: Turn[] = [];
const toolCalls: ToolCall[] = [];
let truncatedResults = 0;

function isTruncated(result: string | undefined): boolean {
  return !!result && result.includes(TRUNCATION_MARKER);
}

/** Convert one assistant message's blocks to events, registering tool calls. */
function blocksToEvents(
  blocks: ContentBlock[],
  turnIndex: number,
  agent: string,
  depth: number,
  parentPath: string[],
): TurnEvent[] {
  const events: TurnEvent[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      events.push({ type: 'text', text: block.text, startedAt: block.startedAt });
    } else if (block.type === 'thinking') {
      events.push({
        type: 'thinking',
        text: block.thinking,
        startedAt: block.startedAt,
        completedAt: block.completedAt,
      });
    } else if (block.type === 'redacted_thinking') {
      events.push({ type: 'redacted_thinking', startedAt: block.startedAt });
    } else if (block.type === 'summary') {
      events.push({
        type: 'summary',
        name: block.name,
        text: block.text,
        recent: block.recent,
        startedAt: block.startedAt,
      });
    } else if (block.type === 'tool') {
      registerToolCall(block, turnIndex, agent, depth, parentPath);
      events.push({ type: 'tool', toolCallId: block.id });
    }
  }
  return events;
}

/** Register a tool block as a flat ToolCall, recursing into its sub-agent
 * transcript (which nests on the call while its own tool calls flatten). */
function registerToolCall(
  block: Extract<ContentBlock, { type: 'tool' }>,
  turnIndex: number,
  agent: string,
  depth: number,
  parentPath: string[],
): void {
  const truncated = isTruncated(block.result);
  if (truncated) {
    truncatedResults++;
  }
  const call: ToolCall = {
    id: block.id,
    turnIndex,
    agent,
    depth,
    path: [...parentPath, block.id],
    name: block.name,
    input: block.input ?? {},
    result: block.result,
    isError: block.isError === true,
    ...(truncated ? { resultTruncated: true } : {}),
    startedAt: block.startedAt,
    completedAt: block.completedAt,
    ...(block.startedAt && block.completedAt
      ? { durationMs: block.completedAt - block.startedAt }
      : {}),
    ...(block.background ? { background: true } : {}),
    ...(block.backgroundResult
      ? { backgroundResult: block.backgroundResult }
      : {}),
    ...(block.uiOnly ? { uiOnly: true } : {}),
  };
  toolCalls.push(call);

  if (Array.isArray(block.subAgentMessages) && block.subAgentMessages.length) {
    const subName = subAgentNameByToolId.get(block.id) ?? block.name;
    call.subAgent = {
      name: subName,
      turns: walkSubAgentTranscript(
        block.subAgentMessages,
        turnIndex,
        subName,
        depth + 1,
        call.path,
      ),
      llmCalls: 0, // filled in during ledger attribution below
    };
  }
}

/** Segment a sub-agent transcript into turns: each non-tool-result user
 * message opens a turn; assistant messages contribute events; tool-result
 * user messages backfill results the blocks may be missing. */
function walkSubAgentTranscript(
  messages: Message[],
  turnIndex: number,
  agent: string,
  depth: number,
  parentPath: string[],
): SubAgentTurn[] {
  const subTurns: SubAgentTurn[] = [];
  backfillToolResults(messages);
  let sawTask = false;
  for (const msg of messages) {
    if (msg.role !== 'assistant') {
      if (msg.toolCallId) {
        continue; // plumbing — result already backfilled onto the block
      }
      const kind = msg.role === 'system' ? 'system' : sawTask ? 'toolResult' : 'task';
      sawTask = true;
      subTurns.push({
        trigger: { kind, text: contentToText(msg.content) },
        events: [],
      });
      continue;
    }
    if (!subTurns.length) {
      subTurns.push({ events: [] });
    }
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    subTurns[subTurns.length - 1].events.push(
      ...blocksToEvents(blocks, turnIndex, agent, depth, parentPath),
    );
    if (typeof msg.content === 'string' && msg.content) {
      subTurns[subTurns.length - 1].events.push({
        type: 'text',
        text: msg.content,
      });
    }
  }
  return subTurns;
}

function contentToText(content: Message['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Tool blocks usually carry results inline, but a separate tool-result user
 * message is authoritative when the block's copy is missing. */
function backfillToolResults(messages: Message[]): void {
  const resultsByToolId = new Map<string, { text: string; isError: boolean }>();
  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.toolCallId) {
      resultsByToolId.set(msg.toolCallId, {
        text: contentToText(msg.content),
        isError: msg.isToolError === true,
      });
    }
  }
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content) {
      if (block.type === 'tool' && block.result === undefined) {
        const r = resultsByToolId.get(block.id);
        if (r) {
          block.result = r.text;
          if (block.isError === undefined) {
            block.isError = r.isError;
          }
        }
      }
    }
  }
}

const sessionMessages = session?.messages ?? [];
backfillToolResults(sessionMessages);

let sessionDecapitated = false;
{
  const first = sessionMessages[0];
  // A healthy session opens with a real (non-tool-result) user message.
  if (first && (first.role === 'assistant' || first.toolCallId)) {
    sessionDecapitated = true;
  }
}

for (const msg of sessionMessages) {
  if (msg.role !== 'assistant') {
    if (msg.toolCallId) {
      continue; // tool-result plumbing
    }
    turns.push({
      index: turns.length,
      trigger: {
        kind:
          msg.role === 'system' ? 'system' : msg.hidden ? 'hidden' : 'user',
        text: contentToText(msg.content),
        ...(msg.attachments?.length
          ? {
              attachments: msg.attachments.map((a: any) =>
                typeof a === 'string' ? a : (a?.name ?? a?.path ?? 'attachment'),
              ),
            }
          : {}),
      },
      events: [],
      outcome: 'unknown',
      errorCount: 0,
    });
    continue;
  }
  // Assistant activity before any trigger (decapitated head) gets a synthetic
  // turn so nothing is dropped.
  if (!turns.length) {
    turns.push({
      index: 0,
      trigger: { kind: 'unknown', text: '' },
      events: [],
      outcome: 'unknown',
      errorCount: 0,
    });
  }
  const turn = turns[turns.length - 1];
  const blocks = Array.isArray(msg.content) ? msg.content : [];
  turn.events.push(...blocksToEvents(blocks, turn.index, 'main', 0, []));
  if (typeof msg.content === 'string' && msg.content) {
    turn.events.push({ type: 'text', text: msg.content });
  }
  if (msg.usage) {
    turn.usage = { ...msg.usage };
  }
  if (msg.model) {
    turn.model = msg.model;
  }
  if (msg.modelOverride) {
    turn.modelOverride = msg.modelOverride;
  }
}

const toolCallById = new Map(toolCalls.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// agent.log joins — requestIds, tool durations, turn windows, stream metrics
// ---------------------------------------------------------------------------

interface StreamRow {
  ts: number;
  requestId?: string;
  agent: string; // 'parent' or subAgentId — matches ledger agentName
  durationMs?: number;
  ttfbMs?: number;
  stopReason?: string;
  modelId?: string;
  consumed?: boolean;
}

const streamRows: StreamRow[] = [];
const requestIdByToolId = new Map<string, string>();
const logDurationByToolId = new Map<string, number>();
// requestIds ("ac-N") restart from 1 on every agent process restart, so they
// are NOT unique across a session. Every requestId join must therefore be
// time-scoped: windows are kept as ordered lists per id, and lookups pick the
// window containing (or nearest) the timestamp in question.
const windowsByRequestId = new Map<
  string,
  { startedAt?: number; completedAt?: number }[]
>();

{
  const rows = logRows.get('agent') ?? [];
  // Track the latest API response ttfb per (requestId, agent) so the next
  // Stream complete for that key can carry it.
  const lastTtfb = new Map<string, number>();
  for (const row of rows) {
    const msg = row.msg;
    if (msg === 'Tool completed' && row.toolCallId) {
      if (row.requestId) {
        requestIdByToolId.set(row.toolCallId, row.requestId);
      }
      if (typeof row.durationMs === 'number') {
        logDurationByToolId.set(row.toolCallId, row.durationMs);
      }
    } else if (msg === 'API response') {
      const key = `${row.requestId ?? ''}|${row.subAgentId ?? 'parent'}`;
      if (typeof row.ttfbMs === 'number') {
        lastTtfb.set(key, row.ttfbMs);
      }
    } else if (msg === 'Stream complete') {
      const agent = row.subAgentId ?? 'parent';
      const key = `${row.requestId ?? ''}|${agent}`;
      streamRows.push({
        ts: row.ts,
        requestId: row.requestId,
        agent,
        durationMs: row.durationMs,
        ttfbMs: lastTtfb.get(key),
        stopReason: row.stopReason,
        modelId: row.modelId,
      });
      lastTtfb.delete(key);
    } else if (msg === 'Turn started' && row.requestId) {
      const list = windowsByRequestId.get(row.requestId) ?? [];
      list.push({ startedAt: row.ts });
      windowsByRequestId.set(row.requestId, list);
    } else if (msg === 'Turn complete' && row.requestId) {
      const list = windowsByRequestId.get(row.requestId) ?? [];
      const open = [...list].reverse().find((w) => w.completedAt === undefined);
      if (open) {
        open.completedAt = row.ts;
      } else {
        list.push({ completedAt: row.ts });
      }
      windowsByRequestId.set(row.requestId, list);
    }
  }
}

// Apply joins to tool calls, then derive each turn's requestId and window.
for (const call of toolCalls) {
  const requestId = requestIdByToolId.get(call.id);
  if (requestId) {
    call.requestId = requestId;
  }
  if (call.durationMs === undefined) {
    const d = logDurationByToolId.get(call.id);
    if (d !== undefined) {
      call.durationMs = d;
    }
  }
}

// Multimap: several turns can legitimately share a requestId string (see the
// restart note above). Resolution is always by timestamp.
const turnsByRequestId = new Map<string, number[]>();
for (const turn of turns) {
  let minTs: number | undefined;
  let maxTs: number | undefined;
  const consider = (ts?: number) => {
    if (typeof ts !== 'number') {
      return;
    }
    minTs = minTs === undefined ? ts : Math.min(minTs, ts);
    maxTs = maxTs === undefined ? ts : Math.max(maxTs, ts);
  };
  for (const event of turn.events) {
    if (event.type === 'tool') {
      const call = toolCallById.get(event.toolCallId);
      if (call) {
        consider(call.startedAt);
        consider(call.completedAt);
        if (!turn.requestId && call.requestId && call.depth === 0) {
          turn.requestId = call.requestId;
        }
      }
    } else {
      consider(event.startedAt);
      if (event.type === 'thinking') {
        consider(event.completedAt);
      }
    }
  }
  // Prefer the runtime's own turn lifecycle when the requestId matched —
  // choosing the lifecycle window that overlaps this turn's own block range,
  // since the same requestId recurs across process restarts.
  let window: { startedAt?: number; completedAt?: number } | undefined;
  if (turn.requestId && minTs !== undefined) {
    const candidates = windowsByRequestId.get(turn.requestId) ?? [];
    window = candidates.find(
      (w) =>
        (w.startedAt ?? -Infinity) <= (maxTs ?? minTs)! + 60_000 &&
        (w.completedAt ?? Infinity) >= minTs! - 60_000,
    );
  }
  turn.startedAt = window?.startedAt ?? minTs;
  turn.endedAt = window?.completedAt ?? maxTs;
  if (turn.startedAt !== undefined && turn.endedAt !== undefined) {
    turn.durationMs = turn.endedAt - turn.startedAt;
  }
  if (turn.requestId) {
    const list = turnsByRequestId.get(turn.requestId) ?? [];
    list.push(turn.index);
    turnsByRequestId.set(turn.requestId, list);
    if (window?.completedAt !== undefined) {
      turn.outcome = 'completed';
    }
  }
  if (turn.outcome === 'unknown' && turn.events.length) {
    turn.outcome = 'completed';
  }
}

/** Resolve a requestId to a turn, disambiguating restart collisions by ts:
 * prefer the candidate whose window contains it, else the nearest window.
 * Without a ts, only a collision-free id is trusted. */
function turnIndexForRequestId(
  requestId: string,
  ts?: number,
): number | undefined {
  const candidates = turnsByRequestId.get(requestId);
  if (!candidates?.length) {
    return undefined;
  }
  if (candidates.length === 1 && ts === undefined) {
    return candidates[0];
  }
  if (ts === undefined) {
    return undefined;
  }
  let best: number | undefined;
  let bestDistance = Infinity;
  for (const index of candidates) {
    const turn = turns[index];
    const start = turn.startedAt ?? turn.endedAt;
    const end = turn.endedAt ?? turn.startedAt;
    if (start === undefined || end === undefined) {
      continue;
    }
    const distance = ts < start ? start - ts : ts > end ? ts - end : 0;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  // An hour away from every candidate window means the id is from an
  // unrelated restart whose turn didn't survive into the session file.
  return bestDistance <= 60 * 60_000 ? best : undefined;
}

/** Attribute a bare timestamp to the turn whose window contains it. */
function turnIndexForTs(ts: number | undefined): number | undefined {
  if (typeof ts !== 'number') {
    return undefined;
  }
  for (const turn of turns) {
    if (
      turn.startedAt !== undefined &&
      turn.endedAt !== undefined &&
      ts >= turn.startedAt &&
      ts <= turn.endedAt
    ) {
      return turn.index;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Ledger → llmCalls (with stream-row enrichment and attribution)
// ---------------------------------------------------------------------------

const llmCalls: LlmCall[] = [];

/** Greedy nearest-ts match of a ledger row to its agent.log stream row. */
function matchStreamRow(row: UsageEntry): StreamRow | undefined {
  let best: StreamRow | undefined;
  let bestDelta = 15_000; // beyond 15s the "same call" claim isn't credible
  for (const stream of streamRows) {
    if (stream.consumed || stream.agent !== row.agentName) {
      continue;
    }
    if (row.requestId && stream.requestId && row.requestId !== stream.requestId) {
      continue;
    }
    const delta = Math.abs(stream.ts - row.ts);
    if (delta < bestDelta) {
      best = stream;
      bestDelta = delta;
    }
  }
  if (best) {
    best.consumed = true;
  }
  return best;
}

for (const row of usageRows) {
  const kind = row.cliAction ? 'cli' : 'agent';
  const stream = kind === 'agent' ? matchStreamRow(row) : undefined;
  let turnIndex: number | undefined;
  let attribution: 'id' | 'window' | undefined;
  const byRequestId = row.requestId
    ? turnIndexForRequestId(row.requestId, row.ts)
    : undefined;
  if (byRequestId !== undefined) {
    turnIndex = byRequestId;
    attribution = 'id';
  } else if (row.parentToolId && toolCallById.has(row.parentToolId)) {
    turnIndex = toolCallById.get(row.parentToolId)!.turnIndex;
    attribution = 'id';
  } else {
    turnIndex = turnIndexForTs(row.ts);
    if (turnIndex !== undefined) {
      attribution = 'window';
    }
  }
  const call: LlmCall = {
    index: llmCalls.length,
    ts: row.ts,
    kind,
    ...(row.cliAction ? { cliAction: row.cliAction } : {}),
    agent: row.agentName,
    ...(row.modelId || stream?.modelId
      ? { model: row.modelId ?? stream?.modelId }
      : {}),
    ...(row.requestId ? { requestId: row.requestId } : {}),
    ...(row.parentToolId ? { toolCallId: row.parentToolId } : {}),
    ...(turnIndex !== undefined ? { turnIndex } : {}),
    ...(attribution ? { attribution } : {}),
    durationMs: row.durationMs,
    ...(stream?.ttfbMs !== undefined ? { ttfbMs: stream.ttfbMs } : {}),
    ...(stream?.stopReason ? { stopReason: stream.stopReason } : {}),
    tokens: {
      input: row.inputTokens ?? 0,
      output: row.outputTokens ?? 0,
      ...(row.cacheReadTokens !== undefined
        ? { cacheRead: row.cacheReadTokens }
        : {}),
      ...(row.cacheCreationTokens !== undefined
        ? { cacheCreation: row.cacheCreationTokens }
        : {}),
    },
    ...(row.cost !== undefined ? { cost: row.cost } : {}),
    ...(row.toolNames?.length ? { toolNames: row.toolNames } : {}),
  };
  llmCalls.push(call);

  // Attribute spend + call counts to the spawning tool call.
  if (row.parentToolId) {
    const tool = toolCallById.get(row.parentToolId);
    if (tool) {
      (tool.llmCallIndexes ??= []).push(call.index);
      if (row.cost !== undefined) {
        tool.cost = (tool.cost ?? 0) + row.cost;
      }
      if (tool.subAgent) {
        tool.subAgent.llmCalls++;
        if (row.cost !== undefined) {
          tool.subAgent.cost = (tool.subAgent.cost ?? 0) + row.cost;
        }
      }
    }
  }
}

// Turn cost + breakdown from attributed calls.
for (const turn of turns) {
  const attributed = llmCalls.filter((c) => c.turnIndex === turn.index);
  const cost = attributed.reduce((sum, c) => sum + (c.cost ?? 0), 0);
  if (turn.usage) {
    turn.usage.cost = cost;
  } else if (attributed.length) {
    turn.usage = {
      inputTokens: attributed.reduce((s, c) => s + c.tokens.input, 0),
      outputTokens: attributed.reduce((s, c) => s + c.tokens.output, 0),
      llmCalls: attributed.length,
      cost,
    };
  }
  if (turn.durationMs !== undefined) {
    const llmMs = attributed
      .filter((c) => c.kind === 'agent' && c.agent === 'parent')
      .reduce((s, c) => s + c.durationMs, 0);
    const toolMs = turn.events
      .filter((e) => e.type === 'tool')
      .map((e) => toolCallById.get((e as { toolCallId: string }).toolCallId))
      .reduce((s, c) => s + (c?.durationMs ?? 0), 0);
    turn.breakdown = {
      llmMs,
      toolMs,
      idleMs: Math.max(0, turn.durationMs - llmMs - toolMs),
    };
  }
}

// ---------------------------------------------------------------------------
// Methods (requests.log), browser events, processes
// ---------------------------------------------------------------------------

// Two overlapping records of app method executions share requestIds: the
// tunnel runner (high-volume: received/complete/failed with timing) and the
// requests execution log (low-volume, heavy rows that head-rotate fast, but
// carrying input/success detail). Runner rows are primary; execution rows
// merge in by requestId.
const methods: MethodExecution[] = [];
{
  const byRequestId = new Map<string, MethodExecution>();
  const upsert = (requestId: string, method?: string): MethodExecution => {
    let m = byRequestId.get(requestId);
    if (!m) {
      m = { requestId, method: method ?? 'unknown', ok: true };
      byRequestId.set(requestId, m);
      methods.push(m);
    } else if (method && m.method === 'unknown') {
      m.method = method;
    }
    return m;
  };

  for (const row of logRows.get('tunnel') ?? []) {
    if (row.module !== 'runner' || !row.requestId) {
      continue;
    }
    if (row.msg === 'Method received') {
      const m = upsert(row.requestId, row.method);
      m.startedAt = row.ts;
      if (row.source) {
        m.source = row.source;
      }
    } else if (row.msg === 'Method complete' || row.msg === 'Method failed') {
      const m = upsert(row.requestId, row.method);
      m.completedAt = row.ts;
      if (row.timing && typeof row.timing === 'object') {
        m.timing = row.timing;
        if (typeof row.timing.totalMs === 'number') {
          m.durationMs = row.timing.totalMs;
        }
      }
      if (row.msg === 'Method failed' || row.error) {
        m.ok = false;
        if (row.error) {
          m.error =
            typeof row.error === 'string' ? row.error : JSON.stringify(row.error);
        }
      }
    }
  }

  for (const row of logRows.get('requests') ?? []) {
    if (!row.requestId) {
      continue;
    }
    if (row.type === 'method-start') {
      const m = upsert(row.requestId, row.method);
      m.startedAt ??= row.ts;
      if (row.input !== undefined) {
        m.input = row.input;
      }
    } else if (row.type === 'method') {
      const m = upsert(row.requestId, row.method);
      m.completedAt ??= row.ts;
      if (typeof row.duration === 'number' && m.durationMs === undefined) {
        m.durationMs = row.duration;
      }
      if (row.success === false || row.error) {
        m.ok = false;
        if (row.error && !m.error) {
          m.error =
            typeof row.error === 'string' ? row.error : JSON.stringify(row.error);
        }
      }
    }
  }

  for (const m of methods) {
    const ti = turnIndexForTs(m.startedAt ?? m.completedAt);
    if (ti !== undefined) {
      m.turnIndex = ti;
      m.attribution = 'window';
    }
  }
  methods.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

const browser: BrowserEvent[] = [];
{
  const rows = logRows.get('browser') ?? [];
  for (const row of rows) {
    if (typeof row.ts !== 'number') {
      continue;
    }
    const kind =
      row.type === 'network' || row.type === 'console' || row.type === 'interaction'
        ? row.type
        : 'other';
    const event: BrowserEvent = {
      ts: row.ts,
      kind,
      ...(row.method ? { method: row.method } : {}),
      ...(row.url ? { url: row.url } : {}),
      ...(typeof row.status === 'number' ? { status: row.status } : {}),
      ...(typeof row.ok === 'boolean' ? { ok: row.ok } : {}),
      ...(typeof row.duration === 'number' ? { durationMs: row.duration } : {}),
      ...(row.level ? { level: row.level } : {}),
      ...(Array.isArray(row.args)
        ? { text: row.args.map((a: unknown) => String(a)).join(' ') }
        : row.text
          ? { text: String(row.text) }
          : {}),
    };
    const ti = turnIndexForTs(row.ts);
    if (ti !== undefined) {
      event.turnIndex = ti;
      event.attribution = 'window';
    }
    browser.push(event);
  }
}

const processes: ProcessRecord[] = (status?.processes ?? []).map((p: any) => ({
  name: p.name,
  type: p.type,
  command: p.command,
  state: p.state,
  startedAt: p.startedAt,
  endedAt: p.endedAt,
  durationMs: p.duration,
  exitCode: p.exitCode,
  signal: p.signal,
  restartCount: p.restartCount,
  pid: p.pid,
}));

// ---------------------------------------------------------------------------
// Log lines — the full normalized firehose
// ---------------------------------------------------------------------------

const logLines: LogLine[] = [];
for (const source of LOG_SOURCES) {
  const rows = logRows.get(source);
  if (!rows) {
    continue;
  }
  for (const raw of rows) {
    const line: LogLine = {
      ...(typeof raw.ts === 'number' ? { ts: raw.ts } : {}),
      source,
      ...(raw.level ? { level: raw.level } : {}),
      ...(raw.module ? { module: raw.module } : {}),
      ...(raw.msg !== undefined ? { msg: String(raw.msg) } : {}),
      ...(raw.requestId ? { requestId: raw.requestId } : {}),
      ...(raw.toolCallId ? { toolCallId: raw.toolCallId } : {}),
      raw,
    };
    const byRequestId = line.requestId
      ? turnIndexForRequestId(line.requestId, line.ts)
      : undefined;
    if (byRequestId !== undefined) {
      line.turnIndex = byRequestId;
      line.attribution = 'id';
    } else {
      const ti = turnIndexForTs(line.ts);
      if (ti !== undefined) {
        line.turnIndex = ti;
        line.attribution = 'window';
      }
    }
    logLines.push(line);
  }
}

// ---------------------------------------------------------------------------
// Error ledger
// ---------------------------------------------------------------------------

const errors: ErrorEvent[] = [];
for (const call of toolCalls) {
  if (call.isError) {
    errors.push({
      ts: call.completedAt ?? call.startedAt,
      source: 'tool',
      severity: 'error',
      turnIndex: call.turnIndex,
      toolCallId: call.id,
      summary: `${call.name}: ${(call.result ?? '').slice(0, 200)}`,
    });
  }
}
for (const line of logLines) {
  if (line.level === 'error' || line.level === 'warn') {
    errors.push({
      ts: line.ts,
      source: 'log',
      sourceFile: `logs/${line.source}.log`,
      severity: line.level as 'warn' | 'error',
      ...(line.turnIndex !== undefined ? { turnIndex: line.turnIndex } : {}),
      summary: line.msg ?? JSON.stringify(line.raw).slice(0, 200),
      detail: line.raw,
    });
  }
}
for (const m of methods) {
  if (!m.ok) {
    errors.push({
      ts: m.completedAt ?? m.startedAt,
      source: 'method',
      severity: 'error',
      ...(m.turnIndex !== undefined ? { turnIndex: m.turnIndex } : {}),
      summary: `${m.method}: ${m.error ?? 'failed'}`,
    });
  }
}
for (const event of browser) {
  if (event.kind === 'console' && event.level === 'error') {
    errors.push({
      ts: event.ts,
      source: 'browser',
      severity: 'error',
      ...(event.turnIndex !== undefined ? { turnIndex: event.turnIndex } : {}),
      summary: (event.text ?? 'console error').slice(0, 200),
    });
  } else if (event.kind === 'network' && event.ok === false) {
    errors.push({
      ts: event.ts,
      source: 'browser',
      severity: 'warn',
      ...(event.turnIndex !== undefined ? { turnIndex: event.turnIndex } : {}),
      summary: `${event.method ?? 'GET'} ${event.url ?? ''} → ${event.status ?? '?'}`,
    });
  }
}
for (const p of processes) {
  if (typeof p.exitCode === 'number' && p.exitCode !== 0) {
    errors.push({
      source: 'process',
      severity: 'error',
      ts: p.endedAt,
      summary: `${p.name} exited ${p.exitCode}${p.signal ? ` (${p.signal})` : ''}`,
    });
  } else if ((p.restartCount ?? 0) > 0) {
    errors.push({
      source: 'process',
      severity: 'warn',
      summary: `${p.name} restarted ${p.restartCount} time(s)`,
    });
  }
}
errors.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
for (const turn of turns) {
  turn.errorCount = errors.filter((e) => e.turnIndex === turn.index).length;
  if (turn.errorCount > 0 && turn.outcome === 'unknown') {
    turn.outcome = 'error';
  }
}

// ---------------------------------------------------------------------------
// Integrity + meta
// ---------------------------------------------------------------------------

const usageFirstTs = usageRows.length ? usageRows[0].ts : undefined;
const firstTurnTs = turns.find((t) => t.startedAt !== undefined)?.startedAt;
if (
  usageFirstTs !== undefined &&
  firstTurnTs !== undefined &&
  usageFirstTs < firstTurnTs - 10 * 60_000
) {
  // The ledger remembers further back than the session — the head rotated away.
  sessionDecapitated = true;
}

const overallFirstTs = Math.min(
  ...[usageFirstTs, firstTurnTs].filter((t): t is number => t !== undefined),
);
const possiblyRotatedLogHeads: string[] = [];
if (Number.isFinite(overallFirstTs)) {
  for (const source of LOG_SOURCES) {
    const rows = logRows.get(source);
    const firstTs = rows?.find((r) => typeof r.ts === 'number')?.ts;
    if (firstTs !== undefined && firstTs > overallFirstTs + 30 * 60_000) {
      possiblyRotatedLogHeads.push(`logs/${source}.log`);
    }
  }
}

const allTs = [
  ...turns.flatMap((t) => [t.startedAt, t.endedAt]),
  ...llmCalls.map((c) => c.ts),
].filter((t): t is number => typeof t === 'number');
const firstTs = allTs.length ? Math.min(...allTs) : undefined;
const lastTs = allTs.length ? Math.max(...allTs) : undefined;

const frontendSnapshotKeys = [
  'sandboxStatus',
  'appId',
  'activeFilePath',
  'editorTab',
  'previewPath',
  'devicePreset',
  'specActiveTab',
  'agentStatus',
  'agentProcessStatus',
  'agentTurnDurationMs',
  'currentTurn',
  'compaction',
];

const meta: TraceMeta = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  bundleDir: path.resolve(bundleDir),
  ...(status?.app ? { app: status.app } : {}),
  ...(status?.versions ? { versions: status.versions } : {}),
  integrity: {
    presentFiles,
    missingFiles,
    unparseableFiles,
    sessionDecapitated,
    possiblyRotatedLogHeads,
    truncatedResults,
  },
  ...(state
    ? {
        frontendSnapshot: Object.fromEntries(
          frontendSnapshotKeys
            .filter((k) => state[k] !== undefined)
            .map((k) => [k, state[k]]),
        ),
      }
    : {}),
  ...(stats ? { stats } : {}),
  ...(session?.models ? { models: session.models } : {}),
  totals: {
    ...(firstTs !== undefined && lastTs !== undefined
      ? { wallClockMs: lastTs - firstTs, firstTs, lastTs }
      : {}),
    cost: llmCalls.reduce((s, c) => s + (c.cost ?? 0), 0),
    llmCalls: llmCalls.length,
    toolCalls: toolCalls.length,
    errors: errors.length,
    turns: turns.length,
    tokens: {
      input: llmCalls.reduce((s, c) => s + c.tokens.input, 0),
      output: llmCalls.reduce((s, c) => s + c.tokens.output, 0),
      cacheRead: llmCalls.reduce((s, c) => s + (c.tokens.cacheRead ?? 0), 0),
      cacheCreation: llmCalls.reduce(
        (s, c) => s + (c.tokens.cacheCreation ?? 0),
        0,
      ),
    },
  },
};

const trace: Trace = {
  meta,
  turns,
  toolCalls,
  llmCalls,
  errors,
  methods,
  browser,
  processes,
  logLines,
};

const output = outPath ?? path.join(bundleDir, 'trace.json');
fs.writeFileSync(output, JSON.stringify(trace));

const mb = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.error(
  `trace.json written to ${output} (${mb}MB)\n` +
    `  turns: ${turns.length}  toolCalls: ${toolCalls.length}  llmCalls: ${llmCalls.length}\n` +
    `  errors: ${errors.length}  methods: ${methods.length}  browser: ${browser.length}  logLines: ${logLines.length}\n` +
    `  cost: $${meta.totals.cost.toFixed(2)}  decapitated: ${sessionDecapitated}  missing: [${missingFiles.join(', ')}]`,
);
