/**
 * Headless mode — stdin/stdout JSON protocol for programmatic control.
 *
 * Designed for parent processes like the mindstudio-sandbox C&C server.
 * Input: newline-delimited JSON on stdin  (e.g. {"action":"message","text":"..."})
 * Output: newline-delimited JSON on stdout (e.g. {"event":"text","text":"..."})
 */

import { createInterface } from 'node:readline';
import { resolveConfig } from './config.js';
import { buildSystemPrompt } from './prompt.js';
import {
  createAgentState,
  runTurn,
  type AgentState,
  type AgentEvent,
} from './agent.js';

export interface HeadlessOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function emit(event: string, data?: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ event, ...data }) + '\n');
}

export async function startHeadless(opts: HeadlessOptions = {}): Promise<void> {
  // Redirect console to stderr so stdout stays clean for the JSON protocol
  const stderrWrite = (...args: unknown[]) => {
    process.stderr.write(args.map(String).join(' ') + '\n');
  };
  console.log = stderrWrite;
  console.warn = stderrWrite;
  console.info = stderrWrite;

  const config = resolveConfig({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });
  const system = buildSystemPrompt();
  const state: AgentState = createAgentState();

  let running = false;

  function onEvent(e: AgentEvent): void {
    switch (e.type) {
      case 'text':
        emit('text', { text: e.text });
        break;
      case 'thinking':
        emit('thinking', { text: e.text });
        break;
      case 'tool_start':
        emit('tool_start', { id: e.id, name: e.name, input: e.input });
        break;
      case 'tool_done':
        emit('tool_done', {
          id: e.id,
          name: e.name,
          result: e.result,
          isError: e.isError,
        });
        break;
      case 'turn_done':
        emit('turn_done');
        break;
      case 'error':
        emit('error', { error: e.error });
        break;
    }
  }

  const rl = createInterface({ input: process.stdin });

  rl.on('line', async (line: string) => {
    let parsed: { action?: string; text?: string };
    try {
      parsed = JSON.parse(line);
    } catch {
      emit('error', { error: 'Invalid JSON on stdin' });
      return;
    }

    if (parsed.action === 'message' && parsed.text) {
      if (running) {
        emit('error', { error: 'Agent is already processing a message' });
        return;
      }
      running = true;
      try {
        await runTurn({
          state,
          userMessage: parsed.text,
          apiConfig: config,
          system,
          model: opts.model,
          onEvent,
        });
      } catch (err: any) {
        emit('error', { error: err.message });
      }
      running = false;
    }
  });

  rl.on('close', () => {
    emit('stopping');
    emit('stopped');
    process.exit(0);
  });

  function shutdown() {
    emit('stopping');
    emit('stopped');
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  emit('ready');
}
