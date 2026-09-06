/**
 * Result validator for the existing-project reviewer: every backtick-quoted
 * `src/.user-uploads/...` path in the review must exist on disk, as a file
 * or a directory.
 *
 * The review's value is that the main agent can hand those paths to the user
 * and to later build steps, so a path composed in prose that points at
 * nothing is the failure mode worth a mechanical check. Only backtick-quoted
 * paths are checked: uploads routinely contain spaces, and the prompt asks
 * for every path to be quoted for exactly this reason.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../projectRoot.js';

const UPLOAD_REF_RE = /`(src\/\.user-uploads\/[^`\n]+?)\/?`/g;

export async function validateUploadPaths(
  text: string,
): Promise<string | null> {
  const refs = new Set<string>();
  for (const m of text.matchAll(UPLOAD_REF_RE)) {
    refs.add(m[1]);
  }
  if (refs.size === 0) {
    return null;
  }

  const missing: string[] = [];
  for (const ref of refs) {
    const exists = await stat(join(PROJECT_ROOT, ref)).then(
      () => true,
      () => false,
    );
    if (!exists) {
      missing.push(ref);
    }
  }
  if (missing.length === 0) {
    return null;
  }

  return [
    `Your review cites paths under src/.user-uploads/ that do not exist on disk:`,
    ...missing.map((p) => `- ${p}`),
    ``,
    `Check the real location with listDir — the trimmed tree may have landed under a different name, or the original archive may already have been deleted — and correct or remove each path. Then send your complete review again from the top — it fully replaces your previous response, so include everything, not just the fixes.`,
  ].join('\n');
}
