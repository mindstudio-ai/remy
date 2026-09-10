/**
 * Per-call repetition guard for the streaming LLM loop.
 *
 * Some models — Gemini Flash at a high thinking level most reliably (RPT-1225),
 * but the failure isn't vendor-specific — fall into a reasoning loop: they
 * restate the same paragraph under rotating headers, or degenerate into a
 * repeated short run, and keep going until the output budget is gone (minutes
 * of wall-clock and tens of thousands of billed thinking tokens for nothing).
 *
 * This is a deterministic harness backstop, independent of the model and of
 * whether the provider ever emits a `repetition` stop reason. `feed` it the
 * streamed thinking/text as it arrives; when it recognizes a loop it returns a
 * signal so the caller can abort the in-flight call and nudge, instead of
 * waiting for the budget to drain. One detector instance per LLM call.
 *
 * Two independent detectors, matched to the two shapes seen in the wild:
 *  - Paragraph: the same body paragraph repeated across a response. Header-only
 *    lines (`**Refining …**`) are ignored because they rotate while the body
 *    underneath repeats verbatim.
 *  - Rolling chunk: a short fragment repeated back-to-back (single-line
 *    degeneration like "!!!!" or a repeated phrase with no paragraph breaks) —
 *    a gemini-cli-style fallback over a bounded window.
 *
 * Thresholds are deliberately forgiving: legitimate iterative work restates
 * intent a few times, so we only fire well past what real reasoning produces.
 */

/** A minimum-length paragraph must repeat this many times to count as a loop. */
const PARAGRAPH_REPEAT_THRESHOLD = 6;
/** Ignore paragraphs shorter than this — short lines repeat innocently. */
const MIN_PARAGRAPH_CHARS = 80;

/** Fixed-width slice for the rolling-chunk detector. */
const CHUNK_SIZE = 60;
/** Only the last N chars are considered for chunk repetition. */
const CHUNK_WINDOW = 5000;
/** How many times the trailing chunk must recur within the window to fire. */
const CHUNK_REPEAT_THRESHOLD = 10;

export interface RepetitionSignal {
  kind: 'paragraph' | 'chunk';
  /** How many repetitions were observed when the guard fired. */
  repeats: number;
  /** A short, log-safe excerpt of the repeating content. */
  sample: string;
}

const LONE_HEADER = /^\*{1,3}[^*].*\*{1,3}$/;

function normalizeParagraph(seg: string): string | null {
  const trimmed = seg.trim();
  // A markdown header on its own (the part that rotates) carries no signal.
  if (!trimmed || LONE_HEADER.test(trimmed)) {
    return null;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (key.length < MIN_PARAGRAPH_CHARS) {
    return null;
  }
  return key;
}

export class RepetitionDetector {
  // Paragraph detector: incomplete tail awaiting its closing blank line, plus
  // occurrence counts of completed, normalized paragraphs.
  private paragraphBuffer = '';
  private paragraphCounts = new Map<string, number>();

  // Rolling-chunk detector: the trailing window of raw fed text.
  private window = '';

  private fired = false;

  /**
   * Feed the next streamed text fragment. Returns a signal the first time a
   * loop is recognized, then null forever after (the caller aborts on the
   * first signal; further feeds are harmless no-ops).
   */
  feed(text: string): RepetitionSignal | null {
    if (this.fired || !text) {
      return null;
    }
    return this.feedParagraphs(text) ?? this.feedChunks(text);
  }

  private feedParagraphs(text: string): RepetitionSignal | null {
    this.paragraphBuffer += text;
    // Split on blank lines; the final segment may be incomplete, so it stays
    // buffered until its terminating blank line arrives.
    const segments = this.paragraphBuffer.split(/\n\s*\n/);
    this.paragraphBuffer = segments.pop() ?? '';

    for (const seg of segments) {
      const key = normalizeParagraph(seg);
      if (!key) {
        continue;
      }
      const count = (this.paragraphCounts.get(key) ?? 0) + 1;
      this.paragraphCounts.set(key, count);
      if (count >= PARAGRAPH_REPEAT_THRESHOLD) {
        this.fired = true;
        return {
          kind: 'paragraph',
          repeats: count,
          sample: seg.trim().slice(0, 160),
        };
      }
    }
    return null;
  }

  private feedChunks(text: string): RepetitionSignal | null {
    this.window = (this.window + text).slice(-CHUNK_WINDOW);
    if (this.window.length < CHUNK_SIZE * CHUNK_REPEAT_THRESHOLD) {
      return null;
    }
    // The most recent CHUNK_SIZE chars: if this exact fragment recurs many
    // times across the window, the stream is cycling on it.
    const tail = this.window.slice(-CHUNK_SIZE);
    if (!tail.trim()) {
      return null;
    }
    const occurrences = this.window.split(tail).length - 1;
    if (occurrences >= CHUNK_REPEAT_THRESHOLD) {
      this.fired = true;
      return {
        kind: 'chunk',
        repeats: occurrences,
        sample: tail.replace(/\s+/g, ' ').trim().slice(0, 160),
      };
    }
    return null;
  }
}
