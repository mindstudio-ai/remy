/**
 * Headless mode — stdin/stdout JSON protocol for programmatic control.
 *
 * Designed for parent processes like the mindstudio-sandbox C&C server.
 * Input: newline-delimited JSON on stdin  (e.g. {"action":"message","text":"..."})
 * Output: newline-delimited JSON on stdout (e.g. {"event":"text","text":"..."})
 */

import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from './config.js';
import { buildSystemPrompt } from './prompt/index.js';
import { setLspBaseUrl } from './tools/_helpers/lsp.js';
import {
  createAgentState,
  runTurn,
  type AgentState,
  type AgentEvent,
} from './agent.js';
import { loadSession, clearSession } from './session.js';

export interface HeadlessOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  lspUrl?: string;
}

const BASE_DIR =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const ACTIONS_DIR = path.join(BASE_DIR, 'actions');

function loadActionPrompt(name: string): string {
  return fs.readFileSync(path.join(ACTIONS_DIR, `${name}.md`), 'utf-8').trim();
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

  if (opts.lspUrl) {
    setLspBaseUrl(opts.lspUrl);
  }

  const config = resolveConfig({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });
  const state: AgentState = createAgentState();
  const resumed = loadSession(state);
  if (resumed) {
    emit('session_restored', {
      messageCount: state.messages.length,
    });
  }

  let running = false;
  let currentAbort: AbortController | null = null;

  // External tool results — keyed by tool call id.
  // resolveExternalTool creates a promise; tool_result resolves it.
  // If tool_result arrives first (fast sandbox response), it's buffered
  // in earlyResults and resolved immediately when the promise is created.
  const pendingTools = new Map<string, { resolve: (result: string) => void }>();
  const earlyResults = new Map<string, string>();

  function onEvent(e: AgentEvent): void {
    switch (e.type) {
      case 'text':
        emit('text', { text: e.text });
        break;
      case 'thinking':
        emit('thinking', { text: e.text });
        break;
      case 'tool_input_delta':
        emit('tool_input_delta', { id: e.id, name: e.name, result: e.result });
        break;
      case 'tool_start':
        emit('tool_start', {
          id: e.id,
          name: e.name,
          input: e.input,
          ...(e.partial && { partial: true }),
        });
        break;
      case 'tool_done':
        emit('tool_done', {
          id: e.id,
          name: e.name,
          result: e.result,
          isError: e.isError,
        });
        break;
      case 'turn_started':
        emit('turn_started');
        break;
      case 'turn_done':
        emit('turn_done');
        break;
      case 'turn_cancelled':
        emit('turn_cancelled');
        break;
      case 'error':
        emit('error', { error: e.error });
        break;
    }
  }

  function resolveExternalTool(
    id: string,
    _name: string,
    _input: Record<string, any>,
  ): Promise<string> {
    // If the result arrived before we got here, return it immediately.
    const early = earlyResults.get(id);
    if (early !== undefined) {
      earlyResults.delete(id);
      return Promise.resolve(early);
    }
    // Otherwise, create a promise that tool_result will resolve later.
    return new Promise<string>((resolve) => {
      pendingTools.set(id, { resolve });
    });
  }

  const rl = createInterface({ input: process.stdin });

  rl.on('line', async (line: string) => {
    let parsed: {
      action?: string;
      text?: string;
      runCommand?: string;
      onboardingState?: string;
      viewContext?: {
        mode:
          | 'intake'
          | 'preview'
          | 'spec'
          | 'code'
          | 'databases'
          | 'scenarios'
          | 'logs';
        openFiles?: string[];
        activeFile?: string;
      };
      attachments?: Array<{ url: string; extractedTextUrl?: string }>;
      // tool_result fields
      id?: string;
      result?: string;
    };
    try {
      parsed = JSON.parse(line);
    } catch {
      emit('error', { error: 'Invalid JSON on stdin' });
      return;
    }

    // --- tool_result: external tool response from sandbox ---
    if (parsed.action === 'tool_result' && parsed.id) {
      const pending = pendingTools.get(parsed.id);
      if (pending) {
        // Normal case: resolveExternalTool was called first, resolve the promise.
        pendingTools.delete(parsed.id);
        pending.resolve(parsed.result ?? '');
      } else {
        // Early case: result arrived before resolveExternalTool was called.
        earlyResults.set(parsed.id, parsed.result ?? '');
      }
      return;
    }

    if (parsed.action === 'get_history') {
      emit('history', {
        messages: state.messages,
      });
      return;
    }

    if (parsed.action === 'clear') {
      clearSession(state);
      emit('session_cleared');
      return;
    }

    if (parsed.action === 'cancel') {
      if (currentAbort) {
        currentAbort.abort();
      }
      // Also resolve any pending external tools so the agent doesn't hang
      for (const [id, pending] of pendingTools) {
        pending.resolve('Error: cancelled');
        pendingTools.delete(id);
      }
      return;
    }

    if (parsed.action === 'message' && (parsed.text || parsed.runCommand)) {
      if (running) {
        emit('error', { error: 'Agent is already processing a message' });
        return;
      }
      running = true;
      currentAbort = new AbortController();
      if (parsed.attachments?.length) {
        console.warn(
          `[headless] Message has ${parsed.attachments.length} attachment(s):`,
          parsed.attachments.map((a) => a.url),
        );
      }

      // Resolve the user message — runCommand may substitute a built-in prompt
      let userMessage = parsed.text ?? '';
      const isCommand = !!parsed.runCommand;
      if (parsed.runCommand === 'sync') {
        userMessage = loadActionPrompt('sync');
      } else if (parsed.runCommand === 'publish') {
        userMessage = loadActionPrompt('publish');
      } else if (parsed.runCommand === 'buildFromInitialSpec') {
        userMessage = loadActionPrompt('buildFromInitialSpec');
      }

      const onboardingState = parsed.onboardingState ?? 'onboardingFinished';
      const system = buildSystemPrompt(onboardingState, parsed.viewContext);
      try {
        await runTurn({
          state,
          userMessage,
          attachments: parsed.attachments,
          apiConfig: config,
          system,
          model: opts.model,
          onboardingState,
          signal: currentAbort.signal,
          onEvent,
          resolveExternalTool,
          hidden: isCommand,
        });
      } catch (err: any) {
        emit('error', { error: err.message });
      }
      currentAbort = null;
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
