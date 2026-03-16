/**
 * Shared helpers for the editFile tool.
 *
 * Provides occurrence finding (with line numbers), whitespace-flexible
 * fallback matching, error formatting, and string replacement by index.
 */

export interface Occurrence {
  /** Character offset in the full file content. */
  index: number;
  /** 1-based line number where the match starts. */
  line: number;
}

export interface FlexibleResult extends Occurrence {
  /** The original text from the file (preserving actual whitespace). */
  matchedText: string;
}

/**
 * Build a table mapping each line (0-based) to its starting character offset.
 */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Convert a character offset to a 1-based line number using a line-offset table.
 */
function lineAtOffset(offsets: number[], charIndex: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= charIndex) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1; // 1-based
}

/**
 * Find all exact occurrences of `searchString` in `content`.
 * Returns each match's character offset and 1-based line number.
 */
export function findOccurrences(
  content: string,
  searchString: string,
): Occurrence[] {
  if (!searchString) {
    return [];
  }

  const offsets = buildLineOffsets(content);
  const results: Occurrence[] = [];
  let pos = 0;

  while (pos <= content.length - searchString.length) {
    const idx = content.indexOf(searchString, pos);
    if (idx === -1) {
      break;
    }
    results.push({ index: idx, line: lineAtOffset(offsets, idx) });
    pos = idx + 1;
  }

  return results;
}

/**
 * Attempt a whitespace-flexible match when exact matching finds nothing.
 *
 * Compares lines with leading whitespace stripped (`.trimStart()`).
 * Returns the original file text at the match location if exactly one
 * match is found; null otherwise.
 */
export function flexibleMatch(
  content: string,
  searchString: string,
): FlexibleResult | null {
  const contentLines = content.split('\n');
  const searchLines = searchString.split('\n').map((l) => l.trimStart());

  if (searchLines.length === 0) {
    return null;
  }

  const matches: number[] = []; // 0-based start line indices

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (contentLines[i + j].trimStart() !== searchLines[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      matches.push(i);
    }
  }

  if (matches.length !== 1) {
    return null;
  }

  const startIdx = matches[0];
  const matchedText = contentLines
    .slice(startIdx, startIdx + searchLines.length)
    .join('\n');

  const offsets = buildLineOffsets(content);

  return {
    matchedText,
    index: offsets[startIdx],
    line: startIdx + 1, // 1-based
  };
}

/**
 * Replace a substring at a specific character index.
 */
export function replaceAt(
  content: string,
  index: number,
  oldLength: number,
  newString: string,
): string {
  return content.slice(0, index) + newString + content.slice(index + oldLength);
}

/**
 * Format a helpful error message when old_string matches multiple times.
 */
export function formatOccurrenceError(
  count: number,
  lines: number[],
  filePath: string,
): string {
  return `old_string found ${count} times in ${filePath} (at lines ${lines.join(', ')}) — must be unique. Include more surrounding context to disambiguate, or use replace_all to replace every occurrence.`;
}
