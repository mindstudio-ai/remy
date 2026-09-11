/**
 * Resolve @@automated:: action sentinels into interpolated prompts.
 *
 * The client sends `@@automated::triggerName@@{"key":"value"}` and this
 * module loads the matching .md file, strips frontmatter, interpolates
 * {{key}} placeholders, and returns the resolved message with the
 * sentinel prefix preserved for frontend identification.
 */

import { readAsset } from '../assets.js';
import {
  parseSentinel,
  automatedMessage,
  sentinelParams,
  setSentinelParams,
} from './sentinel.js';

/** Sentinels that use the @@automated:: prefix but are not action files. */
export const NON_ACTION_SENTINELS = new Set([
  'background_results',
  'workspace_status',
]);

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

  const { name: triggerName } = parsed;
  if (NON_ACTION_SENTINELS.has(triggerName)) {
    return null;
  }

  // Optional JSON params from the sentinel line.
  const params = sentinelParams(text);

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

  // A step that was interrupted and re-queued is a RESUMPTION, not a replay.
  // Its body was written for a first run ("The spec is written. Build
  // everything now") and is a lie the second time around — which is how a
  // stopped-then-continued build ended up rebuilding an app it had just
  // finished. The preamble goes in the body because that is the only part the
  // model sees: cleanMessagesForApi strips the sentinel line, params and all.
  const resumed = params.resumed === true;
  if (resumed) {
    body = `${readAsset('automatedActions', '_resumed.md')}\n\n${body}`;
  }

  // `resumed` is the one param carried onto the emitted message. History is
  // what the transcript renders from, and both the chat row and the queue card
  // label a resumed step off this marker — without it, a resumed step is
  // indistinguishable from a duplicate. Every other param stays behind: the
  // model never sees the sentinel line, so copying a whole annotated-notes or
  // seed payload into the conversation would be dead weight.
  return {
    message: resumed
      ? setSentinelParams(automatedMessage(triggerName, body), {
          resumed: true,
        })
      : automatedMessage(triggerName, body),
    next,
  };
}

/**
 * Walk the static `next:` chain from `startName` (inclusive), returning the
 * ordered trigger names. Reads frontmatter only; guards against cycles and
 * stops if an action file is missing.
 */
export function getActionChain(startName: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let name: string | undefined = startName;
  while (name && !seen.has(name)) {
    seen.add(name);
    chain.push(name);
    let body: string;
    try {
      body = readAsset('automatedActions', `${name}.md`);
    } catch {
      break;
    }
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---/);
    name = fm?.[1].match(/^\s*next:\s*(\w+)\s*$/m)?.[1];
  }
  return chain;
}
