# Files & Storage

Per-app file storage — the twin of the database. Where `db` stores rows, `files` stores blobs:
user uploads, generated documents, images, marketing assets. **Private by default.** Files are served
on the app's own domain, so URLs stay on-brand and unguessable.

```typescript
import { files } from '@mindstudio-ai/agent';

// Private by default — signed / session-authorized reads.
export const Uploads = files.defineStore('uploads');

// Public — world-readable, CDN-served, resizable.
export const Assets = files.defineStore('assets', { access: 'public' });
```

> **File stores are always live — there is no dev copy.** Unlike the database (which has a dev copy
> that scenarios truncate), file storage is a single, live store. Every `put`, `delete`, or overwrite
> takes effect on production immediately and is irreversible. **Scenarios never reset file stores** —
> running a scenario truncates database tables but leaves files untouched, so files are not a "clean
> slate" you can re-seed, and orphaned files accumulate across runs. Delete deliberately, and prefer
> content-addressed or user-scoped keys so re-runs overwrite rather than pile up.

## Defining a Store

`files.defineStore(name, options?)` returns a lazy `Store` handle. Like `db.defineTable`, define it
at module scope and import it into methods — nothing executes until you await a method on it.

```typescript
export const Uploads = files.defineStore('uploads', {
  access: 'private',            // default; 'public' opts into world-readable + CDN
  maxSize: 25 * 1024 * 1024,    // optional cap for client-direct uploads (bytes)
  contentTypes: ['image/png', 'image/jpeg'], // optional allow-list for uploads
});
```

- **`access`** — `'private'` (default) or `'public'`. **Pinned at define time** — no `put()` can flip
  it. Whether an object is world-readable is a security property, decided once per store.
- **`maxSize`** / **`contentTypes`** — defaults enforced on client-direct uploads (see below).

Store names are lowercase `[a-z0-9_-]`, ≤ 64 chars. Keys are paths within the store
(`reports/q1.pdf`) — no leading slash, no `..`. An app can have as many stores as it wants; they're
just namespaces (`uploads`, `avatars`, `exports`, `assets`).

## Backend API (`@mindstudio-ai/agent`)

```typescript
import { Uploads } from './files/uploads';
```

### Storing

```typescript
// Store bytes the backend produced (a generated PDF, a rendered image, …).
const file = await Reports.put(pdfBuffer, {
  contentType: 'application/pdf',
  filename: 'q1-report.pdf',   // used only to pick an extension when key is omitted
});
file.url;   // hand this to the frontend to display/download
file.key;   // store it in a db row if you need to reference the file later
```

`put(content, options?)` accepts a `Buffer`, `Uint8Array`, or `string`. Options:

- **`key`** — the object key. Omit to auto-generate a UUID (`<uuid>.<ext>`).
- **`contentType`** — MIME type stored on the object.
- **`filename`** — only used to derive an extension when `key` is omitted.
- **`contentAddressed`** — when true (and no explicit `key`), the key is a hash of the bytes
  (`<sha256>.<ext>`): immutable and idempotent, so re-storing identical bytes yields the same
  key/URL. Use for public assets whose URL you bake into source.

### Reading (server-side)

```typescript
const bytes = await Uploads.get(key);          // Buffer — parse it, hand it to a model, etc.
const meta  = await Uploads.head(key);          // { key, size, contentType, updatedAt, url, … }
const there = await Uploads.exists(key);        // boolean
```

`get()` is for the backend's own use (parsing an uploaded spreadsheet, feeding a file to a model). To
let a *user* see a file, hand them `file.url` — don't `get()` the bytes and stream them yourself.

### Listing & deleting

```typescript
const { files, cursor } = await Uploads.list({ prefix: 'reports/', limit: 100 });
if (cursor) { /* pass back as { cursor } for the next page */ }

await Uploads.delete(key);
```

### `StoredFile` and URLs

Every `put`/`head`/`list` result is a `StoredFile`:

```typescript
{
  store: string;
  key: string;
  access: 'public' | 'private';
  size?: number;
  contentType?: string;
  updatedAt?: string;        // ISO 8601
  url: string;               // stable, on-domain
  shareUrl(opts?): Promise<string>;
}
```

- **`file.url`** — a stable, relative, on-domain URL (`/_/files/<access>/<store>/<key>`). Drop it
  straight into `<img src>`, `fetch`, or `<a download>` in the app's own frontend. For a **private**
  file it authorizes automatically via the logged-in app session (same origin); for a **public** file
  it's world-readable. Nothing to await — it's a plain string.
- **`await file.shareUrl({ expiresIn })`** — an **absolute, signed** URL that works with **no
  session** (email it, embed it on another site). Expires (default 24h). **Private stores only** —
  public files don't need it.

## User Uploads (client-direct)

Don't route a user's file through a method (bytes through the backend = slow, size-limited). Instead
the browser uploads **straight to storage** with a token the backend mints:

```typescript
// 1. Backend method — authorize, then mint a scoped upload token.
import { Uploads } from './files/uploads';
export async function getUploadSlot(input: { filename: string; contentType: string }) {
  // (your own checks — quota, who's allowed, etc.)
  return Uploads.createUploadToken({
    contentType: input.contentType,
    maxSize: 25 * 1024 * 1024,
  });
}
```

```typescript
// 2. Frontend — hand the token + the File to platform.upload.
import { createClient, platform } from '@mindstudio-ai/interface';
const api = createClient();

const token = await api.getUploadSlot({ filename: file.name, contentType: file.type });
const { key, url } = await platform.upload(token, file, {
  onProgress: (fraction) => setProgress(fraction),
});
// `url` is ready to display; record `key` (e.g. via another method) if you need it later.
```

`createUploadToken(options?)` takes `key?`, `contentType?`, `filename?`, `maxSize?`, `expiresIn?`.
The token's presigned upload enforces the size cap and (when `contentType` is set) an exact
content-type match; the store's `maxSize`/`contentTypes` supply the defaults.

## Public Assets & Image Resizing

Public files are world-readable, served on the app's domain, and **images resize via query
parameters** — request the size you need instead of shipping a full-resolution original:

```
<img src="https://<your-app>/_/files/public/assets/hero.jpg?w=800&fit=cover" />
```

The parameters match the image CDN: `w`, `h`, `fit`, `crop`, `fm`, `dpr`, `q`, `blur`, `sharpen`.
Always request an appropriately sized image rather than CSS-scaling a large one; set `dpr=2` (or 3)
for retina.

**The lightweight-config pattern.** A public store with a stable `key` gives you a file the frontend
can `fetch` with no DB hit and the backend can overwrite:

```typescript
await Config.put(JSON.stringify(cfg), { key: 'config/latest.json', contentType: 'application/json' });
// frontend: fetch('/_/files/public/config/latest.json')
```

Overwrites propagate within a short cache window (seconds) — great for lightweight config, not a
strongly-consistent store.

## Build-Time / Marketing Assets

When you need an image on the site (a hero image, an OG image, a logo), **do not commit the binary to
the repo** — that bloats git. Upload it once and embed the returned URL in your source:

```bash
mindstudio-prod files put --public ./hero.jpg
# → { "url": "https://<your-app>/_/files/public/assets/<hash>.jpg", "key": "<hash>.jpg" }
```

Write that URL into your JSX/HTML. The key is content-addressed by default, so the URL is stable and
immutable — safe to bake in; re-running `put` on the same bytes returns the same URL. Other
subcommands: `mindstudio-prod files list` (stores + usage) and `mindstudio-prod files rm --store …
--key …`. Run `mindstudio-prod files --help` for flags.

## Public vs Private — When to Use Which

- **Private (default)** — anything tied to a user or not meant to be world-readable: uploads,
  generated documents, exports. Reads are authorized (the app session) or a short-lived `shareUrl`.
- **Public** — marketing images, resizable media, a config JSON the frontend reads. World-readable,
  cached at the edge, resizable. Deliberately opt in with `{ access: 'public' }`.

Fine-grained "which user may see which file" is the app's job — name keys per user (e.g.
`{userId}/…`) and only hand each user the URLs they should have. The platform authorizes at the app
level (a valid app session or share token); it doesn't know your per-file rules.

## Managing Files

Uploaded/stored files are browsable in the app dashboard's **Files** tab (per store: counts, usage,
preview, delete).

## Note: the old `uploadFile`

`agent.uploadFile()` is the legacy v1 public CDN helper (world-readable, org-scoped). For anything new
use `files` — private by default, per-app, on your own domain.
