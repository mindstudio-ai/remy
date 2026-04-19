/**
 * Resolve @@automated:: action sentinels into interpolated prompts.
 *
 * The client sends `@@automated::triggerName@@{"key":"value"}` and this
 * module loads the matching .md file, strips frontmatter, interpolates
 * {{key}} placeholders, and returns the resolved message with the
 * sentinel prefix preserved for frontend identification.
 */

import { readAsset } from '../assets.js';
import { parseSentinel, automatedMessage } from './sentinel.js';

/** Sentinels that use the @@automated:: prefix but are not action files. */
const NON_ACTION_SENTINELS = new Set(['background_results']);

export interface ResolvedAction {
  message: string;
  /** Name of the next automated action to queue after this turn completes. */
  next?: string;
}

/**
 * If `text` is an @@automated:: sentinel that maps to an action file,
 * load the prompt, interpolate params, and return the resolved message.
 * Returns null if the text is not an action sentinel.
 */
export function resolveAction(text: string): ResolvedAction | null {
  const parsed = parseSentinel(text);
  if (!parsed) {
    return null;
  }

  const { name: triggerName, remainder } = parsed;
  if (NON_ACTION_SENTINELS.has(triggerName)) {
    return null;
  }

  // Parse optional JSON params from the first line after @@
  let params: Record<string, unknown> = {};
  if (remainder) {
    try {
      params = JSON.parse(remainder.split('\n')[0]);
    } catch {}
  }

  // Load asset and extract 'next' from frontmatter before stripping
  let body = readAsset('automatedActions', `${triggerName}.md`);
  let next: string | undefined;
  const fmMatch = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nextMatch = fmMatch[1].match(/^\s*next:\s*(\w+)\s*$/m);
    if (nextMatch) {
      next = nextMatch[1];
    }
  }
  body = body.replace(/^---[\s\S]*?---\s*/, '');

  // Interpolate {{key}} placeholders
  for (const [key, value] of Object.entries(params)) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    body = body.replaceAll(`{{${key}}}`, str);
  }

  return {
    message: automatedMessage(triggerName, body),
    next,
  };
}
