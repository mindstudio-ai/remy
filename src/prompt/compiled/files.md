# Files & Storage

Per-app blob storage — the twin of `db` (`db` stores rows; `files` stores files: user uploads,
generated documents, images, marketing assets). **Private by default.** Files serve on the app's own
domain.

**File stores are always live — there is no dev copy.** Every `put`/`delete`/overwrite hits
production storage immediately and irreversibly. And unlike the database, **scenarios never reset file
stores** — a scenario truncates DB tables but leaves files untouched, so files are not a "clean slate"
you can re-seed, and orphaned files accumulate across runs. Delete deliberately.

## Defining a store

Like `db.defineTable`, define at module scope and import into methods. Access is pinned at define
time.

```typescript
import { files } from '@mindstudio-ai/agent';

export const Uploads = files.defineStore('uploads');                       // private (default)
export const Assets  = files.defineStore('assets', { access: 'public' });  // world-readable + CDN
// optional upload policy: files.defineStore('uploads', { maxSize, contentTypes })
```

Store names: lowercase `[a-z0-9_-]`, ≤ 64 chars. Keys are paths within the store (`reports/q1.pdf`).

## Backend (`@mindstudio-ai/agent`)

```typescript
import { Uploads } from './files/uploads';

// Store bytes the backend produced; hand file.url to the frontend.
const file = await Reports.put(pdfBuffer, { contentType: 'application/pdf', filename: 'q1.pdf' });
file.url;   // stable, on-domain URL for <img>/<a>/fetch (private → app-session-authed)

const bytes = await Uploads.get(key);          // Buffer — backend-side read (parse it, feed a model)
await Uploads.head(key);                        // metadata; .exists(key) → boolean
const { files, cursor } = await Uploads.list({ prefix: 'reports/', limit: 100 });
await Uploads.delete(key);
```

- `put(content, { key?, contentType?, filename?, contentAddressed? })` → `StoredFile`
  (`{ key, url, size?, contentType?, updatedAt?, shareUrl() }`). Omit `key` → UUID;
  `contentAddressed: true` → a `<sha256>.<ext>` key (immutable/idempotent, for baked-in public assets).
- **`file.url`** is a plain relative string — don't await it. To display a user *their own* file, hand
  them `file.url`; don't `get()` the bytes and stream them yourself.
- **`await file.shareUrl({ expiresIn })`** → an absolute signed link that works with **no session**
  (email / cross-site embed). Private stores only; default 24h.

## User uploads (client-direct — bytes never go through the backend)

Backend mints a token; the browser uploads straight to storage:

```typescript
// backend method
export async function getUploadSlot(input: { filename: string; contentType: string }) {
  return Uploads.createUploadToken({ contentType: input.contentType, maxSize: 25 * 1024 * 1024 });
}
```
```typescript
// frontend (@mindstudio-ai/interface)
import { createClient, platform } from '@mindstudio-ai/interface';
const api = createClient();
const token = await api.getUploadSlot({ filename: file.name, contentType: file.type });
const { key, url } = await platform.upload(token, file, { onProgress: (f) => setProgress(f) });
```

## Public assets + image resizing

Public files are world-readable, on the app's domain, and **images resize via query params**
(`?w=&h=&fit=&crop=&fm=&dpr=&q=&blur=&sharpen=` — same vocabulary as the image CDN; set `dpr=2/3` for
retina). Request the size you need rather than CSS-scaling a full-res original.

Lightweight-config pattern: a public store + a stable `key` is a file the frontend can `fetch` with no
DB hit and the backend can overwrite (`Config.put(json, { key: 'config/latest.json' })`).

## Build-time / marketing assets

Need an image on the site (hero, logo, OG image)? **Never commit binaries to the repo** — it bloats
git. Upload once and embed the returned URL:

```bash
mindstudio-prod files put --public ./hero.jpg   # → { url, key } — content-addressed, immutable
```
Write that URL into your JSX/HTML. Also: `files list`, `files rm --store … --key …` (`--help` for flags).

## When public vs private

- **Private (default):** user uploads, generated docs, anything not world-readable. Reads are authed
  (the app session) or a short-lived `shareUrl`.
- **Public:** marketing images, resizable media, config the frontend reads. Deliberate `access:
  'public'`.

Per-user access is the app's job — key files per user (`{userId}/…`) and hand each user only their own
URLs; the platform authorizes at the app level, not per file.
