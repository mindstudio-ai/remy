/**
 * Trace schema — the normalized, jq-able reconstruction of a debug bundle.
 *
 * A bundle contains five overlapping records of one session told by different
 * narrators (conversation, runtime, ledger, sandbox, app). The trace reconciles
 * them into flat arrays with one identity system so any question is a selector,
 * not an archaeology dig. The transformer is deterministic and judgment-free:
 * it joins and attributes, it never interprets.
 *
 * Conventions:
 * - Flat arrays with cross-references (`turnIndex`, `toolCallId`, `requestId`)
 *   beat nesting for jq. The one exception: a sub-agent's transcript nests on
 *   the tool call that spawned it, but its tool calls still live in the flat
 *   `toolCalls` array (referenced by id from transcript events).
 * - Joins by explicit id are trusted; joins by time window are marked
 *   `attribution: 'window'` so a consumer can tell known from inferred.
 * - Nothing is silently dropped: source truncation/rotation is *marked*, and
 *   every raw log line survives in `logLines`.
 */

export interface Trace {
  meta: TraceMeta;
  /** The spine: the session reconstructed as turns. */
  turns: Turn[];
  /** Every tool call at every depth, flattened. The causal join lives here. */
  toolCalls: ToolCall[];
  /** One row per usage-ledger entry (LLM or CLI call), enriched + attributed. */
  llmCalls: LlmCall[];
  /** Unified chronological error ledger across all sources. */
  errors: ErrorEvent[];
  /** The user's app doing things — method executions from requests.log. */
  methods: MethodExecution[];
  /** Preview browser activity — network/console from browser.log. */
  browser: BrowserEvent[];
  /** Sandbox process table from status.json. */
  processes: ProcessRecord[];
  /** All log lines from every file, normalized and attributed. Full firehose. */
  logLines: LogLine[];
}

// ---------------------------------------------------------------------------
// Meta — trust first, triage second
// ---------------------------------------------------------------------------

export interface TraceMeta {
  schemaVersion: number;
  generatedAt: string;
  bundleDir: string;
  app?: {
    appId?: string;
    name?: string;
    methodCount?: number;
    tableCount?: number;
    interfaceCount?: number;
    scenarioCount?: number;
  };
  /** Component versions from status.json — corpus queries key on these. */
  versions?: Record<string, unknown>;
  integrity: {
    presentFiles: string[];
    /** Bundle fetches are best-effort with 8s timeouts — partial is by design. */
    missingFiles: string[];
    /** Files that were present but failed to parse. */
    unparseableFiles: string[];
    /** Session rotation archived the head — the oldest turns are not here. */
    sessionDecapitated: boolean;
    /** Logs whose first timestamp starts suspiciously late (tail-only after
     * size rotation). Heuristic — hence "possibly". */
    possiblyRotatedLogHeads: string[];
    /** Count of tool results carrying the persistence-cap truncation marker. */
    truncatedResults: number;
  };
  /** What was on screen when the bundle was captured (state.json extract). */
  frontendSnapshot?: Record<string, unknown>;
  /** remy-stats.json passthrough (cumulative stats + queue + passive pen).
   * Absent from bundles captured before it was added (Aug 2026). */
  stats?: Record<string, unknown>;
  /** Per-surface model config persisted in the session file. */
  models?: Record<string, string>;
  totals: {
    /** First-to-last observed activity across turns. */
    wallClockMs?: number;
    firstTs?: number;
    lastTs?: number;
    cost: number;
    llmCalls: number;
    toolCalls: number;
    errors: number;
    turns: number;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Turns — the spine
// ---------------------------------------------------------------------------

export interface Turn {
  index: number;
  /** agent.log request id ("ac-N"), when any of the turn's tools matched. */
  requestId?: string;
  trigger: {
    /** hidden = sent to the LLM but not shown in the UI (queued/system-injected). */
    kind: 'user' | 'hidden' | 'system' | 'unknown';
    text: string;
    attachments?: string[];
  };
  /** Interleaved narrative in original order. Tool detail lives in toolCalls. */
  events: TurnEvent[];
  outcome: 'completed' | 'error' | 'unknown';
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  /** Where the wall clock went, where computable. Approximate: top-level tool
   * time + attributed main-loop LLM time; idle is the remainder, clamped. */
  breakdown?: { llmMs: number; toolMs: number; idleMs: number };
  /** End-of-turn usage from the session message, plus ledger-attributed cost. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    llmCalls: number;
    cost?: number;
  };
  model?: string;
  modelOverride?: { from: string };
  errorCount: number;
}

export type TurnEvent =
  | { type: 'text'; text: string; startedAt?: number }
  | { type: 'thinking'; text: string; startedAt?: number; completedAt?: number }
  | { type: 'redacted_thinking'; startedAt?: number }
  /** Detail (input/result/duration/sub-agent) lives in toolCalls[]. */
  | { type: 'tool'; toolCallId: string }
  /** Compaction/rotation chapter markers. `name` is 'conversation' or a
   * sub-agent name; `recent` quotes the last things said in the replaced range. */
  | {
      type: 'summary';
      name: string;
      text: string;
      recent?: string;
      startedAt?: number;
    };

// ---------------------------------------------------------------------------
// Tool calls — the causal join
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  turnIndex: number;
  /** Which agent issued the call: 'main' or the sub-agent's name. */
  agent: string;
  /** 0 = main agent; each sub-agent hop adds one. */
  depth: number;
  /** Ancestry of spawning tool-call ids, ending with this id. */
  path: string[];
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError: boolean;
  /** Result carries the persistence-cap marker — the model saw more, live. */
  resultTruncated?: boolean;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  background?: boolean;
  backgroundResult?: string;
  uiOnly?: boolean;
  /** Present when this call spawned a sub-agent. Its transcript nests here;
   * its tool calls are in the flat toolCalls array (agent = this sub-agent). */
  subAgent?: {
    name: string;
    turns: SubAgentTurn[];
    llmCalls: number;
    cost?: number;
  };
  // Joined from agent.log / usage.ndjson:
  requestId?: string;
  /** Indexes into llmCalls attributed to this call (usage parentToolId). */
  llmCallIndexes?: number[];
  /** Sum of attributed spend (dollars). */
  cost?: number;
}

export interface SubAgentTurn {
  /** The task/tool-result message that started this sub-agent turn. */
  trigger?: { kind: 'task' | 'toolResult' | 'system'; text: string };
  events: TurnEvent[];
}

// ---------------------------------------------------------------------------
// LLM calls — the ledger, enriched
// ---------------------------------------------------------------------------

export interface LlmCall {
  index: number;
  ts: number;
  /** cli = a mindstudio CLI action row (cliAction set); agent = a loop turn. */
  kind: 'agent' | 'cli';
  cliAction?: string;
  agent: string;
  model?: string;
  requestId?: string;
  /** The tool call this ran under (ledger parentToolId). */
  toolCallId?: string;
  turnIndex?: number;
  /** How turnIndex was derived: explicit id join vs. timestamp window. */
  attribution?: 'id' | 'window';
  durationMs: number;
  /** Joined from the nearest matching agent.log stream row, when found. */
  ttfbMs?: number;
  stopReason?: string;
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheCreation?: number;
  };
  /** Dollars (ledger `cost`). billingEvents stay in nano-dollars upstream. */
  cost?: number;
  toolNames?: string[];
}

// ---------------------------------------------------------------------------
// Errors, methods, browser, processes, log lines
// ---------------------------------------------------------------------------

export interface ErrorEvent {
  ts?: number;
  source: 'tool' | 'log' | 'process' | 'method' | 'browser';
  /** Which bundle file it came from, for log-sourced errors. */
  sourceFile?: string;
  severity: 'warn' | 'error';
  turnIndex?: number;
  toolCallId?: string;
  summary: string;
  detail?: unknown;
}

export interface MethodExecution {
  requestId: string;
  method: string;
  /** What initiated the run (e.g. 'poll'), from the tunnel runner. */
  source?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  /** Runner breakdown: transpileMs / executeMs / submitMs / totalMs. */
  timing?: Record<string, number>;
  input?: unknown;
  ok: boolean;
  error?: string;
  turnIndex?: number;
  attribution?: 'window';
}

export interface BrowserEvent {
  ts: number;
  kind: 'network' | 'console' | 'interaction' | 'other';
  // network:
  method?: string;
  url?: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  // console:
  level?: string;
  text?: string;
  turnIndex?: number;
  attribution?: 'window';
}

export interface ProcessRecord {
  name: string;
  type?: string;
  command?: string;
  state?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  exitCode?: number | null;
  signal?: string | null;
  restartCount?: number;
  pid?: number | null;
}

export interface LogLine {
  ts?: number;
  source:
    | 'agent'
    | 'system'
    | 'devServer'
    | 'tunnel'
    | 'lsp'
    | 'requests'
    | 'browser';
  level?: string;
  module?: string;
  msg?: string;
  requestId?: string;
  toolCallId?: string;
  turnIndex?: number;
  attribution?: 'id' | 'window';
  /** The full original record. Nothing lost. */
  raw: Record<string, unknown>;
}
