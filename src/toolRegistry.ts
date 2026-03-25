/**
 * Tool execution registry.
 *
 * Tracks all running tool executions (at any nesting depth) and provides
 * stop/restart control via stdin commands. Each tool gets its own
 * AbortController and a controllable promise that the caller awaits.
 *
 * The registry is created by the headless layer, passed into runTurn,
 * and threaded down through sub-agent runners so tools at every level
 * are registered uniformly.
 */

import type { AgentEvent } from './types.js';

export interface ToolRegistryEntry {
  id: string;
  name: string;
  input: Record<string, any>;
  parentToolId?: string;
  abortController: AbortController;
  startedAt: number;
  /** Settle the controllable promise — resolves the caller's await. */
  settle: (result: string, isError: boolean) => void;
  /** Abort current execution and re-invoke with new (or same) input. */
  rerun: (input: Record<string, any>) => void;
  /** For sub-agents: return whatever text has accumulated so far. */
  getPartialResult?: () => string;
}

export class ToolRegistry {
  entries = new Map<string, ToolRegistryEntry>();
  onEvent?: (event: AgentEvent) => void;

  register(entry: ToolRegistryEntry): void {
    this.entries.set(entry.id, entry);
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  get(id: string): ToolRegistryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Stop a running tool.
   *
   * - graceful: abort and settle with [INTERRUPTED] + partial result
   * - hard: abort and settle with a generic error
   *
   * Returns true if the tool was found and stopped.
   */
  stop(id: string, mode: 'graceful' | 'hard'): boolean {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    entry.abortController.abort(mode);

    if (mode === 'graceful') {
      const partial = entry.getPartialResult?.() ?? '';
      const result = partial
        ? `[INTERRUPTED]\n\n${partial}`
        : '[INTERRUPTED] Tool execution was stopped.';
      entry.settle(result, false);
    } else {
      entry.settle('Error: tool was cancelled', true);
    }

    this.onEvent?.({
      type: 'tool_stopped',
      id: entry.id,
      name: entry.name,
      mode,
      ...(entry.parentToolId && { parentToolId: entry.parentToolId }),
    });

    this.entries.delete(id);
    return true;
  }

  /**
   * Restart a running tool with the same or patched input.
   * The original controllable promise stays pending and settles
   * when the new execution finishes.
   *
   * Returns true if the tool was found and restarted.
   */
  restart(id: string, patchedInput?: Record<string, any>): boolean {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    // Abort current execution
    entry.abortController.abort('restart');

    const newInput = patchedInput
      ? { ...entry.input, ...patchedInput }
      : entry.input;

    this.onEvent?.({
      type: 'tool_restarted',
      id: entry.id,
      name: entry.name,
      input: newInput,
      ...(entry.parentToolId && { parentToolId: entry.parentToolId }),
    });

    // Re-invoke — this creates a fresh AbortController internally
    entry.rerun(newInput);
    return true;
  }
}
