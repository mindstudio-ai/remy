# Interfaces

Interfaces are how users interact with your app. The same methods power all of them. A web frontend, a Discord bot, and a cron job can all invoke the same backend logic. Interfaces can be as complex and polished as you want, but they're always safe, because the backend is where anything real happens. They're projections of the backend contract into different modalities.

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

Auto-generated REST endpoints. Every method becomes an API endpoint.

### Config (`interface.json`)

```json
{
  "methods": ["submit-vendor-request", "list-vendors", "get-dashboard"]
}
```

Omit the `methods` field (or the config entirely) to expose all methods.

### Usage

```bash
curl -X POST https://{app-subdomain}.mindstudio.ai/_/methods/submit-vendor-request/invoke \
  -H "Authorization: Bearer sk..." \
  -H "Content-Type: application/json" \
  -d '{ "input": { "name": "Acme" } }'
```

Auth via API key (`sk...`). Returns `{ output, $releaseId, $methodId }`.

### Streaming

```bash
curl -X POST ... -d '{ "input": {...}, "stream": true }'
```

Returns SSE: `data: { type: 'token', text }` chunks, then `data: { type: 'done', output }`.

---

## Discord Bot

Slash commands that invoke methods.

### Setup

1. Create a Discord application at discord.com/developers
2. Register via the platform:
   ```
   POST /discord/register
   { applicationId, botToken, publicKey }
   ```
3. The platform returns a webhook URL and invite URL

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

---

## Telegram Bot

Bot commands and message handling.

### Setup

1. Create a bot via @BotFather
2. Register via the platform:
   ```
   POST /telegram/register
   { botId, token }
   ```

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

---

## Email

Inbound email triggers.

### Setup

Register a custom email address:

```
POST /email/register
{ name: "invoices" }
```

Creates `invoices@mindstudio-hooks.com`.

### Config (`interface.json`)

```json
{
  "method": "handle-inbound-email"
}
```

Inbound emails invoke the specified method with the email content as input.

---

## MCP (Model Context Protocol)

Expose methods as AI tools.

### Config (`interface.json`)

```json
{
  "methods": ["submit-vendor-request", "list-vendors"]
}
```

Each listed method becomes an MCP tool. Method names and descriptions from the manifest are used as tool names and descriptions.

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
    { "type": "discord", "path": "dist/interfaces/discord/interface.json" },
    { "type": "telegram", "path": "dist/interfaces/telegram/interface.json" },
    { "type": "webhook", "path": "dist/interfaces/webhook/interface.json" },
    { "type": "email", "path": "dist/interfaces/email/interface.json" },
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" },
    { "type": "agent", "path": "dist/interfaces/agent/agent.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file; just declaring the type is enough. Others need a config to specify which methods to expose, command mappings, schedules, etc.

Set `"enabled": false` to skip an interface during build without removing it from the manifest.
