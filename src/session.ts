/**
 * Session persistence — saves/loads conversation history to a file.
 *
 * Writes .remy-session.json in the working directory after each turn.
 * On boot, loads existing session if present, giving the agent full
 * context of prior work. Delete the file to start fresh.
 */

import fs from 'node:fs';
import type { Message } from './api.js';
import type { AgentState } from './agent.js';

const SESSION_FILE = '.remy-session.json';

export function loadSession(state: AgentState): boolean {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      state.messages = data.messages as Message[];
      return true;
    }
  } catch {
    // No session file or invalid — start fresh
  }
  return false;
}

export function saveSession(state: AgentState): void {
  try {
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify({ messages: state.messages }, null, 2),
      'utf-8',
    );
  } catch {
    // Best-effort — don't crash if we can't write
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
