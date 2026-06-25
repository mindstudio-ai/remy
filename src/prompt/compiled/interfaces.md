# Interfaces

Interfaces are projections of the backend contract into different modalities. The same methods power all of them. An interface can be as complex and polished as you want, but it's always safe — the backend contract is where anything real happens. The interface can't break business logic or corrupt data.

All external service connections (webhook secrets, email addresses) are configured at the project level by the user through the Remy platform. The agent's job is to write the config files and the methods that handle the requests — not to manage API keys, OAuth flows, or service registration.

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
auth.logout()                       // clears session
```

For apps with an agent interface, the SDK also provides `createAgentChatClient()` for thread management and streaming chat. See the "Building Agent Interfaces" section for usage details.

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

## API Interface

REST endpoints for external consumers — other services, mobile apps, integrations. This is separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly and does not use the API interface). The API interface lives at `/_/api/` and exposes only the methods you choose to route.

Use it for receiving webhooks (Stripe, Twilio), sync endpoints for other services, a public REST API, batch tools — anything where something outside the app's own frontend needs to call a method over HTTP.

### Spec: `src/interfaces/api.md`

The human-readable spec. Frontmatter declares the API name and description; the body maps methods to REST routes using MSFM.

```yaml
---
name: Vendor Management API
description: API for managing vendors and purchase orders.
type: interface/api
---
```

Routes are declared as `VERB /path → methodExportName` under resource headings, with annotations for params and descriptions:

```markdown
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
        "description": "Permanently remove a vendor.",
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

| Field | Description |
|-------|-------------|
| `name` | API display name (used in generated OpenAPI spec) |
| `description` | API description |
| `routes[].method` | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `routes[].path` | URL path with `:param` placeholders for path params |
| `routes[].handler` | Method `id` from the manifest (kebab-case) |
| `routes[].summary` | Short description for the endpoint |
| `routes[].description` | Longer description |
| `routes[].tag` | Resource grouping (becomes a tag in OpenAPI) |
| `routes[].params` | Parameter declarations: `path`, `query`, and/or `body` objects |

### Platform Behavior

Routes are mounted at `/_/api{path}` (e.g. `DELETE /_/api/vendors/abc123`).

- **Path params** are extracted and merged into the method's input: `/:vendorId` → `{ vendorId: "abc123" }`
- **Query params** are merged into input for GET requests: `?status=approved` → `{ status: "approved" }`
- **Request body** for POST/PUT/PATCH is the input directly (no `{ input: {...} }` wrapper)
- **Response** is the method output directly (no `{ output: {...} }` wrapper)
- **Auth** via `Authorization: Bearer sk_...` (API key resolves to a user with full RBAC)
- **Streaming**: `Accept: text/event-stream` header returns SSE chunks
- **Raw request context**: Every API method receives `input._request` with `{ method, headers, rawBody }`. `rawBody` is the original unparsed body as a UTF-8 string — critical for webhook signature verification (Stripe, GitHub, Shopify). For most methods you don't need `_request` at all.

### Manifest

```json
{ "type": "api", "path": "dist/interfaces/api/api.json" }
```

## Platform-Triggered Interfaces

Cron, Webhook, and Email interfaces are invoked by the platform, not by a user session. Methods called through these interfaces run with `auth.roles: ['system']`. Use `auth.requireRole('system')` to restrict a method to platform triggers only.

## Cron

Scheduled method execution.

### Config (`interface.json`)

```json
{
  "cron": {
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
}
```

Standard cron expression format. Jobs are synced to the platform on deploy.

## Webhook

Inbound HTTP endpoints that invoke a method directly and synchronously — the caller waits for the method to finish. Use for receiving webhooks from external services (Stripe, GitHub, Shopify, Slack, Twilio). Direct inbound webhooks with signature verification work natively; do **not** build confirmation-token or polling workarounds.

### Config (`interface.json`)

The top-level key must match the interface type (`webhook`):

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
- `secret` — a developer-chosen opaque token that is **both the routing key and the access guard**. It is stable across deploys (compilation is a passthrough — redeploying never rotates it), so a URL you register with Stripe/GitHub stays valid. Generate one long random value per endpoint and keep it constant.
- Declare multiple endpoints if needed; each `secret` maps to one method.

### Endpoint URL

Register this with the external service: `https://{app-host}/_/webhook/{secret}` — `{app-host}` is any host the app is served on: its `custom_subdomain` host (e.g. `myapp.madewithremy.com`), a custom domain if configured, or the UUID host (`<appId>.madewithremy.com` / `.msagent.ai`). All HTTP verbs are accepted.

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

For signature verification **always use `rawBody`, never `body`** — providers (Stripe, GitHub, Shopify, Slack) HMAC the raw payload, and a re-serialized `body` will not match. E.g. `stripe.webhooks.constructEvent(input.rawBody, input.headers['stripe-signature'], endpointSecret)`. `rawBody` is populated for `application/json` and `application/x-www-form-urlencoded` bodies (what these providers send).

### Response

Whatever the method returns as output is sent back to the caller as JSON; if it returns no output, the platform responds `204`. A wrong/unknown secret returns `401`; an app with no live release returns `404`.

## Email

Inbound email triggers. Each app has one email-handler method; the platform routes all inbound mail destined for the app — across any of its address tiers — to that method.

### Address tiers

Three tiers, all delivered to the same handler method. The new tiers are catchall (no localpart registration); the legacy tier is specific-localpart and frozen for new apps.

| Tier | Address | How it's set up |
|---|---|---|
| Platform subdomain (default) | `*@<custom_subdomain>.madewithremy.com` | Automatic the moment the app has a `custom_subdomain` set. Every address on that subdomain delivers to the handler. |
| Custom domain | `*@<their-domain>` | The user adds a domain in the dashboard's email-domains settings and points one MX record at `mx.msagent.ai`. Not something the agent provisions. |
| Legacy `mindstudio-hooks.com` | `<name>@mindstudio-hooks.com` | Existing apps only — frozen for new apps. Don't recommend it; treat as read-only history. |

Because the new tiers are catchall, `to` carries an arbitrary localpart. Methods that need to branch on it should read `input.to` (e.g. `if (input.to.startsWith('support@')) ...`).

### Config (`interface.json`)

```json
{
  "email": {
    "method": "handle-inbound-email",
    "approvedSenders": ["billing@vendor.com", "*@trusted-partner.com"]
  }
}
```

`approvedSenders` is optional. When set, only senders matching an exact address or `*@domain.com` wildcard reach the method; everything else is rejected by the platform with `400 invalid_sender` before the method runs (silently — the sender isn't bounced). Matching is case-insensitive. The same list applies uniformly across all three address tiers.

### Input shape

```ts
{
  to: string;            // full recipient address; localpart is arbitrary on catchall tiers
  from: string;          // bare address, extracted from "Name <a@b>" form
  subject: string;       // 'No Subject' if missing
  message: string;       // plain text body, falls back to HTML if text is missing; 'No Body' if neither was sent
  html: string;          // HTML body, or '' when text-only
  attachments: string[]; // CDN URLs — already uploaded by the platform
}
```

### Attachments and size limits

`attachments[]` is an array of CDN URLs — the platform has already received and uploaded the files. Fetch them server-side via the URL when you need the bytes; pass them through as URLs to UI or downstream services.

Max inbound message size is 25 MB total (including all attachments). Oversized messages are rejected by the platform before the method runs.

### Auth

Methods invoked through this interface run with `auth.roles: ['system']` (see the system-roles section above). They have no user session and can't impersonate. Use `auth.requireRole('system')` to gate methods that should only be reachable via email.

## MCP (Model Context Protocol)

Expose the app to *external* AI agents — Claude Desktop, Cursor, other people's agents, anything that speaks MCP. Unlike the agent interface (which *is* an agent — its own LLM, personality, and chat UI), MCP has no model of its own; it's the app projected as an MCP server for an outside AI to drive.

It supports the full MCP surface:
- **Tools** — methods the agent can call (rich descriptions + machine-readable annotations).
- **Resources** — read-only app data the agent can pull into context, addressable by URI.
- **Prompts** — reusable, parameterized prompt templates the server offers.
- **Instructions** — server-level guidance shown to the calling agent (the toolset's "system prompt").

The platform hosts the server, handles auth like the API interface (optional — keyed or anonymous), and derives every tool's input schema from the method contract. Because the consumer is an external agent with no knowledge of your app, **the descriptions are the product** — see "Building MCP Interfaces" for how to write them.

### Spec: `src/interfaces/mcp.md`

Frontmatter declares the server. The body's intro prose becomes the server `instructions`; `## Tools`, `## Resources`, and `## Prompts` sections declare the rest.

```yaml
---
name: Vendor Management
description: Tools and data for managing vendors and purchase orders.
type: interface/mcp
---
```

```markdown
This server manages vendors and purchase orders. Read a vendor before updating it; submitted
requests go through approval before they become active.

## Tools

### Submit a vendor request
method: submit-vendor-request
~~~
Submit a new vendor for approval. Use when the caller wants to add a vendor.
Do NOT use to modify an existing vendor — that's update-vendor.
- name: the vendor's legal name
- contactEmail: billing contact; required for approval routing
Returns the created vendor's id and its initial "pending" status.
~~~

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
Write a warm outreach email to vendor {{vendorId}} introducing our procurement process.
~~~
```

Don't hand-author input schemas — the platform derives them. For a resource template, `{param}` in the URI maps to the backing method's input.

### Compiled Output: `dist/interfaces/mcp/`

```
dist/interfaces/mcp/
├── interface.json      ← config the platform reads
├── instructions.md     ← server-level guidance (returned in `initialize`)
├── tools/
│   ├── submitVendorRequest.md   ← rich description, one per tool
│   └── listVendors.md
└── prompts/
    └── draftVendorEmail.md      ← prompt template body, one per prompt
```

Resources carry inline metadata only — no per-resource file.

### Config (`interface.json`)

```json
{
  "mcp": {
    "name": "Vendor Management",
    "description": "Tools and data for managing vendors and purchase orders.",
    "instructions": "instructions.md",
    "tools": [
      {
        "method": "submit-vendor-request",
        "name": "submit_vendor_request",
        "title": "Submit Vendor Request",
        "description": "tools/submitVendorRequest.md",
        "annotations": { "readOnly": false, "destructive": false, "idempotent": false, "openWorld": false }
      },
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
| `tools[].method` | Method `id` from the manifest (kebab-case) |
| `tools[].name` | Tool name exposed to clients. Optional — defaults to the method `id`. Must match `[a-zA-Z0-9_-]` and be unique within the server |
| `tools[].title` | Optional human-friendly display name |
| `tools[].description` | Relative path to the tool's markdown description |
| `tools[].annotations` | Optional client hints (auto-call vs. confirm): `readOnly`, `destructive`, `idempotent`, `openWorld` — map to MCP's `readOnlyHint` etc. |
| `resources[].method` | The read method invoked when the resource is read |
| `resources[].uri` / `uriTemplate` | A static URI, or a template whose `{param}` maps to the method's input |
| `resources[].name`, `description`, `mimeType` | Resource metadata |
| `prompts[].name`, `title`, `description` | Prompt identity + metadata |
| `prompts[].arguments` | `[{ name, description?, required? }]` |
| `prompts[].template` | Relative path to the template body (`{{arg}}` placeholders) |

There is no `inputSchema` field — the platform derives each tool's schema from the method's input contract.

### Platform Behavior

- The platform hosts the MCP server and exposes it to external clients. Clients connect at `POST https://{app-host}/_/mcp`.
- **Auth is optional**, identical to the API interface: a `Bearer` key resolves to a user with full RBAC; with no key, calls run anonymously (no user, no roles). The method is the boundary — gate sensitive tools with `auth.requireRole`/`requireUser`; a public (keyless) server exposes only the un-gated tools.
- Input schemas are derived automatically from each method's input contract.
- `tools/list` is static; access is enforced per-method at call time (a gated tool is listed but rejects an unauthorized call).
- A resource read invokes the backing method (template `{param}`s come from the URI) and returns its output as the resource contents.
- `prompts/get` fills the template with the provided arguments.
- `instructions` is returned in the `initialize` response.

### Manifest

```json
{ "type": "mcp", "path": "dist/interfaces/mcp/interface.json" }
```

## Agent (Conversational Interface)

A conversational interface where an LLM has access to the app's methods as tools. Unlike MCP (which exposes methods for external agents), the agent interface IS the agent — it has its own personality, system prompt, and model config, and orchestrates tool calls against the app's methods internally.

### Spec: `src/interfaces/agent.md`

The human-readable spec. Frontmatter contains structured fields; the prose body is the behavioral spec — voice, personality, capabilities, rules — written in MSFM.

```yaml
---
name: Todo Assistant
model: {"model": "claude-4-5-haiku", "temperature": 0.5, "maxResponseTokens": 16000}
description: Conversational agent that helps users manage their to-do list.
---
```

Frontmatter fields:
- `name` — agent display name
- `model` — JSON string with `model` (MindStudio model ID), `temperature`, `maxResponseTokens`, and optional `config` (model-specific settings like `reasoning`, `tools`, etc.). Use `askMindStudioSdk` to look up available model IDs and their config options when setting the model ID. The user's UI will have a nice visual picker to allow them to change it later, so only validate model when you're setting - otherwise assume this value to be correct if it changes.
- `description` — one-liner for agent card/listing

The prose body contains sections like Voice & Personality, Capabilities, Behavior — whatever structure serves the agent's character. This is compiled into the system prompt and tool descriptions.

### Compiled Output: `dist/interfaces/agent/`

```
dist/interfaces/agent/
├── agent.json          ← config the platform reads
├── system.md           ← compiled system prompt
└── tools/
    ├── createTodo.md   ← rich tool description per method
    ├── listTodos.md
    └── ...
```

### Config (`agent.json`)

```json
{
  "agent": {
    "model": "claude-4-5-haiku",
    "temperature": 0.5,
    "maxTokens": 16000,
    "systemPrompt": "system.md",
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
| `tools` | Array of tool entries — `method` references a method `id` from the manifest, `description` is a relative path to a markdown file with rich tool docs (when to use, examples, edge cases, parameter guidance) |
| `webInterfacePath` | Optional. If the app has a web interface with a chat page, this path tells the IDE where to show the preview. Otherwise the agent is accessed via API. |

### Manifest Declaration

```json
{ "type": "agent", "path": "dist/interfaces/agent/agent.json" }
```

## Manifest Declaration

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
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file — just declaring the type is enough. Others need a config for command mappings, schedules, etc. Set `"enabled": false` to skip an interface during build.
