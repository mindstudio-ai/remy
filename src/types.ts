/**
 * Shared types used across the agent, tools, and sub-agents.
 *
 * Extracted to avoid circular dependencies between agent.ts and
 * tools/index.ts.
 */

import type { Message, Attachment } from './api.js';

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
      type: 'tool_background_complete';
      id: string;
      name: string;
      result: string;
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
  | {
      type: 'user_message';
      text: string;
      hidden?: boolean;
      /** Carried through so the live event has parity with get_history —
       * without it, queued voice/image/file sends render blank until refresh. */
      attachments?: Attachment[];
      /** Per-entry correlation id. On merged turns each absorbed message's
       * user_message carries its own original requestId, not the turn's. */
      requestId?: string;
      /** True when the message was delivered from the queue rather than sent
       * while the agent was idle — the frontend renders these echoes (idle
       * sends are already rendered optimistically). */
      queued?: boolean;
    }
  | { type: 'turn_started'; model?: string; modelOverride?: { from: string } }
  | {
      type: 'turn_done';
      stats?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
        llmCalls: number;
        lastCallInputTokens?: number;
        lastCallCacheCreation?: number;
        lastCallCacheRead?: number;
      };
    }
  | { type: 'turn_cancelled' }
  | { type: 'status'; message: string; parentToolId?: string }
  | { type: 'error'; error: string; code?: string };

// Conversation state persisted across turns
export interface AgentState {
  messages: Message[];
  /** Per-agent model overrides. Keys are agent identifiers (`parent`,
   * `visualDesignExpert`, etc.); values are server-side model IDs. A
   * missing key means "use the server default for this agent" — we omit
   * `modelId` on those requests. Mutable mid-session via the `changeModels`
   * stdin command (preserves history; resolved live per call, so it takes
   * effect on the next turn); empty/omitted resets to defaults. `clear` wipes
   * history only and leaves these picks intact, so a caller wanting both
   * issues `clear` and `changeModels` in either order. */
  models?: Record<string, string>;
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

/**
 * One user-visible message within a turn. A turn normally has a single
 * entry; a merged mailbox turn (contiguous queued user messages and
 * background results delivered together) has several. Each entry becomes
 * its own `Message` in history and its own `user_message` event — the
 * batch shares one API call and one tool loop.
 */
export interface TurnEntry {
  text: string;
  attachments?: Attachment[];
  /** File-path header injected into the LLM-bound message at API-send time;
   * never persisted into the entry's content. */
  attachmentHeader?: string;
  hidden?: boolean;
  /** Correlation id for this entry's user_message event. */
  requestId?: string;
  /** True when the entry was delivered from the queue. */
  queued?: boolean;
}
