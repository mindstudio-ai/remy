/**
 * Resolve @@automated:: action sentinels into interpolated prompts.
 *
 * The client sends `@@automated::triggerName@@{"key":"value"}` and this
 * module loads the matching .md file, strips frontmatter, interpolates
 * {{key}} placeholders, and returns the resolved message with the
 * sentinel prefix preserved for frontend identification.
 */

import { readAsset } from '../assets.js';

/** Sentinels that use the @@automated:: prefix but are not action files. */
const NON_ACTION_SENTINELS = new Set(['background_results']);

/**
 * If `text` is an @@automated:: sentinel that maps to an action file,
 * load the prompt, interpolate params, and return the resolved message.
 * Returns null if the text is not an action sentinel.
 */
export function resolveAction(text: string): string | null {
  const match = text.match(/^@@automated::(\w+)@@(.*)/s);
  if (!match) {
    return null;
  }

  const triggerName = match[1];
  if (NON_ACTION_SENTINELS.has(triggerName)) {
    return null;
  }

  // Parse optional JSON params from the first line after @@
  let params: Record<string, unknown> = {};
  const remainder = match[2];
  if (remainder) {
    try {
      params = JSON.parse(remainder.split('\n')[0]);
    } catch {}
  }

  // Load and strip frontmatter
  let body = readAsset('automatedActions', `${triggerName}.md`);
  body = body.replace(/^---[\s\S]*?---\s*/, '');

  // Interpolate {{key}} placeholders
  for (const [key, value] of Object.entries(params)) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    body = body.replaceAll(`{{${key}}}`, str);
  }

  return `@@automated::${triggerName}@@\n${body}`;
}
