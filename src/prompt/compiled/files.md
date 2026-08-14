# Files & Storage

Per-app blob storage: user uploads, generated documents, images, marketing assets. **Think of a store
as a CDN-backed bucket the app talks to — not app-defined state like the database.** You declare the
store; what lands in it is arbitrary durable blobs the app doesn't model — no schema, nothing to
migrate, no dev/prod sync. **Private by default**, served on the app's own domain. (The API is
*shaped* like `db` — `defineStore` at module scope, import the handle, like `defineTable` — but the
mental model is a bucket, not rows.)

## How a store behaves (read before the API)

- **One store, shared across dev and prod — on purpose.** There's no dev copy: a file you upload in
  the dev editor (a marketing image, a corpus to vectorize) is *already there in prod* at the same
  stable URL. That continuity is a feature — don't fork buckets per environment.
- **Creates are safe by default**, because keys default to unique — `put()` mints a UUID (or a
  content-addressed hash) when you don't pass one, so a dev write and a prod write land at different
  keys and coexist. A collision only happens when you *choose* a fixed key.
- **Care goes on the destructive / fixed-key operations**, not on writing in general: `delete(key)`
  and overwriting a **stable key** (e.g. `config/latest.json`) reach the one live store, so a dev run
  can clobber what prod serves. A `put()` with a default key can't. (There's intentionally no bulk
  "clear the store".)
- **Scenarios don't touch files — and that's correct.** A scenario truncates DB tables to seed test
  *rows*; files are durable and left alone. A store isn't a "clean slate" you re-seed each run — upload
  a test file once in dev and it stays. Accumulation is normal for an asset store; don't write
  `clear()`-style reset helpers.
- **Need dev and prod to *not* share** something (mutable fixed-key state, or sensitive uploads a
  developer shouldn't see)? There's no per-store isolation switch — scope the key yourself (e.g.
  `config/${env}/…`). Rare; the shared default is right almost always.

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

Public files are world-readable, served on the app's own domain, and **images resize via query
params** — request the size you need rather than CSS-scaling a full-res original. Always set `dpr=2`
or `3` when sizing so images stay crisp on Retina displays.

| Param | Example | Effect |
|-------|---------|--------|
| `w` | `?w=400` | Max width in pixels |
| `h` | `?h=300` | Max height in pixels |
| `fit` | `?fit=crop` | Resize mode: `scale-down`, `contain`, `cover`, `crop`, `pad` |
| `crop` | `?crop=face` | Face-aware crop (with `fit=crop`) |
| `fm` | `?fm=webp` | Output format: `avif`, `webp`, `jpeg`, `auto` |
| `dpr` | `?dpr=2` | Device pixel ratio |
| `q` | `?q=80` | Quality (1–100) |
| `blur` | `?blur=10` | Blur radius |
| `sharpen` | `?sharpen=1` | Sharpen amount |

Combine freely: `…/hero.jpg?w=200&h=200&fit=crop&fm=avif`.

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
