# Local Dev Tunnel (`mindstudio-local`)

CLI tool that bridges a local development environment to the platform. Polls for method execution requests, transpiles TypeScript, executes methods in isolated child processes, and reports results back. Also runs a proxy server that injects `window.__MINDSTUDIO__` into HTML responses so the frontend SDK works without configuration.

Designed to be useful standalone: a developer can use it for local development without the sandbox editor. The sandbox uses it in headless mode (same binary, `--headless` flag) to execute methods inside the container.

This is where the zero-divergence principle lives: the same tunnel binary, the same execution pipeline, the same database routing runs in both local dev and the hosted sandbox. Code that works locally works in the sandbox works in production.

Source: `/Users/sean/Dropbox/Projects/youai/mindstudio-local-model-tunnel/src/dev/`

---

## Standalone CLI

```bash
npm install -g @mindstudio-ai/local-model-tunnel
mindstudio-local
```

### Auth Flow

1. CLI calls `GET /developer/v2/request-auth-url` → gets a URL + token
2. Opens the URL in the browser (MindStudio login page)
3. User logs in and authorizes
4. CLI polls `POST /developer/v2/poll-auth-url` until the token resolves to an API key
5. API key is saved to `~/.mindstudio-local-tunnel/config.json`

### Starting a Dev Session

```bash
cd my-app
mindstudio-local --port 5173
```

1. Read `mindstudio.json` from the working directory
2. Read `dist/interfaces/web/web.json` for dev server config
3. `POST /_internal/v2/apps/{appId}/dev/manage/start` with:
   - `branch`: current git branch (or 'main')
   - `proxyUrl`: local proxy URL
   - `methods`: local method definitions from manifest
4. Receive session context (releaseId, auth, databases, user, methods, clientContext)
5. Start the proxy server (injects `__MINDSTUDIO__` into HTML)
6. Start the poll loop

---

## Dev Session Lifecycle

### Poll Loop

The tunnel continuously polls `GET /_internal/v2/apps/{appId}/dev/poll`:

1. Send poll request (includes `proxyUrl` for dashboard link, records heartbeat)
2. Long-poll blocks for up to 30 seconds
3. On request: receive `{ requestId, methodId, methodExport, input, authorizationToken, roleOverride?, streamId? }`
4. Execute the method locally (see below)
5. Post result to `POST /_internal/v2/apps/{appId}/dev/result/{requestId}`
6. Loop

**Concurrent execution:** Multiple methods can execute in parallel. The poll loop continues while methods run in the background.

**Backoff:** Exponential backoff on connection errors. 404 from poll means the session expired (stops immediately).

**Heartbeat:** Each poll records a heartbeat on the platform. The dashboard uses this to show the session as "connected" and to display the proxy URL for live preview.

### Method Execution

For each incoming request:

1. **Transpile** the source file with esbuild:
   - Format: ESM, platform: Node, target: node22
   - Bundle: true (resolves all imports)
 - `@mindstudio-ai/agent` marked as external (resolved from project's `node_modules` at runtime, not bundled)
   - Output: `.mjs` file in `{node_modules}/.cache/mindstudio-dev/`

2. **Spawn** an isolated child process with bootstrap script:
   - Set `globalThis.ai = { auth, databases }` (SDK context)
   - Set env: `CALLBACK_TOKEN`, `REMOTE_HOSTNAME`
 - Redirect `console.log/warn/error` to a buffer (prevents corrupting JSON stdout)
   - Import the transpiled module
   - Call the named export with input params
   - Write result as JSON to stdout

3. **Collect** result: `{ success, output?, error?, stdout?, stats? }`
4. **Post** to platform

**Timeout:** 30 seconds per execution.

**Why esbuild:** Fast enough for per-request transpilation (no watch mode needed). Handles TypeScript + ESM. Bundling resolves all imports so the child process has a single entry point.

**Why external SDK:** The `@mindstudio-ai/agent` package reads env vars (`CALLBACK_TOKEN`) and `globalThis.ai` at runtime. Bundling it would break this; the bundled copy wouldn't see the runtime context. Marking it external means it resolves from the project's installed version.

---

## Proxy Server

Sits between the browser and the upstream dev server (Vite, webpack, etc.). Purpose: inject `window.__MINDSTUDIO__` into HTML responses.

**How it works:**
- HTML responses: buffered, `<script>` tag with `__MINDSTUDIO__` injected before `</head>`, then served
- Non-HTML (JS, CSS, images): piped through unmodified
- WebSocket upgrades: forwarded transparently (enables HMR)
- CORS + Private Network Access headers added (works inside iframes)
- Caching disabled (local dev, always fresh)

**What `__MINDSTUDIO__` contains:**
```json
{
  "token": "ms_iface_...",
  "releaseId": "...",
  "user": { "id", "name", "email", "profilePictureUrl" },
  "methods": { "submitVendor": "method-uuid", ... }
}
```

This is the exact same object that's injected in production (by the static hosting CDN) and in the sandbox (by the tunnel running inside the container). Zero divergence. The SDK uses same-origin `/_/` paths for all API calls — the platform proxy resolves the app from the subdomain, so no `appId` or `apiBaseUrl` is needed.

**Why proxy injection:** The frontend SDK (`@mindstudio-ai/interface`) reads `window.__MINDSTUDIO__` to know how to map method names to IDs. By injecting this at the proxy level, the frontend code works identically in dev and production without any configuration.

---

## Headless Mode

```bash
mindstudio-local --headless --port 5173 --bind 0.0.0.0
```

No TUI. JSON events on stdout, all logging to stderr. Used by the C&C server inside the sandbox.

### Stdout Events

```json
{ "event": "session-started", "proxyPort": 4389, "sessionId": "..." }
{ "event": "method-start", "requestId": "...", "methodId": "..." }
{ "event": "method-complete", "requestId": "...", "success": true, "duration": 234 }
{ "event": "error", "message": "..." }
{ "event": "scenario-start", "id": "ap-overdue-invoices" }
{ "event": "scenario-complete", "id": "...", "success": true, "duration": 456 }
```

### Stdin Commands

```json
{ "action": "runScenario", "scenarioId": "ap-overdue-invoices" }
{ "action": "syncSchema" }
{ "action": "listScenarios" }
{ "action": "impersonate", "roles": ["admin"] }
{ "action": "clearImpersonation" }
{ "action": "listRoles" }
```

The C&C server bridges these to WebSocket actions, so the browser can trigger scenarios, sync schema, and switch roles through the editor UI, which routes through the C&C server to the tunnel.

**Why headless mode:** The same binary, the same execution pipeline, just a different interface. In the sandbox, the C&C server needs to drive the tunnel programmatically. Rather than building a separate library, headless mode wraps the existing functionality in a JSON protocol. This also means any improvements to the tunnel automatically work in both standalone and sandbox modes.

---

## Schema Sync

The CLI detects table definition changes and syncs them to the platform:

1. Read table files from `mindstudio.json` manifest
2. `POST /_internal/v2/apps/{appId}/dev/manage/sync-schema` with raw TypeScript source for each table
3. Platform parses the TypeScript, diffs against current dev database, applies DDL (CREATE TABLE, ALTER TABLE ADD COLUMN)
4. Returns created/altered tables and updated database state

Additive only: new tables and new columns. No destructive changes in development (column drops, type changes happen via migrations on deploy).

---

## Events System

The tunnel emits events via a singleton `DevEventEmitter`:

- `dev:start` — method execution starting
- `dev:complete` — method execution finished
- `dev:session-expired` — session no longer valid
- `dev:connection-warning` / `dev:connection-restored` — connectivity
- `dev:impersonate` — role override changed
- `dev:scenario-start` / `dev:scenario-complete` — scenario execution

The TUI and headless mode subscribe independently; the event emitter decouples execution from presentation.

---

## Config

Stored at `~/.mindstudio-local-tunnel/config.json`:

```json
{
  "activeEnv": "prod",
  "environments": {
    "prod": {
      "apiKey": "sk...",
      "baseUrl": "https://v1.mindstudio-api.com",
      "userId": "..."
    }
  }
}
```

The C&C server writes this file during bootstrap (step 6) so the tunnel inside the sandbox knows how to authenticate.

---

## Design Rationale

**Why standalone:** The tunnel is valuable without the sandbox; it's the primary development tool for local-first developers. Making it a standalone CLI (not a library embedded in the C&C server) means it can be installed, updated, and used independently.

**Why poll-based:** Works through any NAT or firewall. No inbound connections needed. The developer's machine polls the platform. No WebSocket keep-alive, no port forwarding, no tunneling service. Simple to implement, simple to debug, and reliable across network configurations.
