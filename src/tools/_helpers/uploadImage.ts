/**
 * Host a local image file so a vision model can fetch it.
 *
 * Image analysis and image generation both run on the platform, so they only
 * take URLs — a path like `src/.user-uploads/screenshot.png` arrives as a
 * literal string and comes back `invalid_request_error`. A disk path is often
 * all the agent has: user uploads are downloaded to `src/.user-uploads/` and
 * the message header names the file by path, and anything the agent wrote
 * itself only exists in the sandbox. So a path gets uploaded on its way in.
 *
 * Uploads go through the same presigned endpoint the tunnel uses for browser
 * screenshots and land beside them under `_sandbox-tmp/` on the public CDN.
 * Two things follow from that: the URL is durable, so it can be reused for
 * follow-up questions and embedded in a spec, and it's on `i.mscdn.ai`, so the
 * image proxy resizes it before it reaches a model (a raw signed URL from the
 * private bucket would pass through unresized and expire in an hour). The
 * bucket is world-readable by unguessable key — the same exposure every app
 * screenshot already has.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { PROJECT_ROOT } from '../../projectRoot.js';
import { createLogger } from '../../logger.js';
import type { ApiConfig } from '../../config.js';

const log = createLogger('uploadImage');

const UPLOAD_TIMEOUT_MS = 60_000;

/** Formats the platform can serve to a vision model. The rasters pass
 * through untouched; SVG is accepted here because the platform rasterizes it
 * to PNG at analysis/generation time (youai-api resolveModelImageUrl).
 * Deliberately NOT the same list as `headless/attachments.ts` — that one
 * feeds Anthropic image blocks directly, which reject SVG. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Hosted URL per file identity (path + mtime + size), for the process
 * lifetime. The design expert asks several questions about one screenshot and
 * the tools tell it to reuse the URL — with a disk path there's no URL to
 * reuse yet, so cache here instead and upload each file once. Re-keying on
 * mtime/size means an edited file uploads again.
 */
const hosted = new Map<string, string>();

/** True when the reference is already something the platform can fetch —
 * i.e. anything that is not a path on the sandbox disk. Exported because
 * callers that treat local files differently (analyzeDesign renders a local
 * HTML document rather than uploading it) need the same test, and a second
 * regex would drift from this one. */
export function isFetchableUrl(ref: string): boolean {
  return /^(?:https?:|data:)/i.test(ref);
}

/**
 * Resolve an image reference to a URL the platform can fetch: URLs pass
 * through, local paths are uploaded. Throws with an actionable message if the
 * file is missing, is a format no vision model reads, or can't be hosted.
 */
export async function resolveImageRef(
  ref: string,
  apiConfig?: ApiConfig,
): Promise<string> {
  const trimmed = ref.trim();
  return isFetchableUrl(trimmed)
    ? trimmed
    : uploadLocalImage(trimmed, apiConfig);
}

/** Resolve several references concurrently. */
export function resolveImageRefs(
  refs: string[],
  apiConfig?: ApiConfig,
): Promise<string[]> {
  return Promise.all(refs.map((ref) => resolveImageRef(ref, apiConfig)));
}

async function uploadLocalImage(
  localPath: string,
  apiConfig?: ApiConfig,
): Promise<string> {
  const absolute = resolve(PROJECT_ROOT, localPath);
  const ext = extname(absolute).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    throw new Error(
      `Cannot use "${localPath}" as an image — vision models read ${Object.keys(
        CONTENT_TYPES,
      ).join(', ')}. Convert it first, or pass an image URL.`,
    );
  }

  let stats;
  try {
    stats = await stat(absolute);
  } catch {
    throw new Error(
      `No file at "${localPath}". Paths resolve from the project root; list the directory to check the name, or pass an image URL.`,
    );
  }

  const cacheKey = `${absolute}:${stats.mtimeMs}:${stats.size}`;
  const cached = hosted.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!apiConfig?.appId) {
    throw new Error(
      `Cannot host "${localPath}" for analysis — this session has no app id. Pass an image URL instead.`,
    );
  }

  const bytes = await readFile(absolute);
  const target = await requestUploadTarget(apiConfig, ext.slice(1));

  const form = new FormData();
  for (const [field, value] of Object.entries(target.uploadFields)) {
    form.append(field, value);
  }
  form.append(
    'file',
    new Blob([bytes], { type: contentType }),
    basename(absolute),
  );

  const res = await fetch(target.uploadUrl, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Upload of "${localPath}" failed: HTTP ${res.status}`);
  }

  log.info('Local image hosted', {
    path: localPath,
    bytes: stats.size,
    url: target.publicUrl,
  });
  hosted.set(cacheKey, target.publicUrl);
  return target.publicUrl;
}

interface UploadTarget {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  publicUrl: string;
}

async function requestUploadTarget(
  apiConfig: ApiConfig,
  extension: string,
): Promise<UploadTarget> {
  const url = `${apiConfig.baseUrl}/_internal/v2/apps/${apiConfig.appId}/dev/manage/upload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({ extension }),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Could not get an upload URL: HTTP ${res.status}`);
  }
  return (await res.json()) as UploadTarget;
}
