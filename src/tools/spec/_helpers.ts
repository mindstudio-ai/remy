/**
 * Spec helpers — path validation and frontmatter protection for spec tools.
 */

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
 * Extract the leading YAML frontmatter block (`--- … ---`) if present and
 * well-formed. Returns the block text (including both fences) or null when
 * there's no opening `---` on the first line, or no closing `---`.
 *
 * Used to protect required MSFM frontmatter (e.g. `name`) from being removed
 * or malformed by an edit — editSpec refuses a write that would turn a
 * well-formed block into none.
 */
export function extractFrontmatter(content: string): string | null {
  const lines = content.split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return null;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(0, i + 1).join('\n');
    }
  }
  return null; // opened but never closed — not a well-formed block
}
