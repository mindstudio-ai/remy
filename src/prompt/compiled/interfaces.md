# Interfaces

Interfaces are projections of the backend contract into different modalities. The same methods power all of them. An interface can be as complex and polished as you want, but it's always safe — the backend contract is where anything real happens. The interface can't break business logic or corrupt data.

All external service connections (webhook secrets, email addresses) are configured at the project level by the user through the Remy platform. The agent's job is to write the config files and the methods that handle the requests — not to manage API keys, OAuth flows, or service registration.

`{app-host}`, where it appears in a URL below, means any host the app is served on: its `custom_subdomain` host (e.g. `myapp.madewithremy.com`), a custom domain if one is configured, or the UUID host (`<appId>.madewithremy.com` / `.msagent.ai`).

## Web Interface

A full web application — typically Vite + React, but any framework that produces static output works.

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
| `prerender` | `object` | — | Opt into prerendering the listed routes/patterns for crawlers/unfurlers. See "Prerendering" below. |
| `mounts` | `array` | — | Serve other same-workspace apps under path prefixes of this app's hosts. See "Mounting other apps" below. |
| `redirects` | `array` | — | Path-level redirects. See "Redirects" below. |
| `rewrites` | `array` | — | Serve different content at the same URL. See "Rewrites" below. |
| `trailingSlash` | `"strip"` \| `"append"` | — | Enforce a canonical trailing-slash form with a 308. Off by default. |

### Frontend SDK

```typescript
import { createClient, platform, auth } from '@mindstudio-ai/interface';

// Typed RPC to backend methods — use the camelCase export function names,
// NOT the kebab-case method IDs from mindstudio.json. The client maps
// export names to method IDs automatically.
const api = createClient<{
  submitVendorRequest(input: { name: string }): Promise<{ vendorId: string }>;
  listVendors(): Promise<{ vendors: Vendor[] }>;
}>();

const { vendorId } = await api.submitVendorRequest({ name: 'Acme' });
const { vendors } = await api.listVendors();

// File upload → client-direct to the app's file store (load the `files` skill for the backend side).
// A backend method mints an upload token; the browser uploads straight to storage.
const token = await api.getUploadSlot({ filename: file.name, contentType: file.type });
const { key, url } = await platform.upload(token, file);

// With progress + abort
const controller = new AbortController();
const { url } = await platform.upload(token, file, {
  signal: controller.signal,
  onProgress: (fraction) => setProgress(fraction), // 0 to 1
});
controller.abort(); // cancels the upload

// Auth (for apps with auth enabled in manifest)
auth.getCurrentUser()               // AppUser { id, email, phone, roles, createdAt } | null
auth.currentUser                    // same as getCurrentUser() (sync getter)
auth.isAuthenticated()              // boolean
auth.onAuthStateChanged(cb)         // fires immediately + on transitions; returns unsubscribe
auth.logout()                       // clears session
// Verification flows (send/verify email + SMS codes, delegated sign-in, API keys)
// are in the `auth` skill — load it before building login/signup.
```

For apps with an agent interface, the SDK also provides `createAgentChatClient()` for thread management and streaming chat. Load the `agentInterfaces` skill for its usage — thread APIs, streaming callbacks, and attachments are all there.

For apps with a voice interface, `createVoiceClient()` lives on the `@mindstudio-ai/interface/voice` subpath (deliberately separate so non-voice apps ship none of it). Load the `voiceInterfaces` skill for its usage — session lifecycle, live-caption events, tool status, and the voice-UI patterns are all there.

The project uses `"jsx": "react-jsx"` (automatic JSX transform) — do not `import React from 'react'`. Only import the specific hooks and types you need (e.g., `import { useState, useEffect } from 'react'`).

On deploy, the platform runs `npm install && npm run build` in the web directory and hosts the output on CDN.

Two serving conventions: set the bundler's public path from `MS_ASSET_BASE_URL` (platform-set at build, unset locally), and take the router basename from `platform.basePath` — don't hardcode root-absolute URLs in app code.

```ts
// vite.config.ts
base: process.env.MS_ASSET_BASE_URL || '/',

// router
createBrowserRouter(routes, { basename: platform.basePath || '/' });
```

#### Error Handling and Analytics

The SDK automatically reports uncaught errors, unhandled promise rejections, and pageviews to a per-app dashboard the owner gets for free. No setup required. The analytics dashboard covers visits, unique visitors, top pages, referrers, UTM breakdowns, country-level geo, device/browser/OS, new vs returning, and live online count.

What this means for code you write:

- **Don't install Sentry, Google Analytics, Plausible, Mixpanel, or similar unless the user specifically asks.** The platform dashboard already covers lay-person observability and analytics.
- **Caught errors are yours to handle. Uncaught errors are captured automatically** If you `try/catch`, show a toast or render a fallback. Let unexpected errors bubble; a React error boundary can render a fallback while the SDK reports the error.
- **For custom events**, use `analytics.track(name, props?)`. Props must be flat primitives (`string | number | boolean`); nested objects, arrays, `null`, and `undefined` are stripped. Server caps name ≤200 chars, ≤10 props, ≤50-char keys, ≤500-char values.

```ts
import { analytics } from '@mindstudio-ai/interface';

analytics.track('vendor_submitted', { vendorType: 'restaurant' });
analytics.track('checkout_completed', { itemCount: 3, total: 47.99 });
```

- **Apps can also READ their own analytics from backend methods** — the agent SDK's `analytics` namespace (lifetime per-page metrics, live visitor count, traffic sources, event stats), so an admin view can show real traffic next to the app's own data. Consult `askMindStudioSdk` for the query API when building one.

Analytics is **cookie-banner-free by design**: per-app scoping, IP discarded after geo lookup, country-level only, query strings server-scrubbed except for a UTM whitelist (`utm_*`, `ref`, `source`, `gclid`, `fbclid`, `msclkid`), no fingerprinting, no third-party scripts. If a user asks about GDPR cookie consent for analytics, you can explain why it is not needed.

Disabling telemetry is a per-app dashboard setting (platform toggle, not code). Point users there if they ask.

### Prerendering (for crawlers/unfurlers)

For non-static SPAs, link unfurlers and AI/search crawlers see only the empty shell. Opt routes into prerendering and the platform serves a cached headless snapshot to bots; real users always get the live SPA.

Opt in per route in `web.json`:

```json
{ "web": { "prerender": { "paths": ["/u/*", "/blog/*"] } } }
```

`prerender` is an object with a single field, `paths`: an array of route globs (`*` = one segment, `**` = any). Only listed routes prerender, and only routes — a path with a file extension (`/robots.txt`, `/sitemap.xml`) never prerenders, even under `/**`.

The opt-in alone is not enough. For every route in `prerender.paths`, the SPA must set `document.documentElement.setAttribute('data-prerender-ready', 'true')` once the head is written and the route has resolved — this is required, not optional. The renderer waits for this marker, so a prerendered route that never sets it times out. Set it even on routes that render synchronously, as soon as they're ready.

App deploys invalidate prerender cache automatically. When prerendered content changes at runtime, invalidate from the mutating method:

```typescript
import { prerender } from '@mindstudio-ai/agent';
await prerender.invalidate(['/u/abc']); // omit arg to purge all
```

`remy-admin prerender` can help you verify/manage snapshots during development.

### Redirects

Declare moved URLs in `web.json` — never ship a component that redirects client-side, since that resolves after JS loads and crawlers won't follow it:

```json
{ "web": { "trailingSlash": "strip", "redirects": [
  { "source": "/old-blog/*slug", "destination": "/blog/*slug", "permanent": true },
  { "source": "/launch", "destination": "https://example.com/launch", "statusCode": 302 }
] } }
```

`source` is a `/`-prefixed pattern; `destination` is a path or absolute http(s) URL. `permanent` (true → 308, false → 307) is required unless you set an explicit `statusCode` of 301/302/307/308; you can't set both. First match wins, and the request's query carries over unless the destination has its own.

**Pattern syntax is path-to-regexp v8, NOT the Next.js dialect** — the one thing to get right here. One segment is `:name`; a multi-segment wildcard is `*name` (Next's `:name*`); optional segments use braces (`/users{/:id}`); inline regex (`:id(\\d+)`) is unsupported. The v6/Next forms fail the build with the correct syntax in the error.

`trailingSlash` picks the canonical form (`"strip"`: `/about/` → `/about`; `"append"`: the reverse, skipping the root and paths with file extensions). Off by default. Write `source` patterns without trailing slashes either way — normalization and matching resolve in one hop. Sources under `/_/` are rejected, as are self-referential and two-rule loops. A redirecting path is never prerendered, so don't list one in `prerender.paths`.

### Rewrites

Serve different content at the same URL — no redirect. The way to give a clean path to a file that isn't in the build output:

```json
{ "web": { "rewrites": [
  { "source": "/sitemap.xml", "destination": "/_/files/public/site/sitemap.xml" },
  { "source": "/docs/*rest", "destination": "/help/*rest" }
] } }
```

`destination` is either `/_/files/public/<store>/<key>` (the object's bytes served inline — use this for anything the app generates at runtime and uploads: sitemaps, `robots.txt`, `llms.txt`, `.well-known/*`; the store must be public, private is rejected at build) or another path in the build output. Same `source` syntax as redirects, first match wins. Objects over 10 MB fall back to a CDN redirect. External URLs are not supported (use `mounts`), nor are other `/_/` surfaces.

Redirects resolve before everything; rewrites resolve at the content lookup, after prerendering — so a path with both gets the redirect.

### Mounting other apps

Rare: `mounts` serves another same-workspace app under a path prefix of this app's hosts — `{ "web": { "mounts": [{ "path": "/docs", "app": "docs-site" }] } }` (`app` = the target's `custom_subdomain` or appId). The child is served first-class (its own bundle, session, backend, prerendering) and needs no mount-specific config; the two serving conventions above are what make an app mountable.

Under a mount the child's own `web.json` governs its routing: its `prerender.paths` gates its mounted pages, its `prerender.invalidate` purges them, and its `redirects`/`rewrites`/`trailingSlash` apply within the prefix (written against its own paths). SEO files are NOT handled for you — the child must generate its sitemap with the mounted URLs, and the parent must advertise it in its own `robots.txt` or sitemap index. Canonicals must be written from the page's own location; a hardcoded absolute canonical points crawlers back at the child's host and undoes the mount.

## API Interface

REST endpoints for external consumers — other services, mobile apps, integrations. This is separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly and does not use the API interface). The API interface lives at `/_/api/` and exposes only the methods you choose to route.

Use it for sync endpoints for other services, a public REST API, batch tools — anything where something outside the app's own frontend needs to call a method over HTTP. It's also the interface that hands a method the raw HTTP request (`input._request`).

**Load the `restApi` skill** before authoring `src/interfaces/api.md` or writing the config — the route spec format, param declarations, auth, and platform behaviour are all there.

## Platform-Triggered Interfaces

Cron, Webhook, and Email interfaces are invoked by the platform, not by a user session. Methods called through these interfaces run with `auth.roles: ['system']`. Use `auth.requireRole('system')` to restrict a method to platform triggers only.

Each has its own skill carrying the config shape, the input the method receives, and the platform's behaviour: `scheduledJobs`, `webhooks`, `inboundEmail`.

## Cron

Scheduled method execution — a method plus a cron expression, synced to the platform on deploy. **Load the `scheduledJobs` skill** before adding one.

## Webhook

Inbound HTTP endpoints that invoke a method directly and synchronously. Use for provider callbacks (Stripe, GitHub, Shopify, Slack, Twilio) — signature verification works natively; do **not** build confirmation-token or polling workarounds. Routing is by a secret in the URL rather than an auth header, which is what fits callers that can't send a bearer token; the API interface is the alternative when they can. **Load the `webhooks` skill** before adding one.

## Email

Inbound email triggers: one handler method per app, and the platform routes all inbound mail for the app to it. Addresses on the app's subdomain are catchall, so per-purpose addresses (`support@`, `receipts@`) work without registering anything. **Load the `inboundEmail` skill** before writing the handler.

## MCP (Model Context Protocol)

The app projected as an MCP server for *external* AI agents to drive (Claude Desktop, Cursor, other people's agents). Unlike the agent interface — which IS an agent, with its own LLM — MCP has no model of its own. The platform hosts the server, handles auth, and derives tool schemas from method contracts. **Load the `mcpInterfaces` skill** before authoring `src/interfaces/mcp.md` — the consumer knows nothing about your app, so the descriptions are the product.

## Agent (Conversational Interface)

A conversational interface where the app's own LLM orchestrates its methods as tools — its own personality, system prompt, and model config (the inverse of MCP). Chat runs as the authenticated user, so every tool call carries that user's roles, and the config must declare an `auth` block (`{ "requireUser": boolean, "requireRole"?: string[] }`) gating who may chat at all. **Load the `agentInterfaces` skill** before authoring `src/interfaces/agent.md` or building the chat UI.

## Voice (Realtime Conversation)

The app's agent as a live, interruptible voice conversation — a sibling of the agent interface, not a mode of it, with its own spec and a smaller toolset where every tool carries a latency class. Sessions run as the authenticated user, and the config must declare the same `auth` block gating who may start a session. **Load the `voiceInterfaces` skill** before authoring `src/interfaces/voice.md` or building the voice UI.

## Manifest Declaration

Each interface is declared in `mindstudio.json`:

```json
{
  "interfaces": [
    { "type": "web", "path": "dist/interfaces/web/web.json" },
    { "type": "api", "path": "dist/interfaces/api/api.json" },
    { "type": "cron", "path": "dist/interfaces/cron/interface.json" },
    { "type": "webhook", "path": "dist/interfaces/webhook/interface.json" },
    { "type": "email", "path": "dist/interfaces/email/interface.json" },
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" },
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" },
    { "type": "voice", "path": "dist/interfaces/voice/interface.json" }
  ]
}
```

An interface with nothing to configure can be declared with just its type; the rest point at a compiled config file. Set `"enabled": false` to skip an interface during build.
