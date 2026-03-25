/**
 * Shared types used across the agent, tools, and sub-agents.
 *
 * Extracted to avoid circular dependencies between agent.ts and
 * tools/index.ts.
 */

import type { Message } from './api.js';

// Events emitted to the UI layer
export type AgentEvent =
  | { type: 'text'; text: string; parentToolId?: string }
  | { type: 'thinking'; text: string; parentToolId?: string }
  | {
      type: 'tool_input_delta';
      id: string;
      name: string;
      result: string;
      parentToolId?: string;
    }
  | {
      type: 'tool_start';
      id: string;
      name: string;
      input: Record<string, any>;
      partial?: boolean;
      background?: boolean;
      parentToolId?: string;
    }
  | {
      type: 'tool_done';
      id: string;
      name: string;
      result: string;
      isError: boolean;
      parentToolId?: string;
    }
  | {
      type: 'tool_stopped';
      id: string;
      name: string;
      mode: 'graceful' | 'hard';
      parentToolId?: string;
    }
  | {
      type: 'tool_restarted';
      id: string;
      name: string;
      input: Record<string, any>;
      parentToolId?: string;
    }
  | { type: 'turn_started' }
  | { type: 'turn_done' }
  | { type: 'turn_cancelled' }
  | { type: 'status'; message: string; parentToolId?: string }
  | { type: 'error'; error: string };

// Conversation state persisted across turns
export interface AgentState {
  messages: Message[];
}

/**
 * Callback for resolving external tool results. The agent emits
 * tool_start, then calls this function which returns a promise that
 * resolves when the external system (sandbox) provides the result.
 */
export type ExternalToolResolver = (
  id: string,
  name: string,
  input: Record<string, any>,
) => Promise<string>;

/** Wire protocol: every stdin command includes an action and optional requestId. */
export interface StdinCommand {
  action: string;
  requestId?: string;
  [key: string]: unknown;
}
