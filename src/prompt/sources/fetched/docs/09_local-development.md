# Local Development

## Getting Started

### Install the CLI

```bash
npm install -g @mindstudio-ai/local-model-tunnel
```

### Authenticate

```bash
mindstudio-local
```

First run opens a browser window for login. After authenticating, your
API key is saved to `~/.mindstudio-local-tunnel/config.json`.

### Create an App

Create a new app on the MindStudio platform (editor or API). This gives
you an `appId` and a git remote:

```bash
git clone https://git.mscdn.ai/{appId}.git my-app
cd my-app
```

### Set Up the Project

Create the minimum required files:

```
my-app/
  mindstudio.json
  dist/
    methods/
      src/
        hello.ts
      package.json
```

`mindstudio.json`:
```json
{
  "appId": "your-app-id",
  "name": "My App",
  "methods": [
    {
      "id": "hello",
      "path": "dist/methods/src/hello.ts",
      "export": "hello"
    }
  ]
}
```

`dist/methods/src/hello.ts`:
```typescript
export async function hello(input: { name: string }) {
  return { message: `Hello, ${input.name}!` };
}
```

`dist/methods/package.json`:
```json
{
  "dependencies": {
    "@mindstudio-ai/agent": "^1.0.0"
  }
}
```

### First Deploy

```bash
git add -A && git commit -m "Initial app"
git push origin main
```

The platform builds and deploys. Your method is now accessible via
API key.

---

## The Dev Workflow

### Start a Dev Session

```bash
cd my-app
mindstudio-local --port 5173
```

This:
1. Reads `mindstudio.json` for the app ID and method definitions
2. Starts a dev session on the platform (creates a dev release with
   a snapshot of the live database)
3. Starts a proxy server on the specified port
4. Begins polling for method execution requests

If you have a web interface, start your dev server first:

```bash
cd dist/interfaces/web && npm run dev  # starts Vite on port 5173
```

Then in another terminal:

```bash
cd my-app && mindstudio-local --port 5173
```

The tunnel's proxy sits in front of your dev server, injecting
`window.__MINDSTUDIO__` into HTML responses so the frontend SDK
works automatically.

### The Inner Loop

1. Edit method code in `dist/methods/src/`
2. Save
3. The next method invocation (from the web preview or API) uses the
   updated code — esbuild transpiles per-request, no restart needed
4. See results immediately in the browser

For frontend changes with a web interface:
1. Edit React components in `dist/interfaces/web/src/`
2. Save
3. Vite HMR updates the browser instantly (passed through the proxy)

### Live Preview

The CLI prints a preview URL:

```
✓ Dev session started
  Preview: https://mindstudio.ai/v2/{appId}/run?dev-preview=true
```

Open this in a browser to see your web interface with live data.
Method invocations from this preview route through the tunnel for
local execution.

---

## Schema Sync

When you add or modify table definitions, the CLI syncs the changes
to the dev database:

```
POST /dev/manage/sync-schema
Body: { tables: [{ name: "vendors", source: "import { db }..." }] }
```

The platform parses the TypeScript, diffs against the current dev
database, and applies DDL:
- New tables: `CREATE TABLE`
- New columns: `ALTER TABLE ADD COLUMN`
- No destructive changes (column drops, type changes)

This happens automatically when the CLI detects changes to table
files, or you can trigger it manually.

---

## Database in Dev

The dev session gets its own database — a snapshot of the live
database at session start. Your dev code writes to this snapshot,
not to production.

### Reset to Live Data

```
POST /dev/manage/reset
```

Overwrites the dev database with a fresh copy of production data.
Preserves IDs (no reload needed).

### Truncate (Empty Tables)

```
POST /dev/manage/reset
Body: { "mode": "truncate" }
```

Keep the schema, delete all row data. Used by scenarios for a clean
canvas before seeding.

### Scenarios

Run a scenario to set up a specific data state:

1. Truncate all tables
2. Execute the seed function (same `db.push()` as methods)
3. Impersonate the specified roles

See [Scenarios](08_scenarios.md).

---

## Impersonation

Test your app from different users' perspectives:

```
POST /dev/manage/impersonate
Body: { "roles": ["admin"] }
```

Subsequent method executions use the overridden roles. Refresh the
browser to see the app from the new perspective. Clear with
`{ "roles": [] }`.

---

## Debugging

### Console Output

`console.log`, `console.warn`, and `console.error` in your methods
are captured and displayed in the CLI terminal. Use them for debugging
— they don't affect the method's return value.

### Request Logs

```
GET /apps/{appId}/requests
GET /apps/{appId}/requests/{requestId}
```

Every method execution (including dev) is logged with full input,
output, duration, and error info.

### Method Metrics

```
GET /apps/{appId}/metrics/summary
GET /apps/{appId}/metrics/methods/{methodId}
```

Aggregated execution metrics — call count, error rate, duration
percentiles.

---

## Hosted Editor (Sandbox)

As an alternative to local development, the hosted sandbox editor
provides the same development experience in the browser:

- File tree + Monaco editor
- Live preview
- Terminal / process output
- AI coding agent (remy)
- TypeScript language server

The sandbox uses the same tunnel binary in headless mode — same
execution pipeline, same database, same SDK. Code that works in the
sandbox works locally and in production.

The sandbox is your persistent working environment. It's automatically
snapshotted when idle, so you never lose work. Resume where you left
off by starting a new sandbox — it restores from the latest snapshot.
