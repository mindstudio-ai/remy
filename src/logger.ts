/**
 * Structured logger with configurable level and output target.
 *
 * - Headless mode: writes to stderr (sandbox captures it)
 * - Interactive mode: writes to .remy-debug.log in cwd (won't interfere with Ink TUI)
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

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] > currentLevel) {
    return;
  }
  const parts = [`[${timestamp()}]`, level.toUpperCase().padEnd(5), msg];
  if (data) {
    parts.push(JSON.stringify(data));
  }
  writeFn(parts.join(' '));
}

export const log = {
  error(msg: string, data?: Record<string, unknown>) {
    write('error', msg, data);
  },
  warn(msg: string, data?: Record<string, unknown>) {
    write('warn', msg, data);
  },
  info(msg: string, data?: Record<string, unknown>) {
    write('info', msg, data);
  },
  debug(msg: string, data?: Record<string, unknown>) {
    write('debug', msg, data);
  },
};

/** Configure logger for headless mode — writes to stderr. */
export function initLoggerHeadless(level: LogLevel = 'info'): void {
  currentLevel = LEVELS[level];
  writeFn = (line) => {
    process.stderr.write(line + '\n');
  };
}

/** Configure logger for interactive mode — writes to .remy-debug.log. */
export function initLoggerInteractive(level: LogLevel = 'error'): void {
  currentLevel = LEVELS[level];
  let fd: number | null = null;
  writeFn = (line) => {
    try {
      if (fd === null) {
        fd = fs.openSync('.remy-debug.log', 'a');
      }
      fs.writeSync(fd, line + '\n');
    } catch {
      // Best-effort — don't crash if we can't write logs
    }
  };
}

export type { LogLevel };
