/**
 * Attachment persistence for the headless protocol.
 *
 * Downloads user-uploaded files to src/.user-uploads/ so the agent can
 * reference them on disk and across compaction/restart. Images are
 * downloaded but noted differently in the message header since the model
 * also receives them as visual attachments.
 */

import { mkdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, join, extname } from 'node:path';
import { createLogger } from '../logger.js';
import type { Attachment } from '../api.js';

const log = createLogger('headless:attachments');

const UPLOADS_DIR = 'src/.user-uploads';

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

function resolveUniqueFilename(name: string): string {
  if (!existsSync(join(UPLOADS_DIR, name))) {
    return name;
  }
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  let counter = 1;
  while (existsSync(join(UPLOADS_DIR, `${base}-${counter}${ext}`))) {
    counter++;
  }
  return `${base}-${counter}${ext}`;
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.tiff',
  '.tif',
  '.avif',
  '.heic',
  '.heif',
]);

function isImageAttachment(att: Attachment): boolean {
  const name = att.filename || filenameFromUrl(att.url);
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

export async function persistAttachments(
  attachments: Attachment[],
): Promise<{ documents: PersistResult[]; images: PersistResult[] }> {
  // Skip voice messages (transcripts stay inline)
  const nonVoice = attachments.filter((a) => !a.isVoice);
  if (nonVoice.length === 0) {
    return { documents: [], images: [] };
  }

  mkdirSync(UPLOADS_DIR, { recursive: true });

  const results = await Promise.allSettled(
    nonVoice.map(async (att): Promise<PersistResult> => {
      const name = resolveUniqueFilename(
        att.filename || filenameFromUrl(att.url),
      );
      const localPath = join(UPLOADS_DIR, name);

      const res = await fetch(att.url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading ${att.url}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(localPath, buffer);
      log.info('Attachment saved', {
        filename: name,
        path: localPath,
        bytes: buffer.length,
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

  const settled = results.map((r, i) => ({
    result: r.status === 'fulfilled' ? r.value : null,
    isImage: isImageAttachment(nonVoice[i]),
  }));
  return {
    documents: settled.filter((s) => !s.isImage).map((s) => s.result),
    images: settled.filter((s) => s.isImage).map((s) => s.result),
  };
}

export function buildUploadHeader(results: PersistResult[]): string {
  const succeeded = results.filter(Boolean) as Exclude<PersistResult, null>[];
  if (succeeded.length === 0) {
    return '';
  }
  if (succeeded.length === 1) {
    const r = succeeded[0];
    const parts = [`[Uploaded file: ${r.localPath} (CDN: ${r.remoteUrl})`];
    if (r.extractedTextPath) {
      parts.push(`extracted text: ${r.extractedTextPath}`);
    }
    return parts.join(' — ') + ']';
  }
  const lines = succeeded.map((r) => {
    const parts = [`- ${r.localPath} (CDN: ${r.remoteUrl})`];
    if (r.extractedTextPath) {
      parts.push(`  extracted text: ${r.extractedTextPath}`);
    }
    return parts.join('\n');
  });
  return `[Uploaded files]\n${lines.join('\n')}`;
}
