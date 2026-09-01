# Interfaces

Interfaces are how users interact with your app, and the same methods power all of them: a web frontend, a REST API, and a cron job can all invoke the same backend logic. Interfaces can be as complex and polished as you want, but they're always safe, because the backend is where anything real happens.

---

## Web Interface

A full web application. The scaffold starts as Vite + React, but any framework with a build step works.

### Project Structure

```
dist/interfaces/web/
  web.json           ← interface config
  package.json
  vite.config.ts
  index.html
  src/
    App.tsx
    pages/
    components/
```

### Config (`web.json`)

```json
{
  "web": {
    "devPort": 5173,
    "devCommand": "npm run dev",
    "defaultPreviewMode": "desktop"
  }
}
```

All fields are nested under the `"web"` key.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `devPort` | `number` | `5173` | Port for the dev server |
| `devCommand` | `string` | `"npm run dev"` | Command to start the dev server |
| `defaultPreviewMode` | `"desktop"` \| `"mobile"` | `"desktop"` | Default preview viewport in the editor. Set to `"mobile"` for mobile-first apps. |
| `prerender` | `object` | — | Opt into prerendering the listed routes for crawlers/unfurlers. See "Prerendering for crawlers" below. |
| `mounts` | `array` | — | Serve other apps from your workspace under path prefixes of this app's hosts. See "Mounting other apps" below. |
| `redirects` | `array` | — | Path-level redirects. See "Redirects and trailing slashes" below. |
| `rewrites` | `array` | — | Serve different content at the same URL. See "Rewrites" below. |
| `trailingSlash` | `"strip"` \| `"append"` | — | Enforce a canonical trailing-slash form with a 308. Off by default. |

### Frontend SDK

```typescript
import { createClient, platform, auth } from '@mindstudio-ai/interface';

// Typed RPC to backend methods
const api = createClient<{
  submitVendor(input: { name: string }): Promise<{ vendorId: string }>;
  listVendors(): Promise<{ vendors: Vendor[] }>;
}>();

const { vendorId } = await api.submitVendor({ name: 'Acme' });
const { vendors } = await api.listVendors();

// File upload (returns CDN URL)
const url = await platform.uploadFile(file);

// With progress tracking
const url = await platform.uploadFile(file, {
  onProgress: (fraction) => setProgress(fraction), // 0 to 1
});

// With abort support
const controller = new AbortController();
const url = await platform.uploadFile(file, {
  signal: controller.signal,
  onProgress: (f) => setProgress(f),
});
controller.abort(); // cancels the upload

// Auth (for apps with auth enabled in manifest)
auth.getCurrentUser()               // AppUser { id, email, phone, roles, createdAt } | null
auth.currentUser                    // same as getCurrentUser() (sync getter)
auth.isAuthenticated()              // boolean
auth.onAuthStateChanged(cb)         // fires immediately + on transitions; returns unsubscribe
auth.sendEmailCode(email)           // → { verificationId }
auth.verifyEmailCode(verId, code)   // → AppUser (sets session)
auth.sendSmsCode(phone)             // → { verificationId }
auth.verifySmsCode(verId, code)     // → AppUser (sets session)
auth.signInWithRemy(options?)       // → AppUser|null; "Continue with {Org}" delegated sign-in (redirect top-level, popup embedded)
auth.handleRemyRedirect()           // call once on load; completes delegated sign-in, no-op if no code
auth.logout()                       // clears session
```

Realtime: `events.connect({ getToken, onEvent, onConnect })` receives backend publishes live (dashboards, notifications, multi-tab sync) — the backend mints the token with `events.grant` and pushes with `events.publish`. See [SDK Actions — Realtime Events](11_sdk-actions.md#realtime-events).

### Deployment

On `git push`, the platform runs `npm install && npm run build` in the web directory and hosts the output on CDN. The platform injects connection details automatically.

The build runs with **`MS_ASSET_BASE_URL`** set to a release-addressed CDN origin for the build's static assets. Point your bundler's public-path option at it so asset URLs are absolute and serve identically on the app's own subdomain, a custom domain, or a mount path on another app:

```ts
// vite.config.ts
export default defineConfig({
  base: process.env.MS_ASSET_BASE_URL || '/',
  // ...
});
```

(Webpack: `output.publicPath`; other bundlers have an equivalent.) Locally the variable is unset, so the app builds and serves at `/`.

### Serving context: `platform.basePath`

The platform injects the path prefix the current page is served under: `''` on the app's own hosts, or the mount path (e.g. `"/demos/vector-databases"`) when another app mounts this one. The SDK already prefixes its own platform calls with it. App code only needs to use it as the router basename:

```ts
createBrowserRouter(routes, { basename: platform.basePath || '/' });
```

Hardcoded root-absolute URLs in app code break under a mount (`<img src="/logo.png">`, `navigate('/about')` outside the router). Imported assets and router-relative navigation are always safe.

### Prerendering for crawlers

Web apps are client-rendered SPAs, and link unfurlers (iMessage, Slack, WhatsApp) and AI/search crawlers (GPTBot, ClaudeBot, Bingbot, Googlebot) don't run JavaScript, so they see only the empty `index.html` shell: no per-page title, description, or Open Graph image. Prerendering fixes this. For opted-in routes, when a bot requests the page the platform serves a cached headless-browser snapshot of the fully-rendered page; real users always get the normal live SPA.

**Opt in** in `web.json` by listing the route globs worth prerendering (shareable/indexable pages, not private or app-like screens):

```json
{
  "web": {
    "prerender": { "paths": ["/u/*", "/blog/*"] }
  }
}
```

`prerender` takes a single field, `paths` — an array of route globs (`*` = one path segment, `**` = any). Only listed routes are ever prerendered, and only routes: a path with a file extension (`/robots.txt`, `/sitemap.xml`) is never prerendered even under `/**`.

**The opt-in alone isn't enough: the SPA has to produce a real page for the snapshot to capture.** For each prerendered route, at runtime:

1. **Set the per-route `<head>`** once the route's data resolves — `<title>`, `<meta name="description">`, and Open Graph / Twitter tags (`og:title`, `og:description`, `og:image`, `twitter:card`, …). Use react-helmet or write to `document` directly. The snapshot captures whatever is in the DOM, so a page that never sets these ends up with a generic card.
2. **Redirect declaratively, never imperatively.** If the route redirects (e.g. a short link), render `<meta http-equiv="refresh" content="0; url=TARGET">` (and/or a visible link) — do **not** call `location.replace(target)`. A DOM snapshot can't capture an imperative navigation; a declarative redirect lets a crawler read your card while a human still bounces to the target.
3. **Signal readiness — required.** Once the head is written and the route's data has resolved, set `document.documentElement.setAttribute('data-prerender-ready', 'true')`. The renderer **waits for this marker** before it snapshots, so it captures the resolved page rather than a loading state. It is **mandatory on every route listed in `prerender.paths`**, including ones that render synchronously (set it as soon as they're ready): a route that never sets the marker times out and produces **no snapshot at all**, so crawlers keep getting the empty shell.

**Keep snapshots fresh.** A deploy re-renders everything automatically. When content behind a prerendered page changes at runtime (a short link retargeted, a post edited), invalidate its snapshot from the mutating backend method:

```typescript
import { prerender } from '@mindstudio-ai/agent';

await prerender.invalidate(['/u/abc']); // omit the argument to purge every snapshot for the app
```

While developing, the `remy-admin prerender` CLI verifies and manages snapshots (run `remy-admin prerender --help`). It's a build-time tool only: a deployed app keeps its snapshots fresh via `prerender.invalidate`, not the CLI.

### Redirects and trailing slashes

When a URL moves, declare it in `web.json` rather than shipping a client-side component that bounces the user — a redirect resolves at the edge of the request, before any JavaScript loads, so crawlers and link unfurlers follow it correctly:

```json
{
  "web": {
    "trailingSlash": "strip",
    "redirects": [
      { "source": "/old-blog/*slug", "destination": "/blog/*slug", "permanent": true },
      { "source": "/pricing-2024", "destination": "/pricing", "permanent": true },
      { "source": "/launch", "destination": "https://example.com/launch", "statusCode": 302 }
    ]
  }
}
```

- `source` — the incoming path pattern, `/`-prefixed. `:name` matches one path segment; `*name` matches one or more.
- `destination` — a path on this app, or an absolute `http(s)` URL. Any `:name` / `*name` it uses must be captured by the `source`.
- `permanent` — `true` sends a 308, `false` a 307. These preserve the request method, unlike 301/302 which browsers may silently turn into a GET. Required unless you set `statusCode`.
- `statusCode` — an explicit `301`, `302`, `307` or `308`, for tooling that insists on the legacy codes. Mutually exclusive with `permanent`.

Rules are checked in order and the first match wins. The request's query string is carried over to the destination unless the destination specifies its own.

**Pattern syntax is path-to-regexp v8, not the Next.js dialect.** If you've written `next.config.js`, the difference will bite you once: Next documents `:slug*` for a multi-segment wildcard and supports inline regex like `:id(\\d+)`. Here the wildcard is `*slug` and inline regex isn't supported. Both legacy forms are rejected at build time with the correct syntax in the error, so you'll find out at deploy rather than in production. Optional segments use braces: `/users{/:id}`.

**`trailingSlash`** declares which form is canonical: `"strip"` sends `/about/` → `/about`, `"append"` does the reverse (skipping the root and any path with a file extension). It's off by default, so both forms serve normally unless you opt in. Normalization and redirect matching resolve together, so `/old-blog/x/` → `/blog/x` is a single hop, and you write your `source` patterns without trailing slashes regardless of the setting.

A redirecting path is never prerendered or served — the redirect wins — so don't list one in `prerender.paths`.

Redirects can't be declared under `/_/`, which is the platform's own namespace (method calls, file reads, auth). Self-referential rules and two-rule loops fail the build.

### Rewrites

A rewrite serves *different content at the same URL* — no redirect, no URL change. This is how a file that lives somewhere other than your build output gets a clean path:

```json
{
  "web": {
    "rewrites": [
      { "source": "/sitemap.xml", "destination": "/_/files/public/site/sitemap.xml" },
      { "source": "/.well-known/ai-plugin.json", "destination": "/_/files/public/site/ai-plugin.json" },
      { "source": "/docs/*rest", "destination": "/help/*rest" }
    ]
  }
}
```

Two kinds of `destination`:

- **`/_/files/public/<store>/<key>`** — the object's bytes are served inline at the requested URL. This is the answer for anything your app *generates* at runtime and uploads: a sitemap with per-entry URLs no static build could enumerate, a generated `robots.txt` or `llms.txt`, a `.well-known/*` file. The store must be **public** — a rewrite serves its bytes to anyone who can reach the URL, so a private object is rejected at build time.
- **Any other path** — served from your build output instead of the requested path. `/docs/*rest` → `/help/*rest` serves the `/help` files under the `/docs` URLs.

`source` patterns use the same syntax as `redirects` (`:name` for one segment, `*name` for many; path-to-regexp v8, not the Next.js dialect). First match wins.

Objects above 10 MB fall back to a redirect to the CDN rather than being served through the origin — fine for documents, worth knowing if you rewrite something large.

Rewriting to an **external URL is not supported**: use `mounts` to serve another app of yours under a path prefix. Rewriting to other `/_/` surfaces (a method, your REST API) isn't supported yet either.

**Ordering.** Redirects resolve before everything; rewrites resolve at the content lookup, after prerendering. So a path with both a redirect and a rewrite gets the redirect, and a prerendered page is identified by the URL the crawler asked for rather than the rewritten target.

### Mounting other apps

A web interface can serve **other apps from the same workspace under path prefixes of its own hosts** (the multi-zone pattern). A marketing site at `example.com` can serve a self-contained demo app (its own backend, database, and deploys) at `example.com/demos/vector-search` instead of linking out to the demo's subdomain:

```json
{
  "web": {
    "mounts": [
      { "path": "/demos/vector-search", "app": "vector-search-demo" }
    ]
  }
}
```

- `path` — the mount prefix on this app's hosts. Non-root, and mounts must be disjoint (no mount may prefix another).
- `app` — the target app's `custom_subdomain` or appId. Must be a v2 app in the same workspace; validated at build.

Under the mount, everything is the child's: its live web bundle, its session (so its backend methods, auth, agent chat, uploads, and telemetry all run against the child app), its frame policy, its prerendering. The child needs no mount-specific configuration — its own `web.json` is what applies. It keeps working at its own subdomain unchanged, and the same app can be mounted at different paths by different parents. Deploys are independent: pushing the child updates it everywhere it's mounted.

**Mount-safety.** A mountable child must follow the standard conventions above: assets via `MS_ASSET_BASE_URL`, router basename from `platform.basePath`, no hardcoded root-absolute URLs. The parent's build log warns when a mount target's current build isn't mount-safe.

**Prerendering is the child's.** The child's own `prerender.paths` gates its mounted pages, so a child that declares `/blog/*` gets crawler snapshots at `example.com/demos/vector-search/blog/x` with no parent configuration. Snapshots are keyed to the child's release: a child deploy refreshes them, and `prerender.invalidate(['/blog/x'])` from the child purges its mounted copies along with its own. The parent's `prerender.paths` covers only the parent's own routes.

**SEO under a mount is yours to wire, and it's two steps.** The platform serves the child's pages at the mounted URLs; it does not edit either app's SEO files.

- **In the child**, generate its sitemap with the *mounted* URLs. A sitemap built from the child's own hostname advertises a surface you don't want indexed, so point whatever base URL your generator uses at the mount. Expose it at a clean path with a rewrite (see "Rewrites") if the file doesn't live in your build output.
- **In the parent**, advertise it: add a `Sitemap:` line to the parent's `robots.txt`, or nest the child's sitemap in the parent's sitemap index. The person adding a mount is the person who can add that line, so there's nothing to coordinate.
- **Write per-route canonicals from the page's own location**, not a hardcoded absolute URL. A canonical pointing at the child's own host tells crawlers to consolidate there and undoes the mount; the parent's build log warns when a target's `index.html` hardcodes one.

Notes:
- **One signed-in state per host.** The auth cookie is per-host, so a parent and a mounted child that both use login on the same host will sign each other out. Mount auth-enabled apps only when the parent doesn't use auth (or vice versa).
- A mount whose target has no live web build yet falls through to the parent's SPA until the child deploys one.
- Mounts are single-level: a mounted child's own `mounts` are not served under the parent.
- **Redirects, rewrites and `trailingSlash` follow the same rule as prerendering**: within the mount prefix, the child's config applies, written against the child's own paths (`/old`, not `/demos/vector-search/old`). Redirect destinations get the mount prefix added back; rewrite destinations resolve against the child's own build output and file store. A parent can't route inside a prefix it has handed to a child.

---

## API Interface

Exposes selected methods as REST endpoints with clean URLs and HTTP methods, for external consumers (other services, mobile apps, integrations). The API interface lives at `/_/api/`, separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly).

Use it for anything external: a Stripe webhook endpoint, sync endpoints for another service, a public REST API, a batch export tool. Not every method needs an API route; expose only what external consumers need.

### Spec: `src/interfaces/api.md`

Routes are declared as `VERB /path → methodExportName` under resource headings, with annotations for params:

```markdown
---
name: Vendor Management API
description: API for managing vendors and purchase orders.
type: interface/api
---

## Vendors

### List vendors
GET /vendors → listVendors
~~~
Returns all vendors, optionally filtered by status.
query: status (string, optional) — filter by vendor status
~~~

### Create vendor
POST /vendors → submitVendorRequest
~~~
Submit a new vendor for approval.
body: name (string, required) — vendor name
      contactEmail (string, required) — billing contact
~~~

### Delete vendor
DELETE /vendors/:vendorId → deleteVendor
~~~
path: vendorId (string, required) — the vendor's unique identifier
~~~
```

### Compiled Output: `dist/interfaces/api/api.json`

Remy compiles the spec into structured config the platform reads for routing and OpenAPI generation:

```json
{
  "api": {
    "name": "Vendor Management API",
    "description": "API for managing vendors and purchase orders.",
    "routes": [
      {
        "method": "GET",
        "path": "/vendors",
        "handler": "list-vendors",
        "summary": "List vendors",
        "description": "Returns all vendors, optionally filtered by status.",
        "tag": "Vendors",
        "params": {
          "query": {
            "status": { "type": "string", "required": false, "description": "Filter by vendor status" }
          }
        }
      },
      {
        "method": "POST",
        "path": "/vendors",
        "handler": "submit-vendor-request",
        "summary": "Create vendor",
        "description": "Submit a new vendor for approval.",
        "tag": "Vendors",
        "params": {
          "body": {
            "name": { "type": "string", "required": true, "description": "Vendor name" },
            "contactEmail": { "type": "string", "required": true, "description": "Billing contact" }
          }
        }
      },
      {
        "method": "DELETE",
        "path": "/vendors/:vendorId",
        "handler": "delete-vendor",
        "summary": "Delete vendor",
        "tag": "Vendors",
        "params": {
          "path": {
            "vendorId": { "type": "string", "required": true, "description": "The vendor's unique identifier" }
          }
        }
      }
    ]
  }
}
```

### Platform Behavior

- **Path params** extracted and merged into method input: `DELETE /_/api/vendors/abc` → `deleteVendor({ vendorId: "abc" })`
- **Query params** merged into input for GET: `?status=approved` → `listVendors({ status: "approved" })`
- **Request body** for POST/PUT/PATCH is the input directly (no wrapper)
- **Response** is the method output directly (no wrapper)
- **Auth** via `Authorization: Bearer sk_...`
- **Streaming**: `Accept: text/event-stream` header returns SSE chunks

### Usage

```bash
# Create a vendor
curl -X POST https://{app-subdomain}.mindstudio.ai/_/api/vendors \
  -H "Authorization: Bearer sk_..." \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme", "contactEmail": "billing@acme.com" }'
# → { "vendorId": "...", "status": "pending" }

# List vendors
curl https://{app-subdomain}.mindstudio.ai/_/api/vendors?status=approved \
  -H "Authorization: Bearer sk_..."
# → { "vendors": [...] }

# Delete
curl -X DELETE https://{app-subdomain}.mindstudio.ai/_/api/vendors/abc123 \
  -H "Authorization: Bearer sk_..."
# → { "deleted": true }
```

### Manifest

```json
{ "type": "api", "path": "dist/interfaces/api/api.json" }
```

---

## Cron

Scheduled method execution.

### Config (`interface.json`)

```json
{
  "jobs": [
    {
      "schedule": "0 9 * * 5",
      "method": "process-weekly-payments",
      "description": "Process approved invoices every Friday at 9am"
    },
    {
      "schedule": "*/30 * * * *",
      "method": "sync-vendor-status",
      "description": "Sync vendor statuses every 30 minutes"
    }
  ]
}
```

Standard cron expression format. Jobs are synced to the platform on deploy.

---

## Webhook

Inbound HTTP endpoints that invoke a method directly and synchronously: the caller waits for the method to finish and gets its output back. Use them to receive webhooks from external services (Stripe, GitHub, Shopify, Slack, Twilio). Direct inbound webhooks with signature verification work natively; don't build confirmation-token or polling workarounds.

### Config (`interface.json`)

The config file's top-level key must match the interface type (`webhook`):

```json
{
  "webhook": {
    "endpoints": [
      {
        "method": "handle-payment-webhook",
        "secret": "whsec_pick_a_long_random_token",
        "description": "Stripe events"
      }
    ]
  }
}
```

- `method` — the id of a method in `methods[]` to invoke.
- `secret` — a developer-chosen opaque token that is both the routing key and the access guard. It is stable across deploys (compilation is a passthrough — redeploying never rotates it), so a URL you register with Stripe/GitHub stays valid. Generate one long random value per endpoint and keep it constant.
- You can declare multiple endpoints; each `secret` maps to one method.

### Endpoint URL

Register this URL with the external service: `https://{app-host}/_/webhook/{secret}` — `{app-host}` is any host the app is served on: its `custom_subdomain` host (e.g. `myapp.madewithremy.com`), a custom domain if configured, or the UUID host (`<appId>.madewithremy.com` / `.msagent.ai`). All HTTP verbs are accepted.

### Input

The method receives:

```ts
{
  method: string;                  // HTTP method
  headers: Record<string, string>; // request headers
  query: Record<string, string>;   // query params
  body: any;                       // parsed JSON / form body
  rawBody: string;                 // exact raw request bytes (UTF-8), pre-parse
}
```

For signature verification, always use `rawBody`, never `body` — providers (Stripe, GitHub, Shopify, Slack) HMAC the raw payload, and a re-serialized `body` will not match. Example: `stripe.webhooks.constructEvent(input.rawBody, input.headers['stripe-signature'], endpointSecret)`. `rawBody` is populated for `application/json` and `application/x-www-form-urlencoded` request bodies (what those providers send).

### Response

Whatever the method returns as output is sent back as JSON to the caller; if it returns no output, the platform responds `204`. A wrong/unknown secret returns `401`; an app with no live release returns `404`.

---

## Email

Inbound email triggers. Each app has one email-handler method, and the platform routes all inbound mail for the app to it, across every address tier.

### Address tiers

Apps can receive mail at three kinds of addresses, all delivered to the same handler:

| Tier | Address | Setup |
|---|---|---|
| Platform subdomain (default) | `*@<custom_subdomain>.madewithremy.com` | Automatic once the app has a custom subdomain set. Catchall — every address delivers to your method. |
| Custom domain | `*@<your-domain>` | Add the domain in the dashboard's email-domains settings; paste one MX record (`mx.msagent.ai`) at your DNS provider. Catchall. |
| Legacy `mindstudio-hooks.com` | `<name>@mindstudio-hooks.com` | Existing apps only. Frozen for new apps. |

The new tiers are catchall, so `to` carries an arbitrary localpart. If your method needs to branch on it, read `input.to` (e.g. `if (input.to.startsWith('support@')) ...`).

A verified custom domain (and your app's `madewithremy.com` subdomain) also **sends** outbound mail. `sendEmail` picks your app's own-brand sender automatically, configured in the dashboard's **Email** settings.

### Config (`interface.json`)

```json
{
  "email": {
    "method": "handle-inbound-email",
    "approvedSenders": ["billing@vendor.com", "*@trusted-partner.com"]
  }
}
```

`approvedSenders` is optional. When set, only senders matching an exact address or `*@domain.com` wildcard reach the method; everything else is rejected by the platform with `400 invalid_sender` before the method runs. Matching is case-insensitive. Applies uniformly across all three tiers.

### Input shape

```ts
{
  to: string;               // full recipient address; localpart is arbitrary on catchall tiers
  from: string;             // bare sender address, extracted from "Name <a@b>" form
  fromName: string | null;  // sender display name, or null
  subject: string;          // 'No Subject' if missing
  message: string;          // plain-text body, falls back to HTML if text is missing; 'No Body' if neither was sent
  html: string;             // HTML body, or '' when text-only
  attachments: string[];    // CDN URLs — already uploaded by the platform
  messageId: string | null; // this email's Message-ID, angle-bracketed (<id@host>)
  inReplyTo: string | null; // Message-ID this email is replying to, if any
  references: string[];     // prior Message-IDs in the thread (angle-bracketed); [] if none
  replyTo: string | null;   // Reply-To address — reply here, not `from`, when set
  cc: string[];             // Cc recipient addresses
  date: string | null;      // original send time, ISO-8601
}
```

To reply in-thread, feed these into `sendEmail`: set `inReplyTo` to the incoming `messageId` and `references` to `[...references, messageId]`. Send to `replyTo` when it's set, otherwise `from`. `sendEmail` returns `{ recipients, cc, bcc, from }` (who it sent to + the sender used); it does not return the sent message's own `Message-ID`, so thread off *inbound* mail, not off messages you sent.

Max inbound size is 25 MB total. Oversized messages are rejected by the platform before the method runs.

---

## MCP (Model Context Protocol)

Expose the app to *external* AI agents — Claude Desktop, Cursor, anything that speaks MCP. Unlike the agent interface (which *is* an agent, with its own LLM and chat UI), MCP has no model of its own; it's the app projected as an MCP server for an outside AI to drive. It supports the full MCP feature set: **tools** (methods the agent calls), **resources** (read-only data the agent reads into context), **prompts** (reusable templates), and server **instructions** (toolset-level guidance shown to the calling agent).

The platform hosts the server at `POST https://{app-host}/_/mcp` (where MCP clients connect), handles auth like the API interface (optional — a `Bearer` key resolves to a user with full RBAC, or calls run anonymously), and derives each tool's input schema from the method contract. Write the descriptions for a stranger with no app context: they're all the calling agent has to decide what to invoke.

### Spec File: `src/interfaces/mcp.md`

Frontmatter declares the server. The body's intro prose becomes the server `instructions`; `## Tools`, `## Resources`, and `## Prompts` sections declare the rest.

```yaml
---
name: Vendor Management
description: Tools and data for managing vendors and purchase orders.
type: interface/mcp
---
```

```markdown
This server manages vendors and purchase orders. Read a vendor before updating it.

## Tools

### List vendors
method: list-vendors
annotations: readOnly
~~~
List all vendors, newest first. Read-only.
~~~

## Resources

- list-vendors → app://vendors — "Vendors" — all vendors (application/json)
- get-vendor → app://vendors/{id} — "Vendor" — a single vendor by id (application/json)

## Prompts

### draft_vendor_email
description: Draft an outreach email to a vendor.
arguments: vendorId (required) — the vendor to contact
~~~
Write a warm outreach email to vendor {{vendorId}}.
~~~
```

### Compiled Output: `dist/interfaces/mcp/`

```
dist/interfaces/mcp/
├── interface.json      ← config the platform reads
├── instructions.md     ← server-level guidance (returned in `initialize`)
├── tools/
│   └── listVendors.md  ← rich description, one per tool
└── prompts/
    └── draftVendorEmail.md   ← prompt template body, one per prompt
```

Resources carry inline metadata only — no per-resource file. Don't hand-author input schemas; the platform derives them from the method contract.

### Config (`interface.json`)

```json
{
  "mcp": {
    "name": "Vendor Management",
    "description": "Tools and data for managing vendors and purchase orders.",
    "instructions": "instructions.md",
    "tools": [
      {
        "method": "list-vendors",
        "title": "List Vendors",
        "description": "tools/listVendors.md",
        "annotations": { "readOnly": true }
      }
    ],
    "resources": [
      { "method": "list-vendors", "uri": "app://vendors", "name": "Vendors", "description": "All vendors.", "mimeType": "application/json" },
      { "method": "get-vendor", "uriTemplate": "app://vendors/{id}", "name": "Vendor", "description": "A single vendor by id.", "mimeType": "application/json" }
    ],
    "prompts": [
      {
        "name": "draft_vendor_email",
        "title": "Draft vendor email",
        "description": "Draft an outreach email to a vendor.",
        "arguments": [ { "name": "vendorId", "description": "The vendor to contact", "required": true } ],
        "template": "prompts/draftVendorEmail.md"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `name`, `description` | Server display name + registry metadata (not shown to the calling agent) |
| `instructions` | Relative path to the server-level guidance returned in `initialize` |
| `tools[].method` | Method `id` from `mindstudio.json` (kebab-case) |
| `tools[].name` | Tool name exposed to clients. Optional — defaults to the method `id`; must match `[a-zA-Z0-9_-]` and be unique |
| `tools[].title` | Optional human-friendly display name |
| `tools[].description` | Relative path to the tool's markdown description |
| `tools[].annotations` | Optional client hints (auto-call vs. confirm): `readOnly`, `destructive`, `idempotent`, `openWorld` (map to MCP's `readOnlyHint` etc.) |
| `resources[].method` | The read method invoked when the resource is read |
| `resources[].uri` / `uriTemplate` | A static URI, or a template whose `{param}` maps to the method's input |
| `resources[].name`, `description`, `mimeType` | Resource metadata |
| `prompts[]` | `name`, `title`, `description`, `arguments` (`[{ name, description?, required? }]`), and `template` (path to the body, with `{{arg}}` placeholders) |

**Behavior:** `tools/list` is static; access is enforced per-method at call time (a gated tool is listed but rejects an unauthorized call). A resource read invokes the backing method (template `{param}`s come from the URI). `prompts/get` fills the template with the supplied arguments. There is no `inputSchema` field — the platform derives it from the method contract.

### Manifest

```json
{ "type": "mcp", "path": "dist/interfaces/mcp/interface.json" }
```

---

## Agent (Conversational Interface)

A conversational interface where an LLM has access to the app's methods as tools. Unlike MCP (which exposes methods for external agents to call), the agent interface IS the agent — it has its own personality, system prompt, and model config, and orchestrates tool calls against the app's methods internally.

The developer authors the agent's character and behavior in MSFM (`src/interfaces/agent.md`), and the build agent compiles that into a system prompt and tool descriptions (`dist/interfaces/agent/`).

### Spec File: `src/interfaces/agent.md`

The human-readable spec. Frontmatter contains structured fields (rendered with dedicated UI in the editor); the prose body is the behavioral spec — voice, personality, capabilities, rules.

```yaml
---
name: Todo Assistant
model: {"model": "claude-4-5-haiku", "temperature": 0.5, "maxResponseTokens": 16000}
description: Conversational agent that helps users manage their to-do list.
---
```

| Field | Description |
|-------|-------------|
| `name` | Agent display name |
| `model` | JSON string — `model` (MindStudio model ID), `temperature`, `maxResponseTokens`, and optional `config` (model-specific settings like `reasoning`, `tools`, etc.). Query the MindStudio SDK for available model IDs and config options. |
| `description` | One-liner for agent card/listing |

The body uses standard MSFM. Typical sections: Voice & Personality, Capabilities, Behavior — whatever structure serves the agent's character.

### Compiled Output: `dist/interfaces/agent/`

The build agent compiles the MSFM spec into:

```
dist/interfaces/agent/
├── agent.json          ← config the platform compiler reads
├── system.md           ← compiled system prompt
└── tools/
    ├── createTodo.md   ← rich tool description per method
    ├── listTodos.md
    └── ...
```

- **`system.md`** — the full system prompt, compiled from the MSFM spec. Contains personality, behavioral rules, formatting preferences.
- **`tools/*.md`** — one per tool. Contains parameter docs, usage guidance, examples, edge cases. Richer than a JSON schema description string.

### Config (`agent.json`)

```json
{
  "agent": {
    "model": "claude-4-5-haiku",
    "temperature": 0.5,
    "maxTokens": 16000,
    "systemPrompt": "system.md",
    "auth": { "requireUser": true },
    "tools": [
      { "method": "create-todo", "description": "tools/createTodo.md" },
      { "method": "list-todos", "description": "tools/listTodos.md" }
    ],
    "webInterfacePath": "/chat"
  }
}
```

| Field | Description |
|-------|-------------|
| `model` | MindStudio model ID (e.g. `claude-4-5-haiku`, `claude-4-6-sonnet`) |
| `temperature` | Model temperature |
| `maxTokens` | Max response tokens |
| `systemPrompt` | Relative path to the compiled system prompt markdown file |
| `auth` | **Required.** Who may open the lobby: `{ "requireUser": boolean, "requireRole"?: string[] }`. See Auth below. |
| `tools` | Array of tool entries. `method` references a method `id` from `mindstudio.json`. `description` is a relative path to a markdown file with rich tool docs. A browser-side tool sets `target: "client"` with `name` + `inputSchema` instead of `method` — see Client tools below. |
| `webInterfacePath` | Optional. If the app has a web interface with a chat page, this path tells the IDE where to show the agent preview. |

### Auth

**Every agent config declares an `auth` block.** Agent chat spends the owner's money on every message without necessarily touching a backend method, so the platform gates the lobby itself, at thread creation and at message send. `requireUser: true` limits chat to authenticated app users; `requireRole` (optional, requires `requireUser: true`) additionally demands at least one of the listed manifest role ids (OR semantics, matching the backend `auth.requireRole(...)`). Unknown role ids fail the build. Denials surface to the frontend SDK as `MindStudioInterfaceError` with code `auth_required` (401) or `role_required` (403). Dev preview is exempt. Older compiled apps without the block fall back to the manifest's `auth.enabled`.

Once inside, agent chat runs as the **authenticated user**, not as a system role — tool calls carry that user's roles, so method-level `auth.requireRole` checks behave exactly as they would from the web frontend. Anonymous visitors (when allowed) are scoped by a per-browser visitor identity: their threads are private to their browser, and gated methods still reject.

### Client tools

Most tools are methods — the agent calls the backend. A tool whose effect lives in the user's browser (open a sheet, pick a file, confirm an action) declares `target: "client"` instead, with a `name` and an inline `inputSchema` in place of a `method`:

```json
{
  "target": "client",
  "name": "pickFile",
  "description": "tools/pickFile.md",
  "inputSchema": { "type": "object", "properties": { "prompt": { "type": "string" } } }
}
```

The name must not collide with a method id, and the schema is authored by hand — there's no method contract to derive it from. The frontend registers a handler, and **its return value is the tool result**:

```ts
chat.registerClientTool('pickFile', async ({ prompt }) => {
  const file = await openFilePicker(prompt);
  return file ? { path: file.path } : { cancelled: true };
});
```

The agent holds its turn while the handler runs, for up to 15 minutes. That bound is deliberately generous: a handler can resolve from a dialog's Save button, so "propose an action, wait for a human to approve it, then report" is a client tool rather than something you build a queue and a status table for.

Every path answers, so the agent is never left hanging: the return value, `{ error: <message> }` if the handler throws, `result_too_large` past ~32KB serialized, `unhandled_client_tool` immediately when no handler is registered for the name, and `client_timeout` / `client_disconnected` when the window passes or the page goes away. The error shapes are the ones a failed method call already produces, so the agent reasons about them the same way.

Client tools never touch the backend, which also means they carry none of a method's guarantees — no roles check, no audit row, no billing. Anything that must be true regardless of what the page does belongs in a method.

### Conversation log

Every thread the deployed agent has had is readable by the workspace — `remy-admin agent threads list` for the log, `agent threads get <threadId>` for one conversation's full transcript, messages and tool calls included. It's the sibling of the voice call log, and it's the feedback loop for the spec: read what the agent actually said and which tools it actually called, then fix the prompt from that rather than from guesses. Each method tool call in a transcript carries the `requestId` of its request-log row, so a bad answer traces back to the method call that produced it.

### Manifest

```json
{ "type": "agent", "path": "dist/interfaces/agent/agent.json" }
```

---

## Voice (Realtime Conversation)

A realtime voice interface: the user talks to the app and the app's voice agent talks back, sub-second and interruptible mid-sentence, with the app's methods available as tools mid-conversation. It is a sibling of the agent interface, not a mode of it. Both are an LLM projecting the backend contract into conversation, but everything the author touches differs: the persona is written for the ear, the toolset is smaller and curated for conversational latency, and every tool carries a **latency class** that governs how the agent handles the wait out loud.

The developer authors the spec in MSFM (`src/interfaces/voice.md`); the build agent compiles it into a voice-register system prompt and tool descriptions (`dist/interfaces/voice/`). The platform handles the realtime media transport, turn detection, barge-in, transcripts, and session limits.

### Spec File: `src/interfaces/voice.md`

Frontmatter holds the structured fields; the prose body is the persona; a `## Tools` section declares the toolset explicitly.

```yaml
---
name: Front Desk
description: Books appointments and answers questions by voice.
type: interface/voice
model: {"model": "gpt-realtime-mini", "voice": "marin"}
turnDetection: {"eagerness": "medium"}
greeting: Hey! I can help you book, reschedule, or answer questions — what do you need?
---
```

| Field | Description |
|-------|-------------|
| `name` | Agent display name |
| `description` | One-liner for listings |
| `model` | JSON string. Native speech-to-speech: `{"model": <realtime model id>, "voice": <voice id>}`. Cascaded pipeline (any chat model behind a voice): `{"llm": <chat model id>, "stt": <transcription model id>, "tts": <speech model id>, "voice": <voice id>}` — the blessed streaming pairing is `"stt": "deepgram-nova-3", "tts": "cartesia-sonic-3"`; ElevenLabs TTS (`"tts": "elevenlabs-tts"`) is also wired. Query the MindStudio SDK for available ids — realtime, transcription, and speech models are separate catalogs. |
| `turnDetection` | Optional. `{"eagerness": "low" \| "medium" \| "high"}` — how quickly the platform decides the user has finished speaking. High is snappier; low is more patient (better when users dictate numbers or addresses). Default `medium`. Not yet wired on Gemini realtime engines (a no-op there). |
| `greeting` | Optional. A spoken opener delivered when the session starts. Omit it and the agent waits for the user to speak first. Verbatim on cascaded engines; model-spoken (may paraphrase slightly) on speech-to-speech. |

The body is a character brief in the **voice register** (how the agent sounds, what it cares about, how it behaves), plus the explicit toolset:

```markdown
## Tools

### Book appointment
method: book-appointment
latency: slow
~~~
Book an appointment once the caller has confirmed a date, time, and service.
Read the details back and get a yes before calling. Say the confirmation
naturally ("You're all set for Tuesday the 4th at 2pm") — never read the
booking id aloud unless asked.
~~~
```

### Latency Classes

Each tool declares how the agent should handle the wait, because in a live conversation silence reads as a dropped call:

| Class | When | Behavior |
|-------|------|----------|
| `fast` | Sub-second reads (lookups, availability checks) | Call silently — a preamble would add more delay than the tool |
| `slow` | Noticeable wait, roughly 1–3s (writes, searches) | Speak a one-line preamble ("Let me get that booked") generated in parallel with the call |
| `background` | Long-running work (reports, enrichment, bulk operations) | Acknowledge, keep conversing, report the result when it lands; cancellable if the user changes course |

### Compiled Output: `dist/interfaces/voice/`

```
dist/interfaces/voice/
├── interface.json      ← config the platform reads
├── system.md           ← compiled voice-register system prompt
└── tools/
    └── bookAppointment.md   ← rich tool description, one per tool
```

### Config (`interface.json`)

The top-level key must match the interface type (`voice`):

```json
{
  "voice": {
    "name": "Front Desk",
    "description": "Books appointments and answers questions by voice.",
    "model": "gpt-realtime-mini",
    "voice": "marin",
    "turnDetection": { "eagerness": "medium" },
    "greeting": "Hey! I can help you book, reschedule, or answer questions — what do you need?",
    "systemPrompt": "system.md",
    "auth": { "requireUser": true },
    "tools": [
      { "method": "book-appointment", "latency": "slow", "description": "tools/bookAppointment.md" }
    ],
    "webInterfacePath": "/"
  }
}
```

| Field | Description |
|-------|-------------|
| `model` | Realtime model id (native speech-to-speech). Mutually exclusive with `llm`/`stt`/`tts`. |
| `llm`, `stt`, `tts` | The cascaded alternative: a chat model id plus streaming transcription and speech model ids. |
| `voice` | Provider voice id (model-specific). |
| `turnDetection` | `{ "eagerness": "low" \| "medium" \| "high" }`, optional. |
| `greeting` | Optional spoken opener. |
| `systemPrompt` | Relative path to the compiled system prompt. |
| `auth` | **Required.** Who may start a session: `{ "requireUser": boolean, "requireRole"?: string[] }`. See Platform Behavior below. |
| `phone` | Optional telephony options: `{ "trustCallerId"?: boolean }` — see Inbound calls below. |
| `context` | Optional session context: `{ "method": <method id> }` — the platform auto-fires this backend method in the background at session start (and again after in-call verification) and appends its string return to the system prompt as a `## Session Context` block. Runs as the session user with normal RBAC; capped at 4KB; failures degrade to the generic prompt. Use for always-relevant situational state; tools remain the on-demand path. |
| `tools` | `{ method, latency, description }` — method `id` from the manifest, a latency class, and a relative path to the tool's markdown description. |
| `webInterfacePath` | Optional. Where the voice layer lives in the web interface, for the editor preview. |

There is no input-schema field — the platform derives each tool's schema from the method contract. At runtime the platform appends a `## Current User` block (email, phone, roles) to the system prompt; don't author a placeholder for it.

### Frontend SDK: `createVoiceClient()`

The voice client ships as a subpath of the interface SDK so apps that never use voice pay nothing for it:

```typescript
import { createVoiceClient } from '@mindstudio-ai/interface/voice';

const voice = createVoiceClient();

// Prompts for microphone permission, mints a session, connects.
// Throws MindStudioInterfaceError('microphone_denied') on refusal.
const session = await voice.startSession();

session.state;  // 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended'
session.on('stateChange', (state) => { });          // on() returns an unsubscribe fn

// Live captions, both sides. Each event carries the segment's FULL text so
// far (never a delta) — render by upserting on segmentId, not appending.
session.on('transcript', ({ role, segmentId, text, final }) => { });

session.on('toolCall', ({ method, status }) => { }); // 'running' | 'done' | 'failed'
session.on('error', (err) => { });

session.mute(); session.unmute(); session.isMuted;
session.sendText('123 Main Street');  // inject text into the live conversation (addresses, codes)

// Client tools (voice.md `target: "client"`) — the browser-side sibling of the
// agent interface's, with the same return-value-is-the-result contract. Bounded
// at 30s here rather than minutes: silence on a live call reads as a dropped
// one, and long work belongs in a `background` backend tool instead.
session.registerClientTool('showVerification', async (args) => {
  openVerifySheet(args);
  return { opened: true };
});

session.end();
```

The SDK handles agent audio playback internally (a hidden autoplaying element); apps never create audio elements for the agent. Besides `microphone_denied`, `startSession()` throws `MindStudioInterfaceError` with code `voice_concurrency_limit` / `voice_visitor_limit` when the app's session limits are hit, and `auth_required` (401) / `role_required` (403) when the interface's `auth` block denies the caller.

Past sessions are available as call records with transcripts:

```typescript
const { sessions } = await voice.listSessions();
const full = await voice.getSession(sessions[0].id);  // includes transcript
```

### Platform Behavior

- **Auth**: the config's **required** `auth` block gates session creation — `requireUser: true` limits sessions to authenticated app users, `requireRole` (optional, requires `requireUser: true`) demands at least one of the listed manifest role ids (OR semantics, matching the backend `auth.requireRole(...)`; unknown ids fail the build). Dev preview is exempt; older compiled apps without the block fall back to the manifest's `auth.enabled`. Once inside, sessions run as the **authenticated user** — tool calls carry that user's roles, exactly like the agent interface and the web frontend. Anonymous sessions (when `requireUser: false`) run with no user and no roles, so gated methods reject, and their call history is scoped to the browser's visitor identity.
- User-side transcripts come from a separate recognition pass and can differ slightly from what the model actually heard — treat them as history, never as input to logic.
- Sessions are subject to per-app concurrency limits and a maximum duration; both are configurable in the app's settings. Voice minutes and model usage are metered.

### Outbound calls (`voice.call`)

Backend methods and crons can place outbound phone calls via the agent SDK's `voice` namespace — the platform dials the number and connects the callee to the app's voice agent:

```ts
import { voice, auth } from '@mindstudio-ai/agent';

export async function callMeAboutMyOrder(input: { phone: string }) {
  auth.requireRole('member');
  return await voice.call({ to: input.phone, assumeIdentity: true });
}
```

The invoking method is the authorization gate (the interface `auth` block does not apply to calls the backend places deliberately). `assumeIdentity: true` runs the call as the invoking user — Current User block and tool RBAC — regardless of the number dialed; system/cron invocations always run anonymously.

Deployed apps require a **dedicated phone number** (attached in app settings, $1/month), which becomes the caller ID everywhere, dev sessions included. Without one, dev sessions use a shared platform test number under tighter limits, and production calls throw `phone_out_requires_dedicated_number`.

`voice.call` returns at dial time (`{ sessionId, status: 'dialing', from, to }`); the outcome (answered/busy/no-answer) lands on the call record. Limits: the app's concurrency policy, a daily outbound cap, a per-call duration ceiling, one active call per callee. Compliance: automated calls require the callee's prior consent (TCPA) — call your own opted-in users, honor calling hours, never dial cold lists.

### Inbound calls

An app with a dedicated number also answers it, with the same voice agent and the same tools. Inbound always runs the **live release** (test over the editor's WebRTC session; there is no dev inbound).

The `auth` block still applies, but a call can't show a login page, so `requireUser` becomes answer-then-verify: callers start anonymous, and the agent offers in-call verification through the app's own auth methods. SMS codes go to the number the caller is calling from; email verification matches the spoken address against existing accounts (transcription-tolerant) and emails the stored address. Existing accounts only, and the flow never confirms whether an account exists. Once verified, the running session upgrades to that user mid-call.

`phone: { "trustCallerId": true }` lets a caller whose number exactly matches an app user's phone skip verification. Caller ID is spoofable, so this is an explicit tradeoff for low-stakes, convenience-first apps; it lives in the interface config so enabling it is a reviewed, deploy-audited code change.

Numbers, the call log (with transcripts), and voice policy settings are all manageable from the `mindstudio-prod voice` CLI family (`voice numbers search/buy/release/set-name`, `voice sessions list/get`, `voice settings get/set` — `set` merges, so only the settings you pass change). Buying a number is a recurring $1/month charge — agents must get the user's explicit confirmation first.

### Manifest

```json
{ "type": "voice", "path": "dist/interfaces/voice/interface.json" }
```

---

## Interface Configs in the Manifest

Each interface is declared in `mindstudio.json`:

```json
{
  "interfaces": [
    { "type": "web", "path": "dist/interfaces/web/web.json" },
    { "type": "api" },
    { "type": "cron", "path": "dist/interfaces/cron/interface.json" },
    { "type": "webhook", "path": "dist/interfaces/webhook/interface.json" },
    { "type": "email", "path": "dist/interfaces/email/interface.json" },
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" },
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" },
    { "type": "voice", "path": "dist/interfaces/voice/interface.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file; declaring the type is enough. Others need a config to specify which methods to expose, command mappings, schedules, etc.

Set `"enabled": false` to skip an interface during build without removing it from the manifest.
