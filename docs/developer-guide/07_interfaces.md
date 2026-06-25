# Interfaces

Interfaces are how users interact with your app. The same methods power all of them. A web frontend, a REST API, and a cron job can all invoke the same backend logic. Interfaces can be as complex and polished as you want, but they're always safe, because the backend is where anything real happens. They're projections of the backend contract into different modalities.

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
auth.logout()                       // clears session
```

### Deployment

On `git push`, the platform runs `npm install && npm run build` in the web directory and hosts the output on CDN. Zero configuration in your code. The platform injects connection details automatically.

---

## API Interface

Exposes selected methods as REST endpoints with clean URLs and HTTP methods — for external consumers (other services, mobile apps, integrations). This is separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly). The API interface lives at `/_/api/`.

Use it for anything external: a Stripe webhook endpoint, sync endpoints for another service, a public REST API, a batch export tool. Not every method needs an API route — expose only what external consumers need.

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

Inbound HTTP endpoints that invoke a method directly and synchronously — the caller waits for the method to finish and gets its output back. Use for receiving webhooks from external services (Stripe, GitHub, Shopify, Slack, Twilio). Direct inbound webhooks with signature verification work natively; don't build confirmation-token or polling workarounds.

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

Inbound email triggers. Each app has one email-handler method; the platform routes all inbound mail destined for the app — across any of its address tiers — to that method.

### Address tiers

Apps can receive mail at three different kinds of addresses, all delivered to the same handler:

| Tier | Address | Setup |
|---|---|---|
| Platform subdomain (default) | `*@<custom_subdomain>.madewithremy.com` | Automatic once the app has a custom subdomain set. Catchall — every address delivers to your method. |
| Custom domain | `*@<your-domain>` | Add the domain in the dashboard's email-domains settings; paste one MX record (`mx.msagent.ai`) at your DNS provider. Catchall. |
| Legacy `mindstudio-hooks.com` | `<name>@mindstudio-hooks.com` | Existing apps only. Frozen for new apps. |

The new tiers are catchall, so `to` carries an arbitrary localpart. If your method needs to branch on it, read `input.to` (e.g. `if (input.to.startsWith('support@')) ...`).

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
  to: string;            // full recipient address; localpart is arbitrary on catchall tiers
  from: string;          // bare address, extracted from "Name <a@b>" form
  subject: string;       // 'No Subject' if missing
  message: string;       // plain text body, falls back to HTML if text is missing; 'No Body' if neither was sent
  html: string;          // HTML body, or '' when text-only
  attachments: string[]; // CDN URLs — already uploaded by the platform
}
```

Max inbound size is 25 MB total. Oversized messages are rejected by the platform before the method runs.

---

## MCP (Model Context Protocol)

Expose the app to *external* AI agents — Claude Desktop, Cursor, anything that speaks MCP. Unlike the agent interface (which *is* an agent, with its own LLM and chat UI), MCP has no model of its own; it's the app projected as an MCP server for an outside AI to drive. It supports the full MCP surface: **tools** (methods the agent calls), **resources** (read-only data the agent reads into context), **prompts** (reusable templates), and server **instructions** (toolset-level guidance shown to the calling agent).

The platform hosts the server at `POST https://{app-host}/_/mcp` (where MCP clients connect), handles auth like the API interface (optional — a `Bearer` key resolves to a user with full RBAC, or calls run anonymously), and derives each tool's input schema from the method contract. The descriptions are the product: the calling agent has nothing but them to decide what to invoke, so write them self-contained for a stranger with no app context.

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
| `tools` | Array of tool entries. `method` references a method `id` from `mindstudio.json`. `description` is a relative path to a markdown file with rich tool docs. |
| `webInterfacePath` | Optional. If the app has a web interface with a chat page, this path tells the IDE where to show the agent preview. |

### Manifest

```json
{ "type": "agent", "path": "dist/interfaces/agent/agent.json" }
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
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file; just declaring the type is enough. Others need a config to specify which methods to expose, command mappings, schedules, etc.

Set `"enabled": false` to skip an interface during build without removing it from the manifest.
