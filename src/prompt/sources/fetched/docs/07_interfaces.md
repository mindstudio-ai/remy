# Interfaces

Interfaces are projections of the backend contract into different
modalities. The same methods power all of them. A web frontend can be
as complex and polished as you want — rich interactions, animations,
beautiful design — but it's always safe, because the backend contract
is where anything real happens. The interface can't break business
logic or corrupt data.

---

## Web Interface

A full web application — typically Vite + React, but any framework
that produces static output works.

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
  "devPort": 5173,
  "devCommand": "npm run dev"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `devPort` | `number` | `5173` | Port for the dev server |
| `devCommand` | `string` | `"npm run dev"` | Command to start the dev server |

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

// File operations
const { url } = await platform.requestFile({ type: 'image' });
const cdnUrl = await platform.uploadFile(file);

// Current user (display only)
auth.userId;
auth.name;
auth.email;
```

### How It Works

- In development: the tunnel proxy injects `window.__MINDSTUDIO__`
  into HTML responses. The SDK reads this for API URL, session token,
  and method mapping.
- In production: the built SPA is hosted on a CDN subdomain
  (`{releaseId}.static.mscdn.ai`). The same `__MINDSTUDIO__` object
  is injected by the hosting layer.
- Zero configuration in your code — just import and use.

### Deployment

On `git push`, the platform runs `npm install && npm run build` in the
web directory, archives the output, and hosts it on CDN.

---

## API Interface

Auto-generated REST endpoints. Every method becomes an API endpoint.

### Config (`interface.json`)

```json
{
  "methods": ["submit-vendor-request", "list-vendors", "get-dashboard"]
}
```

Or expose all methods (omit the config / declare without a methods
field).

### Usage

```bash
curl -X POST https://api.mindstudio.ai/_internal/v2/apps/{appId}/methods/submit-vendor-request/invoke \
  -H "Authorization: Bearer sk..." \
  -H "Content-Type: application/json" \
  -d '{ "input": { "name": "Acme" } }'
```

Auth via API key (`sk...`). Returns `{ output, $releaseId, $methodId }`.

### Streaming

```bash
curl -X POST ... -d '{ "input": {...}, "stream": true }'
```

Returns SSE: `data: { type: 'token', text }` chunks, then
`data: { type: 'done', output }`.

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

Standard cron expression format. Jobs are synced to the platform on
deploy.

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

The endpoint URL is:
`https://api.mindstudio.ai/_internal/v2/webhook/{appId}/{secret}`

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

Inbound emails invoke the specified method with the email content
as input.

---

## MCP (Model Context Protocol)

Expose methods as AI tools.

### Config (`interface.json`)

```json
{
  "methods": ["submit-vendor-request", "list-vendors"]
}
```

Each listed method becomes an MCP tool that AI assistants can invoke.
Method names and descriptions from the manifest are used as tool names
and descriptions.

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
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file — just
declaring the type is enough. Others need a config to specify which
methods to expose, command mappings, schedules, etc.

Set `"enabled": false` to skip an interface during build without
removing it from the manifest.
