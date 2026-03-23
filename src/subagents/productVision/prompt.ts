/**
 * System prompt assembly for the product vision sub-agent.
 *
 * Loads the base prompt from prompt.md and injects the current spec
 * files and roadmap state as XML context.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSpecContext, loadRoadmapContext } from './executor.js';

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

const local = path.join(base, 'prompt.md');
const PROMPT_PATH = fs.existsSync(local)
  ? local
  : path.join(base, 'subagents', 'productVision', 'prompt.md');

const BASE_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8').trim();

/** Build the system prompt with current spec and roadmap context. */
export function getProductVisionPrompt(): string {
  const specContext = loadSpecContext();
  const roadmapContext = loadRoadmapContext();

  const parts = [BASE_PROMPT];
  if (specContext) {
    parts.push(specContext);
  }
  if (roadmapContext) {
    parts.push(roadmapContext);
  }

  return parts.join('\n\n');
}
