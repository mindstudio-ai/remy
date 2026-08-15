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

// File upload → client-direct to the app's file store (see Files & Storage).
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
auth.sendEmailCode(email)           // → { verificationId }
auth.verifyEmailCode(verId, code)   // → AppUser (sets session)
auth.sendSmsCode(phone)             // → { verificationId }
auth.verifySmsCode(verId, code)     // → AppUser (sets session)
auth.logout()                       // clears session
```

For apps with an agent interface, the SDK also provides `createAgentChatClient()` for thread management and streaming chat. Load the `agentInterfaces` skill for its usage — thread APIs, streaming callbacks, and attachments are all there.

The project uses `"jsx": "react-jsx"` (automatic JSX transform) — do not `import React from 'react'`. Only import the specific hooks and types you need (e.g., `import { useState, useEffect } from 'react'`).

On deploy, the platform runs `npm install && npm run build` in the web directory and hosts the output on CDN.

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

Analytics is **cookie-banner-free by design**: per-app scoping, IP discarded after geo lookup, country-level only, query strings server-scrubbed except for a UTM whitelist (`utm_*`, `ref`, `source`, `gclid`, `fbclid`, `msclkid`), no fingerprinting, no third-party scripts. If a user asks about GDPR cookie consent for analytics, you can explain why it is not needed.

Disabling telemetry is a per-app dashboard setting (platform toggle, not code). Point users there if they ask.

### Prerendering (for crawlers/unfurlers)

For non-static SPAs, link unfurlers and AI/search crawlers see only the empty shell. Opt routes into prerendering and the platform serves a cached headless snapshot to bots; real users always get the live SPA.

Opt in per route in `web.json`:

```json
{ "web": { "prerender": { "paths": ["/u/*", "/blog/*"] } } }
```

`prerender` is an object with a single field, `paths`: an array of route globs (`*` = one segment, `**` = any). Only listed routes prerender.

The opt-in alone is not enough. For every route in `prerender.paths`, the SPA must set `document.documentElement.setAttribute('data-prerender-ready', 'true')` once the head is written and the route has resolved — this is required, not optional. The renderer waits for this marker, so a prerendered route that never sets it times out. Set it even on routes that render synchronously, as soon as they're ready.

App deploys invalidate prerender cache automatically. When prerendered content changes at runtime, invalidate from the mutating method:

```typescript
import { prerender } from '@mindstudio-ai/agent';
await prerender.invalidate(['/u/abc']); // omit arg to purge all
```

`mindstudio-prod prerender` can help you verify/manage snapshots during development.

## API Interface

REST endpoints for external consumers — other services, mobile apps, integrations. This is separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly and does not use the API interface). The API interface lives at `/_/api/` and exposes only the methods you choose to route.

Use it for sync endpoints for other services, a public REST API, batch tools — anything where something outside the app's own frontend needs to call a method over HTTP. It's also the interface that hands a method the raw HTTP request (`input._request`).

**Load the `restApi` skill** before authoring `src/interfaces/api.md` or writing the config — the route spec format, param declarations, auth, and platform behaviour are all there.

## Platform-Triggered Interfaces

Cron, Webhook, and Email interfaces are invoked by the platform, not by a user session. Methods called through these interfaces run with `auth.roles: ['system']`. Use `auth.requireRole('system')` to restrict a method to platform triggers only.

Each has its own skill carrying the config shape, the input the method receives, and the platform's behaviour: `scheduledJobs`, `webhooks`, `inboundEmail`.

## Cron

Scheduled method execution — a method plus a cron expression, synced to the platform on deploy.

**Load the `scheduledJobs` skill** before adding one.

## Webhook

Inbound HTTP endpoints that invoke a method directly and synchronously — the caller waits for the method to finish. Use for receiving webhooks from external services (Stripe, GitHub, Shopify, Slack, Twilio). Direct inbound webhooks with signature verification work natively; do **not** build confirmation-token or polling workarounds.

Routing is by a secret in the URL rather than an auth header, which is what makes it the right fit for provider callbacks — they can't send a bearer token. The API interface is the alternative when the caller can.

**Load the `webhooks` skill** before adding one — the secret semantics, endpoint URL, input shape, and signature verification are all there.

## Email

Inbound email triggers. Each app has one email-handler method; the platform routes all inbound mail destined for the app — across any of its address tiers — to that method. Addresses on the app's subdomain are catchall, so per-purpose addresses (`support@`, `receipts@`) work without registering anything.

**Load the `inboundEmail` skill** before writing the handler — address tiers, `approvedSenders`, the input shape, in-thread replies, and attachments are all there.

## MCP (Model Context Protocol)

Expose the app to *external* AI agents — Claude Desktop, Cursor, other people's agents, anything that speaks MCP. Unlike the agent interface (which *is* an agent — its own LLM, personality, and chat UI), MCP has no model of its own; it's the app projected as an MCP server for an outside AI to drive.

It supports the full MCP surface: tools (methods the agent can call), resources (read-only app data addressable by URI), prompts (parameterized templates), and instructions (server-level guidance for the whole toolset). The platform hosts the server, handles auth, and derives every tool's input schema from the method contract.

**Load the `mcpInterfaces` skill** before authoring `src/interfaces/mcp.md`. Because the consumer is an external agent with no knowledge of your app, the descriptions are the product — the skill carries both how to write them and the full config contract.

## Agent (Conversational Interface)

A conversational interface where an LLM has access to the app's methods as tools. Unlike MCP (which exposes methods for external agents), the agent interface IS the agent — it has its own personality, system prompt, and model config, and orchestrates tool calls against the app's methods internally. Chat runs as the authenticated user, so every tool call carries that user's roles.

**Load the `agentInterfaces` skill** before authoring `src/interfaces/agent.md` or building the chat UI — the spec frontmatter, compiled output, `agent.json`, and the entire frontend surface are all there.

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
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" }
  ]
}
```

An interface with nothing to configure can be declared with just its type; the rest point at a compiled config file. Set `"enabled": false` to skip an interface during build.
