# Platform API (`youai-api`)

The central backend for MindStudio Apps. An Express HTTP server, WebSocket server, and SQS background worker running in Kubernetes.

The API is the orchestrator — it decides policy (when to start/stop sandboxes, how to route method calls, what permissions to enforce) while delegating mechanism to other services. It never runs user code directly. In the three-layer hierarchy (spec → contract → interfaces), the API is what makes the transitions work: it compiles specs into releases (the contract), serves interfaces, manages databases, and orchestrates the development environment.

All v2 routes live under the `/_internal/v2/` prefix. The route files are organized by domain in `src/http/routes/V2Apps/`:

```
V2Apps/
  index.ts           — orchestrator (imports + calls all sub-modules)
  apps.ts            — app CRUD, rebuild, file access
  methods.ts         — method invocation, db/query, webhooks
  dashboard.ts       — dashboard, load-web, release detail
  devSession.ts      — dev session management (start, poll, result, sync, impersonate, token)
  sandbox.ts         — sandbox editor lifecycle (start, restart, reset, status, keepalive)
  roles.ts           — role CRUD, assignments
  integrations.ts    — Discord, Telegram, email
  agent.ts           — LLM proxy for coding agent
  requestLog.ts      — request logs + method metrics
```

---

## Authentication Model

The platform has multiple auth paths for different contexts. Each one serves a specific use case in the three-layer architecture.

### Cognito JWT (browser sessions)

Primary auth for the web frontend. AWS Cognito issues JWTs on login. The `checkLoginMiddleware` validates the JWT, resolves the user, and populates `res.locals.clientContext` with userId, organizationId, permissions, etc.

Used by: all editor-facing routes (dashboard, sandbox, roles, etc.)

### API Keys (`sk...`)

Organization-scoped API keys for external access. Starts with `sk` (no underscore). Validated against `organization_api_keys` in Postgres. Resolves to the key's user or falls back to the org owner.

Used by: method invocation (`/methods/:methodId/invoke`), agent chat (`/agent/chat`), dev tunnel authentication.

### Interface Session Tokens (`ms_iface_...`)

Short-lived tokens (1hr TTL, Redis) created when loading a web interface. Carry the full execution context: appId, releaseId, userId, organizationId, user display info, method map, and optionally dev session fields (devSessionId, devVersionId).

The token is embedded in the iframe URL via `__ms_token=` and used by the frontend SDK for method invocation. This is how the frontend knows which release to execute against without the user managing API keys.

Used by: method invocation from web SPAs.

### Hook Authorization Tokens (`InternalCallbackAuthorization@@...`)

Per-execution tokens generated when a method is dispatched. Stored in Redis with 30-minute TTL. Encode the full execution context:

```
{
  appId,
  appVersionId,    // which release (and therefore which database)
  userId,
  organizationId,
  threadId,
  requestSource,   // 'v2-dev', 'v2-webhook', etc.
  workflowId,
  stepId,
  tag,
  logId
}
```

The sandbox receives this token as `CALLBACK_TOKEN`. When the SDK makes a database query (`POST /_internal/v2/db/query`), it passes the token back. The platform validates it and uses `appVersionId` to route to the correct database version.

**Why callback tokens encode execution context (not just auth):** The token is not just proof of identity — it's a complete routing key. Without it, every SDK call would need to specify which release, which database version, which user context to use. By encoding all of this in the token, the SDK stays thin (just "make this query") and the platform handles routing. This is also what makes dev mode work transparently — a dev callback token points at the dev release's database, so `db.push()` in dev mode writes to the dev snapshot automatically.

### Signed Access Tokens (`sk_...`, `Signed-...`, `headless_...`)

Signed tokens for headless/embed contexts. Created by the platform for specific users scoped to specific apps. Used by embedded interfaces and headless integrations.

---

## App Lifecycle

### Create App

```
POST /_internal/v2/apps/create
Auth: login (JWT)
Body: { name }
Returns: { appId, shortId, name, gitCloneUrl }
```

Creates a new v2 app with an empty git repo on `git.mscdn.ai`. The repo is a bare git repository stored on disk and archived to S3 for durability. Each worker tracks a Redis version counter to know when to re-hydrate from S3.

### Rebuild (Compile from HEAD)

```
POST /_internal/v2/apps/:appId/rebuild
Auth: login + edit permission
Returns: { releaseId, commitSha, status: 'building' }
```

Triggers a build from the current HEAD of the default branch. The response returns immediately — compilation runs asynchronously (fire-and-forget).

**Build pipeline:**

1. Read `mindstudio.json` manifest, commit info, and diff in parallel
2. Upload diff to S3 (`v2-diffs/{appId}/{sha}.patch`)
3. Create a release record in Postgres (status: `building`)
4. Mirror files to S3 (`v2-git-files/{appId}/{branch}/...`) for instant editor access
5. Fire-and-forget: `compileRelease()` handles the rest:
   - Bundle each method → single-file JS (esbuild, in-memory from git)
   - Build web interface (SPA build service → archive → S3)
   - Parse table schemas (TypeScript AST → DDL diff)
   - Compute pending effects (roles, cron, Discord, Telegram, etc.)
   - On default branch: auto-promote to `live`, apply all effects
   - On feature branch: mark as `preview`

**Release statuses:** `building` → `compiled` → `live` / `preview` / `failed` → `superseded`

### Read Files

```
GET /_internal/v2/apps/:appId/files/*path
Auth: login + edit permission
Returns: { url } (signed S3 URL) or { content } (raw content)
```

Reads a file from the git repo at HEAD. Tries the S3 mirror first (instant, no git operation needed), falls back to `git show` from the bare repo.

### Dashboard

```
GET /_internal/v2/apps/:appId/dashboard
Auth: login + edit permission
Returns: { repo, liveRelease, releases, interfaces, previewReleases, devSession }
```

The main editor state endpoint. Loads everything needed to render the app dashboard in a single request, using parallel queries:

- Git repo state (branches, file tree, push history)
- Live release (full, with databases and diff URL)
- Recent releases (lightweight fragments)
- Active interfaces (cron, Discord, Telegram, webhook, email)
- Preview releases per branch
- Dev session status (if active)

### Release Detail

```
GET /_internal/v2/apps/:appId/releases/:releaseId
Auth: login + edit permission
Returns: { ...release, databases, commitDiffUrl }
```

Full release with databases and signed diff URL. Used when drilling into a specific release from the dashboard.

---

## Method Execution

The core of the runtime — how user code actually runs. The same endpoint serves all interfaces (web, API, webhook). The interface determines how the request arrives; the platform handles everything from there.

### Invoke

```
POST /_internal/v2/apps/:appId/methods/:methodId/invoke
Auth: interface session token (ms_iface_) or API key (sk...)
Body: { input: {...}, stream?: boolean }
Returns: { output, $releaseId, $methodId, $durationMs }
```

Two execution paths:

**Live execution** (no dev session):
1. Resolve the live release from Postgres
2. Load compiled JS from S3 (Redis cached, 1hr TTL)
3. Load execution context — role assignments + database metadata (Redis cached, 5min TTL)
4. Generate hook authorization token
5. Dispatch to sandbox: `POST /execute-compiled-script` on the execution service
6. Return result

**Dev execution** (interface session has devSessionId):
1. Find the dev release (or fall back to live for method metadata)
2. Generate hook token scoped to the dev release
3. Check for role override (impersonation)
4. Queue the request in Redis (via `devSessionDao.createRequest`)
5. Wait for result (the tunnel polls, executes locally, and posts the result back)
6. Log execution and record metrics (fire-and-forget)
7. Return result

**Why poll-based dev sessions:** The tunnel (running on the developer's machine or in the sandbox) polls the platform for method requests. This works through any NAT or firewall — no inbound connections needed. The platform queues requests in Redis, the tunnel claims them, executes locally, and posts results back. Simple, reliable, debuggable.

**Streaming support:** When `stream: true`, the response is SSE. A `streamId` is generated and passed to the executor. Token chunks are published via Redis pub/sub and forwarded to the client as they arrive. The final response is sent as a `{ type: 'done', ... }` event.

### Database Query

```
POST /_internal/v2/db/query
Auth: hook authorization token
Body: { queries: [{ sql, params? }], databaseId? }
Returns: { results: [...] }
```

Direct database access for the SDK. The hook token determines which release (and therefore which database version) to query against. Supports multiple queries in a single request, bind parameters, and `RETURNING` clauses on writes.

If no `databaseId` is provided, uses the first (default) database for the release.

### Webhook

```
ALL /_internal/v2/webhook/:appId/:secret
Auth: none (secret in URL)
Body: varies (caller's request)
Returns: method output or 204
```

Inbound webhook endpoint. The secret identifies which endpoint and method to invoke. Accepts any HTTP method. The request shape (method, headers, query, body) is passed as input to the method.

---

## Dev Session Management

The dev session is how the local CLI (or sandbox tunnel) connects to the platform for live development. It's a release with `status: 'dev'` that serves as the execution context for poll-based method execution.

### Start Dev Session

```
POST /_internal/v2/apps/:appId/dev/manage/start
Auth: login + edit permission
Body: { branch?, proxyUrl?, methods? }
Returns: { sessionId, releaseId, branch, auth, databases, user, methods, webInterfaceUrl, clientContext, previewUrl }
```

Creates or resumes a dev session:

1. Check for existing dev release — resume if found
2. If no dev release:
 - Clone from live release (if exists): copy manifest, methods, interfaces, snapshot databases for dev isolation
   - Or create empty dev release (fresh app, no deploys yet)
3. Load execution context (role assignments, databases)
4. If CLI sent local methods (from `mindstudio.json`), update the dev release's method list
5. Build method map (export name → method ID)
6. Create interface session token with dev fields
7. Record initial heartbeat (so dashboard sees the session immediately)
8. Return everything the CLI needs to start working

**The `clientContext` object** is the exact shape of `window.__MINDSTUDIO__` — the CLI's proxy injects it into HTML responses so the frontend SDK works without configuration.

### Generate Callback Token

```
POST /_internal/v2/apps/:appId/dev/manage/token
Auth: login + edit permission
Returns: { authorizationToken }
```

Returns a fresh hook authorization token scoped to the dev release. Used by the CLI for local executions outside the poll loop — specifically scenario seeds. The scenario transpiles and runs in a child process with `CALLBACK_TOKEN` set to this token, so SDK calls (`db.push()`, etc.) route to the correct dev database.

### Poll for Requests

```
GET /_internal/v2/apps/:appId/dev/poll?proxyUrl=...
Auth: x-dev-session header (dev release ID)
Returns: { requestId, type, methodId, methodExport, input, authorizationToken, roleOverride?, streamId? } or 204
```

Long-poll (30 seconds). The tunnel calls this in a loop. Each poll also records a heartbeat and updates the proxy URL (so the dashboard can link to the live preview).

### Submit Result

```
POST /_internal/v2/apps/:appId/dev/result/:requestId
Auth: none (request ID is the key)
Body: { type, success, output?, error?, stdout?, stats? }
Returns: 204
```

The tunnel posts execution results back. The platform resolves the waiting request (from the invoke endpoint) via Redis pub/sub.

### Schema Sync

```
POST /_internal/v2/apps/:appId/dev/manage/sync-schema
Auth: login + edit permission
Body: { tables: [{ name, source }] }
Returns: { created, altered, errors, databases }
```

The CLI sends raw TypeScript table source files. The platform parses each one (via TypeScript AST), diffs against the current dev database, and applies DDL (CREATE TABLE, ALTER TABLE ADD COLUMN). Returns the list of changes and fresh database state.

### Database Reset

```
POST /_internal/v2/apps/:appId/dev/manage/reset
Auth: login + edit permission
Body: { mode?: 'truncate' }
Returns: { databases }
```

Two modes:

- **Default:** Reset in place — overwrite the dev `.db` file from the live database. Preserves database and table IDs (no client reload needed). Schema is updated to match live.
- **`mode=truncate`:** Keep schema, delete all row data. Used by scenarios for a clean canvas before seeding.

**Why IDs are preserved:** The frontend and SDK may hold references to database IDs from a previous status/start response. If a reset changed the IDs, every client would need to reload to pick up the new ones. By resetting in place (overwriting the `.db` file at the same S3 key, keeping the same Postgres records), the existing IDs remain valid.

### Impersonate

```
POST /_internal/v2/apps/:appId/dev/manage/impersonate
Auth: login + edit permission
Body: { roles: ['admin', 'ap'] }
Returns: { roles }
```

Sets a role override on the dev session. Subsequent method executions include the override in the request (the tunnel passes it through). Pass `null` or empty array to clear.

### Dev Status

```
GET /_internal/v2/apps/:appId/dev/status
Auth: login
Returns: { releaseId, commitSha, branch, connected, proxyUrl, roleOverride } or null
```

Lightweight check for active dev session. Used by the frontend to decide whether to show the dev preview or the live release.

### Stop Dev Session

```
POST /_internal/v2/apps/:appId/dev/manage/stop
Auth: x-dev-session header
Returns: { success: true }
```

Marks the dev release as `superseded`. Called by the CLI on shutdown.

---

## Sandbox Editor Lifecycle

The sandbox is the hosted development environment — a Vercel container running the C&C server (see [sandbox-server.md](03_sandbox-server.md)). The API manages the sandbox lifecycle; the browser connects directly to the C&C server's WebSocket for the actual editing experience.

### State Machine

```
(no session) → starting → running → stopped
                              ↓
                          stopping → stopped
```

Stored in Postgres (`v2_sandbox_sessions`). One active session per app.

### Start

```
POST /_internal/v2/apps/:appId/sandbox/start
Auth: login + edit permission
Returns: { sessionId, cncDomain, sandboxToken, status }
```

Creates or resumes a sandbox:

1. If an active session exists:
   - If still starting (no `cncDomain` yet): return it
   - If running: verify it's alive via `POST /sandbox/verify`
     - Alive: return it
     - Dead: mark stopped, fall through to create new
2. Find the last snapshot (from most recent stopped session)
3. Fall back to base snapshot (from site settings) if no previous
4. Insert new session row (status: `starting`)
5. Fire-and-forget: call execution service `POST /sandbox/start`
   - Generates a git clone token (6hr TTL in Redis, embedded in URL)
   - Passes the org's API key (for tunnel + agent auth)
 - On success: update row with sandboxId, cncDomain, sandboxToken, status: `running`
   - On failure: mark row as `stopped`
6. Return immediately with status: `starting`

The frontend polls `GET /sandbox/status` until `cncDomain` is populated, then connects the WebSocket.

**Why fire-and-forget:** Sandbox creation takes 30-120 seconds (Vercel provisioning + C&C bootstrap). Blocking the HTTP response would time out. Instead, the client gets the session ID immediately and polls for readiness.

**Why verify on start:** If the DB says a sandbox is running but the container died (Vercel timeout, crash, etc.), the client would get stale connection info and fail. Verifying via the execution service's health probe catches this and transparently recovers.

### Status

```
GET /_internal/v2/apps/:appId/sandbox/status
Auth: login + edit permission
Returns: { session, devReleaseId, databases }
```

Returns the active sandbox session (if any), the dev release ID (for database operations), and dev databases. Also verifies liveness — if the DB says `running` but the sandbox is dead, marks it stopped and returns `session: null`.

### Restart

```
POST /_internal/v2/apps/:appId/sandbox/restart
Auth: login + edit permission
Returns: { sessionId, cncDomain, sandboxToken, status }
```

Stops the current sandbox (with snapshot to preserve work) and starts a fresh one. The new sandbox resumes from the snapshot. Use when the sandbox is stuck or out of sync.

### Reset

```
POST /_internal/v2/apps/:appId/sandbox/reset
Auth: login + edit permission
Returns: { ok: true }
```

Kills the sandbox without snapshotting (discards state) and deletes all session rows including snapshot references. The next start will be a completely fresh clone from the base snapshot. This is the nuclear escape hatch.

### Keepalive

```
POST /_internal/v2/apps/:appId/sandbox/keepalive
Auth: login + edit permission
Returns: { ok: true }
```

Extends `date_should_cleanup` by 10 minutes. The frontend calls this on a regular interval while the editor is open. When keepalives stop (user closes the tab), the cron cleanup eventually snapshots and stops the sandbox.

### Cleanup (Cron)

The `cleanDanglingSessions()` method runs on the 5-minute cron. Finds sessions where:
- `date_should_cleanup < NOW()` (idle — no keepalives)
- `date_will_timeout < NOW()` (Vercel hard timeout reached)

For each: calls `POST /sandbox/stop` on the execution service (which snapshots by default), saves the `snapshotId`, marks the session stopped.

**Why snapshot by default on stop:** The sandbox contains the user's working environment — uncommitted changes, node_modules, agent chat history. Losing it means losing their work. By snapshotting before every stop (including idle cleanup), we protect user work even when they forget to save or their connection drops. The `skipSnapshot` option exists only for intentional resets.

**Why the API manages lifecycle, not the execution service:** The execution service is deliberately stateless — it provides primitives (start, stop, verify). The API decides policy: when to snapshot, how long to keep a sandbox idle, whether to verify before returning stale state. This separation means we can change lifecycle policy without modifying the execution service.

---

## Database Management

Apps use managed SQLite databases. Each database is a `.db` file stored on S3 with local caching on the API server. Databases are scoped to a release version — dev, staging, and live each get their own copy.

See [infrastructure.md](09_infrastructure.md) for the full storage map and S3 key schemes.

**Why SQLite on S3:** SQLite gives each app a real relational database with zero configuration. S3 provides durability and cross-worker access. The tradeoff is that writes require a download-modify-upload cycle with a Redis lock for concurrency — but for the write patterns of typical MindStudio apps (moderate throughput, small databases), this works well and avoids the operational complexity of per-app Postgres databases.

**Why per-version databases:** Each release gets its own database copy (keyed by `appVersionId`). This provides complete isolation between dev, staging, and production. A dev session can freely mutate data without affecting live. Schema changes are applied to a staging copy and promoted atomically. Rollback is instant — the previous release's database is still there.

### Query Routing

The SDK calls `POST /_internal/v2/db/query` with the hook token. The platform:

1. Validates the token → extracts `appVersionId`
2. Resolves the database ID (explicit or first/default)
3. Routes to the correct `.db` file on S3
4. Executes queries (with local file caching)
5. Returns results

The `appVersionId` is the release ID. In dev mode, it's the dev release ID. In production, it's the live release ID. The SDK doesn't know or care — the token handles routing.

### Reset and Truncate

Two operations for development, both preserve database/table IDs:

- **Reset** (`resetDatabasesInPlace`): Copy the live `.db` file over the dev one. Same IDs, fresh data from production.
- **Truncate** (`truncateDatabases`): Run `DELETE FROM` on every user table. Same IDs, same schema, empty tables.

---

## Agent Chat

```
POST /_internal/v2/agent/chat
Auth: API key (sk...) or hook token
Body: { system, messages, tools?, maxTokens?, temperature?, model?, config? }
Returns: SSE stream (text, thinking, tool_use, done, error events)
```

Vendor-agnostic LLM proxy. The coding agent (remy) sends messages here. The platform handles model routing (the org's default model or an explicit model ID), billing, and provider translation (Anthropic, OpenAI, Vertex AI, Mistral).

The response is an SSE stream. The agent reads tool_use events, executes tools locally, and sends results back in the next request.

**Why a platform endpoint instead of direct API calls:** The agent doesn't need provider SDKs, API keys, or billing logic. The platform handles all of that. This also means the agent works with any model the platform supports — switching models is a configuration change, not a code change.

---

## Integrations

All integration routes follow the same pattern: login + edit permission, CRUD operations on the integration registration.

### Roles

```
GET  /_internal/v2/apps/:appId/roles/list
POST /_internal/v2/apps/:appId/roles/create         { roleName, description? }
POST /_internal/v2/apps/:appId/roles/update         { roleName, newName?, description? }
POST /_internal/v2/apps/:appId/roles/delete         { roleName }
GET  /_internal/v2/apps/:appId/roles/assignments
POST /_internal/v2/apps/:appId/roles/set-user-roles { userId, roleNames[] }
POST /_internal/v2/apps/:appId/roles/get-users-by-role { roleName }
```

### Discord

```
POST /_internal/v2/apps/:appId/discord/register     { applicationId, botToken, publicKey }
GET  /_internal/v2/apps/:appId/discord/status
POST /_internal/v2/apps/:appId/discord/deregister
```

### Telegram

```
POST /_internal/v2/apps/:appId/telegram/register    { botId, token }
GET  /_internal/v2/apps/:appId/telegram/status
POST /_internal/v2/apps/:appId/telegram/deregister
```

### Email

```
POST /_internal/v2/apps/:appId/email/register       { name }
GET  /_internal/v2/apps/:appId/email/status
POST /_internal/v2/apps/:appId/email/deregister
GET  /_internal/v2/apps/:appId/email/check-available { name (query) }
```

Email addresses are `{name}@mindstudio-hooks.com`.

---

## Request Logging & Metrics

```
GET /_internal/v2/apps/:appId/requests                    { releaseId?, methodId?, interface?, limit?, offset? }
GET /_internal/v2/apps/:appId/requests/:requestId
GET /_internal/v2/apps/:appId/metrics/summary             { start, end, buckets }
GET /_internal/v2/apps/:appId/metrics/methods/:methodId   { start, end, buckets }
```

Every method execution (live and dev) is logged with full input/output, duration, and error info. Metrics are aggregated into 5-minute buckets for dashboards.

---

## Performance (warm path)

| Step | Time |
|------|------|
| Resolve release | ~2ms |
| Load execution context | ~1ms (cache hit) |
| Load compiled JS | ~0ms (cache hit) |
| Generate hook token | ~1ms |
| **API overhead total** | **~4ms** |
| Database query (cached .db) | ~2-4ms |
| Sandbox execution | varies (network + handler logic) |
