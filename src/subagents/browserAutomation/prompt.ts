/**
 * System prompt for the browser automation sub-agent.
 * Loaded from prompt.md at module init.
 */

import fs from 'node:fs';
import path from 'node:path';

const PROMPT_PATH = path.join(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'prompt.md',
);

export const BROWSER_AUTOMATION_PROMPT = fs
  .readFileSync(PROMPT_PATH, 'utf-8')
  .trim();
