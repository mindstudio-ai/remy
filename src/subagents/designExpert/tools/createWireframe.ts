/**
 * Create a wireframe artifact.
 *
 * The design expert authors wireframes but holds no filesystem write grant —
 * like generateImages, this tool is a capability that returns a reference.
 * The document (YAML frontmatter + self-contained HTML, the same grammar as
 * the legacy ```wireframe fence body) is written to `src/.wireframes/` — the
 * canonical copy, which persists with the draft and is what Remy reads while
 * building — and mirrored to the platform's private app-data bucket so the
 * dashboard can render a preview (it can't reach the sandbox disk).
 *
 * The caller chooses the slug (= the filename stem), and re-using a slug
 * overwrites the file and its mirror in place: a revision keeps the same path,
 * so references already written into specs stay current. The workflow is
 * call-first, like generateImages: the result hands back the exact markdown
 * reference line to paste, so a reference in prose is always a receipt for a
 * file that exists — never a promise to create one later. The reference
 * format and path pattern deliberately appear NOWHERE the design agent can
 * read — not in this description, not in the prompts — so this result is the
 * only place a valid-looking reference can come from. (A knowable format
 * invites writing references without calling: a 45K-token consultation once
 * shipped three such references and zero files, and prompts that spelled out
 * `![name](src/.wireframes/{slug}.html)` produced four fabricated receipts in
 * one run. Image generation never has this problem precisely because image
 * URLs are unguessable.) Known leak in that defense: consultations resume the
 * designer's prior transcript (getSubAgentHistory), so earlier results — and
 * with them the reference format — sit in context on every follow-up. A
 * revision consult once shipped two stale references plus one fabricated one
 * and zero tool calls that way, and a ~225K-token resumed consult later
 * shipped three fabricated references despite the receipt discipline in
 * ui-patterns.md ("every reference is a receipt from this response's work").
 * The mechanical backstop is validateWireframeRefs.ts, run via the sub-agent
 * runner's validateResult hook: every referenced path must exist on disk, or
 * the designer gets one corrective retry. The mirror upload is non-fatal — a
 * wireframe whose preview can't render is still fully usable by the
 * developer.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import { PROJECT_ROOT } from '../../../projectRoot.js';
import { createLogger } from '../../../logger.js';

const log = createLogger('createWireframe');

export const WIREFRAMES_DIR = 'src/.wireframes';

const UPLOAD_TIMEOUT_MS = 30_000;

export const definition: ToolDefinition = {
  name: 'createWireframe',
  description:
    'Generate a wireframe from self-contained HTML+CSS you author and write it to disk as a design artifact. This is how a wireframe comes to exist — the way generateImages is how an image comes to exist — and the developer builds from the file it creates. The result also hands back the reference line that embeds the wireframe in your response and in specs; paste it wherever the wireframe belongs and it renders as a live preview. Calling again with the same slug revises the wireframe in place, so existing references stay current — a revision is a call to this tool, never a prose description of changes to an earlier wireframe.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Short display name, e.g. "Feed Post Card". Becomes the caption.',
      },
      slug: {
        type: 'string',
        description:
          'Filename stem, lowercase kebab-case (e.g. "feed-post-card"). Re-use a slug to revise that wireframe in place.',
      },
      description: {
        type: 'string',
        description:
          'One line on what the wireframe shows — layout, states, motion.',
      },
      html: {
        type: 'string',
        description:
          'The complete HTML document (<html>…</html>), self-contained vanilla HTML/CSS/JS. Transparent body — the preview supplies the backdrop; style the component container instead. No frontmatter — it is added for you.',
      },
    },
    required: ['name', 'slug', 'description', 'html'],
  },
};

// Matches the platform mirror route's SLUG_RE — one grammar on both sides.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Frontmatter values are single-line; collapse whatever whitespace arrives. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Cheap shape checks mirroring the prompt's craft rules. Failures return an
 * error string so the agent loop self-corrects; softer issues come back as
 * notes on the success result instead.
 */
function validate(
  name: string,
  slug: string,
  html: string,
): { error?: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!name.trim()) {
    return { error: 'Error: name is required.', warnings };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      error:
        'Error: slug must be lowercase kebab-case ([a-z0-9-], starting with a letter or digit, ≤ 80 chars), e.g. "feed-post-card".',
      warnings,
    };
  }
  if (!html.trim()) {
    return { error: 'Error: html is required.', warnings };
  }
  if (/^\s*---/.test(html)) {
    return {
      error:
        'Error: html must not include frontmatter — pass name and description as parameters and the frontmatter is added for you.',
      warnings,
    };
  }
  if (/<img[\s>]/i.test(html)) {
    return {
      error:
        'Error: wireframes must not contain <img> tags. Use skeleton placeholders (grey boxes, gradients) instead of images.',
      warnings,
    };
  }
  if (!/<style[\s>]/i.test(html) && !/style=/i.test(html)) {
    return {
      error:
        'Error: no CSS found. Wireframes are self-contained HTML+CSS — style the component container (not the body) so it reads against the transparent background.',
      warnings,
    };
  }
  const lines = html.split('\n').length;
  if (lines > 120) {
    warnings.push(
      `The wireframe is ${lines} lines — past the ~100-line budget. Wireframes isolate one small piece; consider whether this is building too much.`,
    );
  }
  return { warnings };
}

/** Mirror the document to the platform so the dashboard can preview it. */
async function uploadMirror(
  context: ToolExecutionContext,
  slug: string,
  content: string,
): Promise<{ ok: boolean; note?: string }> {
  const { apiConfig } = context;
  if (!apiConfig?.appId) {
    return { ok: false, note: 'no app id in this session' };
  }
  try {
    const url = `${apiConfig.baseUrl}/_internal/v2/apps/${apiConfig.appId}/dev/wireframes`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({ slug, content }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, note: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, note: err.message };
  }
}

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  if (!context) {
    return 'Error: createWireframe requires execution context';
  }

  const name = String(input.name ?? '');
  const slug = String(input.slug ?? '');
  const description = String(input.description ?? '');
  const html = String(input.html ?? '');

  const { error, warnings } = validate(name, slug, html);
  if (error) {
    return error;
  }

  const relPath = `${WIREFRAMES_DIR}/${slug}.html`;
  const content = [
    '---',
    `name: ${singleLine(name)}`,
    `description: ${singleLine(description)}`,
    '---',
    html.trim(),
    '',
  ].join('\n');

  await mkdir(join(PROJECT_ROOT, WIREFRAMES_DIR), { recursive: true });
  const existed = await stat(join(PROJECT_ROOT, relPath)).then(
    () => true,
    () => false,
  );
  await writeFile(join(PROJECT_ROOT, relPath), content, 'utf8');

  onLog?.(`Wrote ${relPath}, mirroring for preview...`);
  const mirror = await uploadMirror(context, slug, content);
  if (!mirror.ok) {
    log.warn('Wireframe mirror upload failed', { slug, note: mirror.note });
  }

  const lines = [
    `${existed ? 'Revised' : 'Created'} wireframe "${singleLine(name)}" at ${relPath}.${existed ? ' Existing references to this path now show the new version.' : ''}`,
    `Reference it in your response and in specs with exactly: ![${singleLine(name)}](${relPath})`,
  ];
  if (!mirror.ok) {
    lines.push(
      `Note: the preview mirror upload failed (${mirror.note}) — the file is intact and usable by the developer, but the wireframe may not render visually in the dashboard. Do not retry; mention the layout in prose as well.`,
    );
  }
  if (warnings.length > 0) {
    lines.push(...warnings.map((w) => `Note: ${w}`));
  }
  return lines.join('\n');
}
