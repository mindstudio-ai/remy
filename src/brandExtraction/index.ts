/**
 * Brand extraction — derives a structured AppBrand object from spec files.
 *
 * The frontend renders plan documents with a "letterhead" treatment that
 * uses the user's own brand. This module reads the project's spec markdown
 * and the manifest, asks a sub-agent to extract the brand, and persists
 * `.remy-brand.json` for the frontend to read.
 *
 * Mirrors the compaction pattern: read input → call a no-tools sub-agent
 * to force structured text output → persist the result.
 *
 * Gate inputs (changes to these trigger regeneration):
 *   - src/app.md
 *   - any src/**\/*.md whose frontmatter `type` starts with design/color or design/typography
 *   - mindstudio.json
 *
 * Generation reads the full src/ tree (brand-relevant files first, capped at a
 * char budget) — the gate only decides when to fire.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { streamChat } from '../api.js';
import { readAsset } from '../assets.js';
import { createLogger } from '../logger.js';
import { recordUsage, nanoToDollars } from '../usageLedger.js';

const log = createLogger('brandExtraction');

const EXTRACT_PROMPT = readAsset('brandExtraction', 'extract.md');

const BRAND_FILE = '.remy-brand.json';
const CACHE_FILE = '.remy-brand.cache.json';

interface BrandFont {
  family: string;
  stylesheet?: string;
  fileUrl?: string;
}

export interface AppBrand {
  version: 1;
  name?: string;
  tagline?: string;
  logoUrl?: string;
  colors?: {
    background?: string;
    text?: string;
    heading?: string;
    accent?: string;
    muted?: string;
  };
  typography?: {
    body?: BrandFont;
    heading?: BrandFont;
  };
}

interface CacheRecord {
  inputHash: string;
  generatedAt: number;
}

/**
 * Run an extraction pass. No-op when the gate-input hash matches the cache.
 * Returns the brand object on success, null on failure or no-op skip.
 */
export async function runExtraction(
  apiConfig: {
    baseUrl: string;
    apiKey: string;
  },
  model: string,
): Promise<AppBrand | null> {
  const inputHash = computeInputHash();
  const cached = readCache();
  if (cached && cached.inputHash === inputHash) {
    log.debug('Brand inputs unchanged — skipping extraction', { inputHash });
    return null;
  }

  log.info('Extracting brand', { inputHash });
  const brand = await extractBrand(apiConfig, model);
  if (!brand) {
    log.warn('Brand extraction failed — leaving cache untouched');
    return null;
  }

  persistBrand(brand, inputHash);
  log.info('Brand persisted', { inputHash });
  return brand;
}

//////////////////////////////////////////////////////////////////////////////
// Gate hashing
//////////////////////////////////////////////////////////////////////////////

/**
 * A file carries brand signal (name / color / typography) if it is the app's
 * `src/app.md` or a `design/color*` / `design/typography*` spec. Shared by the
 * gate hash and the corpus builder so both agree on what "brand-relevant" means.
 */
function isBrandRelevant(filePath: string): boolean {
  if (filePath === path.join('src', 'app.md')) {
    return true;
  }
  const { type } = parseFrontmatter(filePath);
  return (
    type.startsWith('design/color') || type.startsWith('design/typography')
  );
}

function computeInputHash(): string {
  const entries: Array<{ path: string; content: string }> = [];

  for (const filePath of walkMdFiles('src')) {
    if (isBrandRelevant(filePath)) {
      entries.push({ path: filePath, content: readSafe(filePath) });
    }
  }

  const manifest = readSafe('mindstudio.json');
  if (manifest) {
    entries.push({ path: 'mindstudio.json', content: manifest });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = entries
    .map((e) => `${e.path}:${sha256(e.content)}`)
    .join('\n');
  return sha256(fingerprint);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function readSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkMdFiles(full));
      } else if (entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {
    // Directory missing or unreadable — return empty
  }
  return results.sort();
}

function parseFrontmatter(filePath: string): { type: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { type: '' };
    }
    const fm = match[1];
    const type = fm.match(/^type:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return { type };
  } catch {
    return { type: '' };
  }
}

//////////////////////////////////////////////////////////////////////////////
// Extraction
//////////////////////////////////////////////////////////////////////////////

async function extractBrand(
  apiConfig: {
    baseUrl: string;
    apiKey: string;
  },
  model: string,
): Promise<AppBrand | null> {
  const corpus = buildCorpus();
  if (!corpus.trim()) {
    log.debug('No spec corpus — emitting empty brand');
    return { version: 1 };
  }

  let responseText = '';
  const iterStart = Date.now();
  try {
    for await (const event of streamChat({
      ...apiConfig,
      model,
      subAgentId: 'brandExtractor',
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: corpus }],
      tools: [],
    })) {
      if (event.type === 'text') {
        responseText += event.text;
      } else if (event.type === 'done') {
        recordUsage({
          ts: Date.now(),
          agentName: 'brandExtractor',
          modelId: event.modelId,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          cacheCreationTokens: event.usage.cacheCreationTokens,
          cacheReadTokens: event.usage.cacheReadTokens,
          cost: nanoToDollars(event.cost),
          billingEvents: event.billingEvents,
          durationMs: Date.now() - iterStart,
          toolNames: [],
        });
      } else if (event.type === 'error') {
        log.error('Brand extraction stream error', { error: event.error });
        return null;
      }
    }
  } catch (err: any) {
    log.error('Brand extraction threw', { error: err?.message });
    return null;
  }

  const parsed = parseJsonResponse(responseText);
  if (!parsed) {
    log.warn('Brand extraction returned unparseable JSON', {
      preview: responseText.slice(0, 200),
    });
    return null;
  }

  return validateBrand(parsed);
}

// Max chars in the extraction corpus. The model gateway rejects prompts over
// 1M tokens; at ~4 chars/token (the compaction heuristic) this leaves generous
// headroom for the system prompt + JSON output. Well above a typical app's full
// spec tree, so most corpora aren't truncated at all — the cap only guards the
// pathological case (a mature app whose whole tree overflows the token limit),
// which previously made brand extraction fail silently on every run.
const BRAND_CORPUS_CHAR_LIMIT = 2_400_000;

/**
 * Assemble the full `src/` markdown tree (plus the manifest) into one corpus,
 * ordered so brand-relevant files come first and capped at
 * BRAND_CORPUS_CHAR_LIMIT. Prioritizing brand files guarantees the name/color/
 * typography signal is always present even when a huge tree forces truncation —
 * the extra files are the ones dropped, never the brand-bearing ones.
 */
function buildCorpus(): string {
  const all = walkMdFiles('src');
  const ordered = [
    ...all.filter(isBrandRelevant),
    ...all.filter((f) => !isBrandRelevant(f)),
  ];

  const files: Array<{ path: string; content: string }> = [];
  const manifest = readSafe('mindstudio.json');
  if (manifest) {
    files.push({ path: 'mindstudio.json', content: manifest });
  }
  for (const filePath of ordered) {
    const content = readSafe(filePath);
    if (content) {
      files.push({ path: filePath, content });
    }
  }

  const sep = '\n\n---\n\n';
  const sections: string[] = [];
  let usedChars = 0;
  for (const { path: p, content } of files) {
    const section = `## File: ${p}\n\n${content}`;
    const added = section.length + (sections.length > 0 ? sep.length : 0);
    // Always include at least the top-priority file; truncate once the budget
    // would be exceeded.
    if (sections.length > 0 && usedChars + added > BRAND_CORPUS_CHAR_LIMIT) {
      sections.push(
        `(brand corpus truncated: included ${sections.length} of ${files.length} files, ` +
          `~${(usedChars / 1024).toFixed(0)}KB; brand-relevant files were prioritized.)`,
      );
      break;
    }
    sections.push(section);
    usedChars += added;
  }
  return sections.join(sep);
}

function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  // Strip leading ```json ... ``` fence if present
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to first {...} block in case the model wrapped in prose
    const braceMatch = candidate.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

//////////////////////////////////////////////////////////////////////////////
// Validation
//////////////////////////////////////////////////////////////////////////////

function validateBrand(raw: unknown): AppBrand | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const out: AppBrand = { version: 1 };

  if (typeof obj.name === 'string' && obj.name.trim()) {
    out.name = obj.name.trim();
  }
  if (typeof obj.tagline === 'string' && obj.tagline.trim()) {
    out.tagline = obj.tagline.trim();
  }
  if (typeof obj.logoUrl === 'string' && obj.logoUrl.trim()) {
    out.logoUrl = obj.logoUrl.trim();
  }

  const colors = pickColors(obj.colors);
  if (colors) {
    out.colors = colors;
  }

  const typography = pickTypography(obj.typography);
  if (typography) {
    out.typography = typography;
  }

  return out;
}

function pickColors(raw: unknown): AppBrand['colors'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const c = raw as Record<string, unknown>;
  const out: NonNullable<AppBrand['colors']> = {};
  for (const key of [
    'background',
    'text',
    'heading',
    'accent',
    'muted',
  ] as const) {
    const v = c[key];
    if (typeof v === 'string' && v.trim()) {
      out[key] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function pickTypography(raw: unknown): AppBrand['typography'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const t = raw as Record<string, unknown>;
  const out: NonNullable<AppBrand['typography']> = {};
  const body = pickFont(t.body);
  if (body) {
    out.body = body;
  }
  const heading = pickFont(t.heading);
  if (heading) {
    out.heading = heading;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function pickFont(raw: unknown): BrandFont | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const f = raw as Record<string, unknown>;
  if (typeof f.family !== 'string' || !f.family.trim()) {
    return undefined;
  }
  const out: BrandFont = { family: f.family.trim() };
  if (typeof f.stylesheet === 'string' && f.stylesheet.trim()) {
    out.stylesheet = f.stylesheet.trim();
  }
  if (typeof f.fileUrl === 'string' && f.fileUrl.trim()) {
    out.fileUrl = f.fileUrl.trim();
  }
  return out;
}

//////////////////////////////////////////////////////////////////////////////
// Persistence (atomic write so the frontend never sees partial JSON)
//////////////////////////////////////////////////////////////////////////////

function persistBrand(brand: AppBrand, inputHash: string): void {
  const tmp = `${BRAND_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(brand, null, 2), 'utf-8');
  fs.renameSync(tmp, BRAND_FILE);

  const cache: CacheRecord = { inputHash, generatedAt: Date.now() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function readCache(): CacheRecord | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.inputHash === 'string' &&
      typeof parsed.generatedAt === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
