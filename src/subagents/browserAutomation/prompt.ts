/**
 * System prompt for the browser automation sub-agent.
 * Loads prompt.md and injects the app spec for context.
 */

import fs from 'node:fs';
import { readAsset } from '../../assets.js';

const BASE_PROMPT = readAsset('subagents/browserAutomation', 'prompt.md');

/** Build the browser automation prompt with app context. */
export function getBrowserAutomationPrompt(): string {
  // Inject app.md so the test agent understands what the app is about
  try {
    const appSpec = fs.readFileSync('src/app.md', 'utf-8').trim();
    return `${BASE_PROMPT}\n\n<!-- cache_breakpoint -->\n\n<app_context>\n${appSpec}\n</app_context>`;
  } catch {
    return BASE_PROMPT;
  }
}
