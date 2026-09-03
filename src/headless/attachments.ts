/**
 * Attachment persistence for the headless protocol.
 *
 * Downloads user-uploaded files to src/.user-uploads/ so the agent can
 * reference them on disk and across compaction/restart. Images are
 * downloaded but noted differently in the message header since the model
 * also receives them as visual attachments.
 */

import { mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { basename, join, extname } from 'node:path';
import { createLogger } from '../logger.js';
import type { Attachment } from '../api.js';

const log = createLogger('headless:attachments');

const UPLOADS_DIR = 'src/.user-uploads';

// Images are small and the model is waiting on them; documents and archives
// can be a zipped codebase at the 100 MB frontend cap, so give those the
// time a slow link needs.
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const DOCUMENT_DOWNLOAD_TIMEOUT_MS = 300_000;

export type PersistResult = {
  filename: string;
  localPath: string;
  remoteUrl: string;
  extractedTextPath?: string;
} | null;

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = basename(pathname);
    return name && name !== '/'
      ? decodeURIComponent(name)
      : `upload-${Date.now()}`;
  } catch {
    return `upload-${Date.now()}`;
  }
}

/**
 * Pick a filename no other upload is using. `claimed` holds the names already
 * handed out for this batch — the files behind them have not been downloaded
 * yet, so the disk check alone cannot see them.
 */
function resolveUniqueFilename(name: string, claimed: Set<string>): string {
  const isFree = (candidate: string) =>
    !claimed.has(candidate) && !existsSync(join(UPLOADS_DIR, candidate));

  if (isFree(name)) {
    return name;
  }
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  let counter = 1;
  while (!isFree(`${base}-${counter}${ext}`)) {
    counter++;
  }
  return `${base}-${counter}${ext}`;
}

// Only formats the model accepts as image blocks. Anything else (svg, bmp,
// tiff, ico, heic/heif, avif) is persisted as a document so the agent can
// open it with readFile — sending it as an image block gets rejected by the
// provider and loops the whole turn. Deliberately narrower than
// uploadImage.ts's CONTENT_TYPES (which allows .svg): that path goes through
// the platform, which rasterizes SVG before any model sees it; this one
// feeds provider image blocks directly.
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isImageAttachment(att: Attachment): boolean {
  const name = att.filename || filenameFromUrl(att.url);
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

/**
 * Persist non-voice attachments to disk. `result[i]` aligns with the i-th
 * non-voice input; `null` means that download failed.
 */
export async function persistAttachmentList(
  attachments: Attachment[],
): Promise<PersistResult[]> {
  // Skip voice messages (transcripts stay inline)
  const nonVoice = attachments.filter((a) => !a.isVoice);
  if (nonVoice.length === 0) {
    return [];
  }

  mkdirSync(UPLOADS_DIR, { recursive: true });

  // Claim every name before any download starts. Resolving inside the parallel
  // map instead would race: no file is on disk yet while the batch resolves, so
  // every attachment in a multi-file message picks the same name and they
  // overwrite each other, leaving only the last one.
  const claimed = new Set<string>();
  const names = nonVoice.map((att) => {
    const name = resolveUniqueFilename(
      att.filename || filenameFromUrl(att.url),
      claimed,
    );
    claimed.add(name);
    return name;
  });

  const results = await Promise.allSettled(
    nonVoice.map(async (att, i): Promise<PersistResult> => {
      const name = names[i];
      const localPath = join(UPLOADS_DIR, name);

      const timeoutMs = isImageAttachment(att)
        ? IMAGE_DOWNLOAD_TIMEOUT_MS
        : DOCUMENT_DOWNLOAD_TIMEOUT_MS;
      const res = await fetch(att.url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status} downloading ${att.url}`);
      }
      // Stream to disk rather than buffering: an upload can be a zipped
      // codebase tens of MB in size.
      await pipeline(
        Readable.fromWeb(res.body as WebReadableStream),
        createWriteStream(localPath),
      );
      const { size } = await stat(localPath);
      log.info('Attachment saved', {
        filename: name,
        path: localPath,
        bytes: size,
      });

      let extractedTextPath: string | undefined;
      if (att.extractedTextUrl) {
        try {
          const textRes = await fetch(att.extractedTextUrl, {
            signal: AbortSignal.timeout(30_000),
          });
          if (textRes.ok) {
            extractedTextPath = `${localPath}.txt`;
            await writeFile(extractedTextPath, await textRes.text(), 'utf-8');
            log.info('Extracted text saved', { path: extractedTextPath });
          }
        } catch {
          // Non-fatal — sidecar download failed
        }
      }

      return {
        filename: name,
        localPath,
        remoteUrl: att.url,
        extractedTextPath,
      };
    }),
  );

  return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
}

export async function persistAttachments(
  attachments: Attachment[],
): Promise<{ documents: PersistResult[]; images: PersistResult[] }> {
  const nonVoice = attachments.filter((a) => !a.isVoice);
  const results = await persistAttachmentList(nonVoice);
  const settled = results.map((result, i) => ({
    result,
    isImage: isImageAttachment(nonVoice[i]),
  }));
  return {
    documents: settled.filter((s) => !s.isImage).map((s) => s.result),
    images: settled.filter((s) => s.isImage).map((s) => s.result),
  };
}

export function buildUploadHeader(
  documents: PersistResult[],
  images: PersistResult[],
): string {
  type Entry = Exclude<PersistResult, null> & { isImage: boolean };
  const entries: Entry[] = [
    ...documents
      .filter((r): r is Exclude<PersistResult, null> => r !== null)
      .map((r) => ({ ...r, isImage: false })),
    ...images
      .filter((r): r is Exclude<PersistResult, null> => r !== null)
      .map((r) => ({ ...r, isImage: true })),
  ];
  if (entries.length === 0) {
    return '';
  }
  // A document without a sidecar means extraction wasn't possible (unsupported
  // format or extraction failure) — say so, so the agent parses the raw file
  // itself instead of hunting for a .txt that doesn't exist. Images never get
  // the note; they reach the model as vision attachments.
  const detail = (e: Entry): string | null =>
    e.extractedTextPath
      ? `extracted text: ${e.extractedTextPath}`
      : e.isImage
        ? null
        : 'no extracted text — raw file only';
  if (entries.length === 1) {
    const e = entries[0];
    const extra = detail(e);
    return `[Uploaded file: ${e.localPath}${extra ? ` — ${extra}` : ''}]`;
  }
  const lines = entries.map((e) => {
    const extra = detail(e);
    return `- ${e.localPath}${extra ? `\n  ${extra}` : ''}`;
  });
  return `[Uploaded files]\n${lines.join('\n')}`;
}
