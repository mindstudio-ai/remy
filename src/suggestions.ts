/**
 * The `[label](suggest:message)` protocol — parsed here and nowhere else.
 *
 * Remy writes suggestion chips as markdown links (see the Style section of
 * prompt/static/instructions.md). The frontend renders the label as a tappable
 * chip above the composer and sends the payload as the user's next message.
 *
 * This is the single implementation of that syntax. It runs where the text is
 * produced, so every consumer — the editor, the TUI, a future client — reads a
 * structured field instead of re-deriving one from prose. The links stay in the
 * model-facing text; only the *display* copy has them removed.
 *
 * Note the scanner: labels and payloads are single-line, and a payload's
 * parentheses are balanced rather than pattern-matched, so a message like
 * "skip it (no activity in 7+ days)" survives.
 */

import type { ContentBlock, Suggestion } from './api.js';

/** Cheap pre-check — the marker any suggest link must contain. Exported so
 * callers can skip the parse on text that obviously has no chips. */
export const SUGGEST_MARKER = '](suggest:';

/** Punctuation Remy uses to separate a run of chips from each other. */
const SEPARATORS = '\\s·|,\\-–—';
const SEPARATORS_ONLY = new RegExp(`^[${SEPARATORS}]*$`);
const TRAILING_SEPARATORS = new RegExp(`[${SEPARATORS}]+$`);

/** A bullet or ordered-list marker, which is left orphaned when the only thing
 * on the line was a chip. */
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** ``` or ~~~ opening/closing a fenced block (up to three leading spaces). */
const FENCE = /^ {0,3}(?:```|~~~)/;

interface LinkMatch {
  start: number;
  end: number;
  label: string;
  message: string;
  /** The chip stands on its own — nothing but separators and other standalone
   * chips follow it on the line. Standalone chips leave the prose; an inline
   * one keeps its label so the sentence still reads. */
  standalone: boolean;
}

/**
 * Find every suggest link on one line, skipping inline code spans so that
 * documenting the syntax in chat doesn't mint a phantom chip.
 */
function findLinks(line: string): LinkMatch[] {
  const found: LinkMatch[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '\\') {
      i += 2;
      continue;
    }

    // Inline code span: skip to the matching backtick run. An unclosed run
    // ends the scan — mid-stream that is a code span the model is still
    // writing, and treating its contents as prose would mint a chip out of
    // documentation that is about to be fenced off.
    if (ch === '`') {
      let runEnd = i;
      while (runEnd < line.length && line[runEnd] === '`') {
        runEnd++;
      }
      const fence = line.slice(i, runEnd);
      const close = line.indexOf(fence, runEnd);
      if (close === -1) {
        break;
      }
      i = close + fence.length;
      continue;
    }

    if (ch !== '[') {
      i++;
      continue;
    }

    const labelEnd = line.indexOf(']', i + 1);
    if (labelEnd === -1) {
      break;
    }
    if (!line.startsWith(SUGGEST_MARKER, labelEnd)) {
      // Some other link — resume after its label rather than rescanning it.
      i = labelEnd + 1;
      continue;
    }

    // Balance the payload's parens so a message may contain them.
    let depth = 1;
    let p = labelEnd + SUGGEST_MARKER.length;
    while (p < line.length && depth > 0) {
      if (line[p] === '(') {
        depth++;
      } else if (line[p] === ')') {
        depth--;
      }
      p++;
    }
    if (depth > 0) {
      // Unterminated — the model is still writing it, or it's malformed.
      break;
    }

    found.push({
      start: i,
      end: p,
      label: line.slice(i + 1, labelEnd).trim(),
      message: line.slice(labelEnd + SUGGEST_MARKER.length, p - 1).trim(),
      standalone: false,
    });
    i = p;
  }

  return found;
}

/**
 * Classify each match on a line, walking right to left: the run at the end of
 * the line is standalone, and the first thing that isn't a separator or another
 * standalone chip makes everything to its left inline.
 */
function classify(line: string, matches: LinkMatch[]): void {
  let tailClean = SEPARATORS_ONLY.test(
    line.slice(matches[matches.length - 1].end),
  );
  for (let i = matches.length - 1; i >= 0; i--) {
    matches[i].standalone = tailClean;
    if (!tailClean) {
      continue;
    }
    const gap = i > 0 ? line.slice(matches[i - 1].end, matches[i].start) : '';
    tailClean = SEPARATORS_ONLY.test(gap);
  }
}

/**
 * Chip labels read as standalone UI, but an inline link's label is written as
 * part of a sentence and arrives lowercase. Uppercase the first letter for the
 * chip only — the prose keeps the original label so the sentence still reads.
 * First-letter-only, never title-case (which mangled proper nouns mid-label),
 * and a label opening with a code span is left alone.
 */
function chipCase(label: string): string {
  if (label.startsWith('`')) {
    return label;
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Split a block of assistant text into the copy to render and the chips it
 * offers.
 *
 * Returns `raw` untouched when there are no suggest links, so callers can
 * treat an unchanged `text` as "nothing to annotate".
 */
export function parseSuggestions(raw: string): {
  text: string;
  suggestions: Suggestion[];
} {
  if (!raw.includes(SUGGEST_MARKER)) {
    return { text: raw, suggestions: [] };
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  const outLines: string[] = [];
  let inFence = false;
  let droppedLine = false;

  for (const line of raw.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    if (inFence) {
      outLines.push(line);
      continue;
    }

    const matches = findLinks(line);
    if (matches.length === 0) {
      outLines.push(line);
      continue;
    }
    classify(line, matches);

    for (const m of matches) {
      const key = `${m.label}::${m.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({ label: chipCase(m.label), message: m.message });
      }
    }

    let rebuilt = '';
    let cursor = 0;
    for (const m of matches) {
      rebuilt += line.slice(cursor, m.start);
      if (!m.standalone) {
        rebuilt += m.label;
      }
      cursor = m.end;
    }
    rebuilt += line.slice(cursor);

    if (matches.some((m) => m.standalone)) {
      // A line that held nothing but chips goes entirely, along with the list
      // marker that would otherwise render as an empty bullet.
      if (SEPARATORS_ONLY.test(rebuilt.replace(LIST_MARKER, ''))) {
        droppedLine = true;
        continue;
      }
      // Prose followed by a chip run: drop the punctuation that introduced it.
      rebuilt = rebuilt.replace(TRAILING_SEPARATORS, '');
    }

    outLines.push(rebuilt);
  }

  let text = outLines.join('\n').replace(/\s+$/, '');
  if (droppedLine) {
    text = text.replace(/\n{3,}/g, '\n\n');
  }

  return { text, suggestions };
}

/**
 * Stamp `displayText` and `suggestions` onto the text blocks of an assistant
 * message, in place, right before it is recorded in history.
 *
 * `text` is deliberately left alone: it's what cleanMessagesForApi sends back
 * to the model, so Remy can still answer "the second one" about options that
 * only ever appeared on chips.
 */
export function annotateSuggestions(blocks: ContentBlock[]): void {
  for (const block of blocks) {
    if (block.type !== 'text' || !block.text.includes(SUGGEST_MARKER)) {
      continue;
    }
    const { text, suggestions } = parseSuggestions(block.text);
    if (suggestions.length === 0) {
      continue;
    }
    block.displayText = text;
    block.suggestions = suggestions;
  }
}
