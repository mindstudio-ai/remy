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
  "devPort": 5173,
  "devCommand": "npm run dev",
  "defaultPreviewMode": "desktop"
}
```

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

// File operations
const { url } = await platform.requestFile({ type: 'image' });
const cdnUrl = await platform.uploadFile(file);

// Current user (display only)
auth.userId;
auth.name;
auth.email;
```

The project uses `"jsx": "react-jsx"` (automatic JSX transform) — do not `import React from 'react'`. Only import the specific hooks and types you need (e.g., `import { useState, useEffect } from 'react'`).

On deploy, the platform runs `npm install && npm run build` in the web directory and hosts the output on CDN.

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
curl -X POST https://api.mindstudio.ai/_internal/v2/apps/{appId}/methods/submit-vendor-request/invoke \
  -H "Authorization: Bearer sk..." \
  -H "Content-Type: application/json" \
  -d '{ "input": { "name": "Acme" } }'
```

Auth via API key. Returns `{ output, $releaseId, $methodId }`.

### Streaming

```bash
curl -X POST ... -d '{ "input": {...}, "stream": true }'
```

Returns SSE: `data: { type: 'token', text }` chunks, then `data: { type: 'done', output }`.

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

Endpoint URL: `https://api.mindstudio.ai/_internal/v2/webhook/{appId}/{secret}`

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
    { "type": "mcp", "path": "dist/interfaces/mcp/interface.json" }
  ]
}
```

Some interfaces (like `api`) work without a config file — just declaring the type is enough. Others need a config for command mappings, schedules, etc. Set `"enabled": false` to skip an interface during build.
