/**
 * System prompt for the browser automation sub-agent.
 * Loaded from prompt.md at module init.
 */

import fs from 'node:fs';
import path from 'node:path';

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

// In source: base is src/subagents/browserAutomation/, prompt.md is adjacent.
// In bundle: base is dist/, prompt.md is at dist/subagents/browserAutomation/.
const local = path.join(base, 'prompt.md');
const PROMPT_PATH = fs.existsSync(local)
  ? local
  : path.join(base, 'subagents', 'browserAutomation', 'prompt.md');

export const BROWSER_AUTOMATION_PROMPT = fs
  .readFileSync(PROMPT_PATH, 'utf-8')
  .trim();
