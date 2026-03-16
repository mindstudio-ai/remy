/**
 * Spec helpers — heading resolution and path validation for spec tools.
 *
 * Parses markdown heading hierarchy and resolves heading paths like
 * "Vendors > Approval Flow" to line ranges. Used by editSpec and
 * addAnnotation to address locations in MSFM spec files.
 */

export interface HeadingNode {
  /** Heading level: 1–6 (# = 1, ## = 2, etc.) */
  level: number;
  /** Heading text (trimmed, without # prefix) */
  text: string;
  /** 0-based line index of the heading line itself */
  startLine: number;
  /** 0-based line index of the first content line (startLine + 1) */
  contentStart: number;
  /** 0-based exclusive end line — up to next sibling-or-higher heading or EOF */
  contentEnd: number;
}

export interface ResolvedRange {
  /** 0-based line of the heading itself */
  startLine: number;
  /** 0-based line of first content line */
  contentStart: number;
  /** 0-based exclusive end line */
  contentEnd: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Parse markdown content into a flat list of headings with line ranges.
 *
 * Each heading's content extends from the line after it to the line
 * before the next heading of equal or higher level (lower number), or EOF.
 */
export function parseHeadings(content: string): HeadingNode[] {
  const lines = content.split('\n');
  const headings: HeadingNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        startLine: i,
        contentStart: i + 1,
        contentEnd: lines.length, // placeholder — resolved below
      });
    }
  }

  // Resolve contentEnd for each heading: extends until the next heading
  // of equal or higher level (lower number), or EOF.
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    let end = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= current.level) {
        end = headings[j].startLine;
        break;
      }
    }
    current.contentEnd = end;
  }

  return headings;
}

/**
 * Resolve a heading path like "Vendors > Approval Flow" to a line range.
 *
 * - Empty string → preamble (content before the first heading)
 * - Segments are matched case-insensitively
 * - Ambiguous matches (same text at same level) → first match wins
 * - Throws if heading not found (with available headings in the error)
 */
export function resolveHeadingPath(
  content: string,
  headingPath: string,
): ResolvedRange {
  const lines = content.split('\n');
  const headings = parseHeadings(content);

  // Empty string = preamble
  if (headingPath === '') {
    const firstHeadingLine =
      headings.length > 0 ? headings[0].startLine : lines.length;
    return {
      startLine: 0,
      contentStart: 0,
      contentEnd: firstHeadingLine,
    };
  }

  const segments = headingPath.split('>').map((s) => s.trim());

  // Walk segments, narrowing the search range each time
  let searchStart = 0;
  let searchEnd = lines.length;
  let resolved: HeadingNode | null = null;

  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si].toLowerCase();
    const candidates = headings.filter(
      (h) =>
        h.startLine >= searchStart &&
        h.startLine < searchEnd &&
        h.text.toLowerCase() === segment,
    );

    if (candidates.length === 0) {
      // List available headings in the search range for the error
      const available = headings
        .filter((h) => h.startLine >= searchStart && h.startLine < searchEnd)
        .map((h) => `${'#'.repeat(h.level)} ${h.text}`)
        .join('\n');

      const searchedPath = segments.slice(0, si + 1).join(' > ');
      throw new Error(
        `Heading not found: "${searchedPath}"\n\nAvailable headings:\n${available || '(none)'}`,
      );
    }

    // First match wins
    resolved = candidates[0];

    // Narrow search to within this heading's content for the next segment
    searchStart = resolved.contentStart;
    searchEnd = resolved.contentEnd;
  }

  return {
    startLine: resolved!.startLine,
    contentStart: resolved!.contentStart,
    contentEnd: resolved!.contentEnd,
  };
}

/**
 * Validate that a file path is within src/. Returns the path unchanged.
 * Throws if the path doesn't start with src/.
 */
export function validateSpecPath(filePath: string): string {
  if (!filePath.startsWith('src/')) {
    throw new Error(`Spec tool paths must start with src/. Got: "${filePath}"`);
  }
  return filePath;
}

/**
 * Format available headings as an indented tree string.
 * Used in error messages and for agent context.
 */
export function getHeadingTree(content: string): string {
  const headings = parseHeadings(content);
  if (headings.length === 0) {
    return '(no headings)';
  }
  return headings.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join('\n');
}
