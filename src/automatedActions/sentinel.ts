/**
 * Automated message sentinel format + builders.
 *
 * User messages whose content starts with `@@automated::<name>@@` are
 * treated as automated actions (triggered by the sandbox or chained
 * internally). This module is the single source of truth for the
 * sentinel format — parsing, building, stripping.
 *
 * Shape:
 *   @@automated::<name>@@[optional JSON params on first line]
 *   <body>
 */

/** Bare sentinel: `@@automated::<name>@@` (no body). Used as pendingNextMessage. */
export function sentinel(name: string): string {
  return `@@automated::${name}@@`;
}

/** Full automated message: sentinel + optional body. */
export function automatedMessage(name: string, body?: string): string {
  return body ? `${sentinel(name)}\n${body}` : sentinel(name);
}

/** True if `text` is an automated message with the given trigger name. */
export function hasSentinel(text: string, name: string): boolean {
  return text.startsWith(sentinel(name));
}

/** True if `text` is any automated message (regardless of trigger name). */
export function isAutomatedMessage(text: string): boolean {
  return text.startsWith('@@automated::');
}

/**
 * Extract the trigger name and remainder from an automated message.
 * Returns null if the text is not a sentinel.
 * The remainder includes any params on the first line plus the body.
 */
export function parseSentinel(
  text: string,
): { name: string; remainder: string } | null {
  const match = text.match(/^@@automated::(\w+)@@(.*)/s);
  if (!match) {
    return null;
  }
  return { name: match[1], remainder: match[2] };
}

/**
 * Strip the leading `@@automated::<name>@@[params]\n` line from a message,
 * leaving the body. Used by cleanMessagesForApi before sending to the LLM.
 */
export function stripSentinelLine(text: string): string {
  return text.replace(/^@@automated::[^@]*@@[^\n]*\n?/, '');
}

/**
 * Build a synthetic `@@automated::background_results@@` message carrying
 * the results of one or more background sub-agent tools. The LLM sees
 * these results as tool_result blocks wrapped in a `<background_results>`
 * envelope.
 */
export function buildBackgroundResultsMessage(
  results: Array<{ toolCallId: string; name: string; result: string }>,
): string {
  const xml = results
    .map(
      (r) =>
        `<tool_result id="${r.toolCallId}" name="${r.name}">\n${r.result}\n</tool_result>`,
    )
    .join('\n\n');
  const plural = results.length > 1 ? 's' : '';
  const body =
    `This is an automated message containing the result${plural} of ${results.length > 1 ? 'tool calls' : 'a tool call'} that ${results.length > 1 ? 'have' : 'has'} been working in the background. This is not a direct message from the user.\n` +
    `<background_results>\n${xml}\n</background_results>`;
  return automatedMessage('background_results', body);
}

/**
 * Merge one or more `@@automated::background_results@@` messages into a
 * single combined message. Extracts the `<tool_result>` blocks from each
 * input and wraps them in a single `<background_results>` envelope.
 * When given a single input, returns an equivalent single-result message.
 */
export function mergeBackgroundResultsMessages(messages: string[]): string {
  const results: Array<{ toolCallId: string; name: string; result: string }> =
    [];
  const toolRe =
    /<tool_result id="([^"]+)" name="([^"]+)">\n([\s\S]*?)\n<\/tool_result>/g;
  for (const msg of messages) {
    for (const m of msg.matchAll(toolRe)) {
      results.push({ toolCallId: m[1], name: m[2], result: m[3] });
    }
  }
  return buildBackgroundResultsMessage(results);
}
