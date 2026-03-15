/**
 * Shared helpers for editFile and multiEdit tools.
 *
 * Provides occurrence finding (with line numbers), whitespace-flexible
 * fallback matching, and error formatting.
 */

export interface Occurrence {
  /** Character offset in the full file content. */
  index: number;
  /** 1-based line number where the match starts. */
  line: number;
}

export interface FlexibleResult {
  /** The original text from the file (preserving actual whitespace). */
  matchedText: string;
  /** Character offset in the full file content. */
  index: number;
  /** 1-based line number where the match starts. */
  line: number;
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
 * Find all exact occurrences of `searchString` in `content`, optionally
 * restricted to a line range (1-based, inclusive).
 */
export function findOccurrences(
  content: string,
  searchString: string,
  startLine?: number,
  endLine?: number,
): Occurrence[] {
  if (!searchString) {
    return [];
  }

  const offsets = buildLineOffsets(content);
  const totalLines = offsets.length;

  // Compute character range from line range
  const sLine = Math.max(1, startLine ?? 1);
  const eLine = Math.min(totalLines, endLine ?? totalLines);
  const rangeStart = offsets[sLine - 1]; // char offset of start of sLine
  const rangeEnd = eLine < totalLines ? offsets[eLine] : content.length; // char after end of eLine

  const results: Occurrence[] = [];
  let pos = rangeStart;

  while (pos <= rangeEnd - searchString.length) {
    const idx = content.indexOf(searchString, pos);
    if (idx === -1 || idx + searchString.length > rangeEnd) {
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
  startLine?: number,
  endLine?: number,
): FlexibleResult | null {
  const contentLines = content.split('\n');
  const searchLines = searchString.split('\n').map((l) => l.trimStart());
  const totalLines = contentLines.length;

  if (searchLines.length === 0) {
    return null;
  }

  const sLine = Math.max(1, startLine ?? 1);
  const eLine = Math.min(totalLines, endLine ?? totalLines);

  // 0-based indices for iteration
  const rangeStart = sLine - 1;
  const rangeEnd = eLine - 1;

  const matches: number[] = []; // 0-based start line indices

  for (let i = rangeStart; i <= rangeEnd - searchLines.length + 1; i++) {
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

  // Compute character offset of the matched start line
  let charOffset = 0;
  for (let i = 0; i < startIdx; i++) {
    charOffset += contentLines[i].length + 1; // +1 for \n
  }

  return {
    matchedText,
    index: charOffset,
    line: startIdx + 1, // 1-based
  };
}

/**
 * Format a helpful error message when old_string matches multiple times.
 */
export function formatOccurrenceError(
  count: number,
  lines: number[],
  filePath: string,
): string {
  return `old_string found ${count} times in ${filePath} (at lines ${lines.join(', ')}) — must be unique. Include more surrounding context, or use start_line/end_line to target a specific occurrence.`;
}
