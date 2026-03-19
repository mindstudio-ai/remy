/**
 * Minimal unified diff generator for edit tool results.
 *
 * Takes old and new text, finds the line-level changes, and formats
 * them as a compact unified diff with context lines.
 */

const CONTEXT_LINES = 3;

export function unifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
): string {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  // Find the first and last differing lines
  let firstDiff = 0;
  while (
    firstDiff < oldLines.length &&
    firstDiff < newLines.length &&
    oldLines[firstDiff] === newLines[firstDiff]
  ) {
    firstDiff++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (
    oldEnd > firstDiff &&
    newEnd > firstDiff &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  // Context boundaries
  const ctxStart = Math.max(0, firstDiff - CONTEXT_LINES);
  const ctxOldEnd = Math.min(oldLines.length - 1, oldEnd + CONTEXT_LINES);
  const ctxNewEnd = Math.min(newLines.length - 1, newEnd + CONTEXT_LINES);

  const lines: string[] = [];
  lines.push(`--- ${filePath}`);
  lines.push(`+++ ${filePath}`);
  lines.push(
    `@@ -${ctxStart + 1},${ctxOldEnd - ctxStart + 1} +${ctxStart + 1},${ctxNewEnd - ctxStart + 1} @@`,
  );

  // Leading context
  for (let i = ctxStart; i < firstDiff; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  // Removed lines
  for (let i = firstDiff; i <= oldEnd; i++) {
    lines.push(`-${oldLines[i]}`);
  }

  // Added lines
  for (let i = firstDiff; i <= newEnd; i++) {
    lines.push(`+${newLines[i]}`);
  }

  // Trailing context
  for (let i = oldEnd + 1; i <= ctxOldEnd; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  return lines.join('\n');
}
