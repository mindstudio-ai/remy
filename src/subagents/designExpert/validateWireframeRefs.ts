/**
 * Result validator for the design expert: every wireframe reference in the
 * final response must point at a file that exists on disk.
 *
 * Disk existence is the invariant — not "called createWireframe this run" —
 * because references to wireframes authored in earlier consults are
 * legitimate exactly when the file exists, and a stat also catches typo'd
 * and stale slugs. This is the mechanical backstop for the failure mode
 * documented in tools/createWireframe.ts: the resumed transcript carries
 * prior receipts, and a long consult can pattern-complete reference lines
 * instead of doing the work (RPT-1191 shipped three references and zero
 * files that way).
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../projectRoot.js';

// Path grammar mirrors createWireframe's WIREFRAMES_DIR + SLUG_RE.
const WIREFRAME_REF_RE = /src\/\.wireframes\/[a-z0-9][a-z0-9-]*\.html/g;

export async function validateWireframeRefs(
  text: string,
): Promise<string | null> {
  const refs = [...new Set(text.match(WIREFRAME_REF_RE) ?? [])];
  if (refs.length === 0) {
    return null;
  }

  const missing: string[] = [];
  for (const ref of refs) {
    const exists = await stat(join(PROJECT_ROOT, ref)).then(
      (s) => s.isFile(),
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
    `Your response references wireframe files that do not exist on disk:`,
    ...missing.map((p) => `- ${p}`),
    ``,
    `A wireframe reference is only valid as a receipt handed back by a createWireframe result — that tool is the only way a wireframe comes to exist. A reference composed in prose points at nothing and renders as a dead preview.`,
    ``,
    `For each missing path, either author that wireframe now with createWireframe (use the matching slug so the path is identical) or remove the reference. Then send your complete final response again from the top — it fully replaces your previous response, so include everything, not just the fixes.`,
  ].join('\n');
}
