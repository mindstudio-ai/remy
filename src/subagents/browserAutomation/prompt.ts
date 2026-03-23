/**
 * System prompt for the browser automation sub-agent.
 * Loads prompt.md and injects the app spec for context.
 */

import fs from 'node:fs';
import path from 'node:path';

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

const local = path.join(base, 'prompt.md');
const PROMPT_PATH = fs.existsSync(local)
  ? local
  : path.join(base, 'subagents', 'browserAutomation', 'prompt.md');

const BASE_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8').trim();

/** Build the browser automation prompt with app context. */
export function getBrowserAutomationPrompt(): string {
  // Inject app.md so the test agent understands what the app is about
  try {
    const appSpec = fs.readFileSync('src/app.md', 'utf-8').trim();
    return `${BASE_PROMPT}\n\n<app_context>\n${appSpec}\n</app_context>`;
  } catch {
    return BASE_PROMPT;
  }
}
