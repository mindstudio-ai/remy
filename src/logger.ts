/**
 * Structured NDJSON logger with configurable level and output target.
 *
 * Each log line is a self-contained JSON object:
 *   {"ts":1711234567890,"level":"info","module":"agent","msg":"Turn started","requestId":"ac-4"}
 *
 * - Headless mode: writes to stderr (stdout reserved for wire protocol)
 * - Interactive mode: writes to .logs/agent.ndjson
 *
 * Levels: error > warn > info > debug
 */

import fs from 'node:fs';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentLevel: number = LEVELS.error;
let writeFn: (line: string) => void = () => {};

// ---------------------------------------------------------------------------
// Value truncation (keeps payloads readable)
// ---------------------------------------------------------------------------

const MAX_VALUE_LENGTH = 200;

function truncateValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
      result[key] =
        value.slice(0, MAX_VALUE_LENGTH) + `... (${value.length} chars)`;
    } else if (Array.isArray(value) && value.length > 5) {
      result[key] = `[${value.length} items]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core write
// ---------------------------------------------------------------------------

function write(
  level: LogLevel,
  module: string,
  msg: string,
  data?: Record<string, unknown>,
) {
  if (LEVELS[level] > currentLevel) {
    return;
  }

  const entry: Record<string, unknown> = {
    ts: Date.now(),
    level,
    module,
    msg,
  };

  if (data) {
    Object.assign(entry, truncateValues(data));
  }

  writeFn(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Logger {
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

/** Create a module-scoped logger. */
export function createLogger(module: string): Logger {
  return {
    error: (msg, data) => write('error', module, msg, data),
    warn: (msg, data) => write('warn', module, msg, data),
    info: (msg, data) => write('info', module, msg, data),
    debug: (msg, data) => write('debug', module, msg, data),
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Configure logger for headless mode — NDJSON to stderr. */
export function initLoggerHeadless(level: LogLevel = 'info'): void {
  currentLevel = LEVELS[level];
  writeFn = (line) => {
    process.stderr.write(line + '\n');
  };
}

/** Configure logger for interactive mode — NDJSON to .logs/agent.ndjson. */
export function initLoggerInteractive(level: LogLevel = 'error'): void {
  currentLevel = LEVELS[level];
  let fd: number | null = null;
  writeFn = (line) => {
    try {
      if (fd === null) {
        fs.mkdirSync('.logs', { recursive: true });
        fd = fs.openSync('.logs/agent.ndjson', 'a');
      }
      fs.writeSync(fd, line + '\n');
    } catch {
      // Best-effort — don't crash if we can't write logs
    }
  };
}

export type { LogLevel };
