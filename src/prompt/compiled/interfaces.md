# Interfaces

Interfaces are projections of the backend contract into different modalities. The same methods power all of them. An interface can be as complex and polished as you want, but it's always safe — the backend contract is where anything real happens. The interface can't break business logic or corrupt data.

All external service connections (Discord bot tokens, Telegram bot setup, webhook secrets, email addresses) are configured at the project level by the user through the MindStudio platform. The agent's job is to write the config files and the methods that handle the requests — not to manage API keys, OAuth flows, or service registration.

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

### Manifest

```json
{ "type": "api", "path": "dist/interfaces/api/api.json" }
```

## Discord Bot

Slash commands that invoke methods.

### Config (`interface.json`)

```json
{
  "commands": [
    {
      "name": "submit-vendor",
      "description": "Request a new vendor",
      "method": "submit-vendor-request"
    }
  ],
  "loadingMessage": "Processing your request..."
}
```

Commands are synced to Discord on deploy.

## Telegram Bot

Bot commands and message handling.

### Config (`interface.json`)

```json
{
  "commands": [
    {
      "command": "/submit",
      "description": "Submit a vendor request",
      "method": "submit-vendor-request"
    }
  ],
  "defaultMethod": "handle-message"
}
```

`defaultMethod` handles free-text messages that don't match a command.

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

## Webhook

Inbound HTTP endpoints that invoke methods.

### Config (`interface.json`)

```json
{
  "endpoints": [
    {
      "method": "handle-payment-webhook",
      "description": "Stripe payment notifications",
      "secret": "whk_abc123..."
    }
  ]
}
```

Endpoint URL: `https://{app-subdomain}.mindstudio.ai/_/webhook/{secret}`

Accepts any HTTP method. The method receives `{ method, headers, query, body }` as input.

## Email

Inbound email triggers.

### Config (`interface.json`)

```json
{
  "method": "handle-inbound-email"
}
```

Register a custom address (e.g., `invoices@mindstudio-hooks.com`) via the platform. Inbound emails invoke the specified method with the email content as input.

## MCP (Model Context Protocol)

Expose methods as AI tools.

### Config (`interface.json`)

```json
{
  "methods": ["submit-vendor-request", "list-vendors"]
}
```

Each listed method becomes an MCP tool. Method names and descriptions from the manifest are used as tool names and descriptions.

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
    { "type": "discord", "path": "dist/interfaces/discord/interface.json" },
    { "type": "telegram", "path": "dist/interfaces/telegram/interface.json" },
    { "type": "webhook", "path": "dist/interfaces/webhook/interface.json" },
    { "type": "email", "path": "dist/interfaces/email/interface.json" },
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" },
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file — just declaring the type is enough. Others need a config for command mappings, schedules, etc. Set `"enabled": false` to skip an interface during build.
