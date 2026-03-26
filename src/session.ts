/**
 * Session persistence — saves/loads conversation history to a file.
 *
 * Writes .remy-session.json in the working directory after each turn.
 * On boot, loads existing session if present, giving the agent full
 * context of prior work. Delete the file to start fresh.
 */

import fs from 'node:fs';
import type { Message, ContentBlock } from './api.js';
import type { AgentState } from './agent.js';
import { createLogger } from './logger.js';

const log = createLogger('session');

const SESSION_FILE = '.remy-session.json';

export function loadSession(state: AgentState): boolean {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      state.messages = sanitizeMessages(data.messages as Message[]);
      log.info('Session loaded', { messageCount: state.messages.length });
      return true;
    }
  } catch {
    // No session file or invalid — start fresh
  }
  return false;
}

/**
 * Ensure every tool_use has a matching tool_result.
 *
 * If an assistant message has tool blocks in its content but the
 * following messages don't include matching tool_result entries
 * (e.g., due to a crash or cancellation bug), inject synthetic
 * error results so the API doesn't reject the conversation.
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i]);
    const msg = messages[i];

    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }

    // Extract tool blocks from content
    const toolBlocks = (msg.content as ContentBlock[]).filter(
      (b): b is ContentBlock & { type: 'tool' } => b.type === 'tool',
    );
    if (toolBlocks.length === 0) {
      continue;
    }

    // Collect tool_result ids from the messages immediately following
    const resultIds = new Set<string>();
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.role === 'user' && next.toolCallId) {
        resultIds.add(next.toolCallId);
      } else {
        break; // tool_results must be immediately after the assistant message
      }
    }

    // Inject missing tool_results
    for (const tc of toolBlocks) {
      if (!resultIds.has(tc.id)) {
        result.push({
          role: 'user',
          content: 'Error: tool result lost (session recovered)',
          toolCallId: tc.id,
          isToolError: true,
        });
      }
    }
  }

  return result;
}

export function saveSession(state: AgentState): void {
  try {
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify({ messages: state.messages }, null, 2),
      'utf-8',
    );
    log.info('Session saved', { messageCount: state.messages.length });
  } catch (err: any) {
    log.warn('Session save failed', { error: err.message });
  }
}

export function clearSession(state: AgentState): void {
  state.messages = [];
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // File may not exist — that's fine
  }
}
