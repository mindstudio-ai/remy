# Data Flows

End-to-end traces through the system for every major operation. Read this to understand how the services connect in practice.

---

## App Creation → First Deploy

```
Developer
  │
  ├─ mindstudio init (or platform UI)
  │    └─ POST /_internal/v2/apps/create
  │         └─ Creates bare git repo on git.mscdn.ai
  │              Returns { appId, gitCloneUrl }
  │
  ├─ git clone https://git.mscdn.ai/{appId}.git
  ├─ Write mindstudio.json, methods, tables, interfaces
  ├─ git push
  │
  └─ Platform receives push (post-receive hook)
       ├─ Archive repo to S3 (durability)
       ├─ POST /_internal/v2/apps/{appId}/rebuild
       │    ├─ Read mindstudio.json from commit
       │    ├─ Create release record (status: building)
       │    ├─ Mirror files to S3 (v2-git-files/)
       │    └─ Fire-and-forget: compileRelease()
       │
       └─ compileRelease() (async)
            ├─ Bundle each method → JS (esbuild, from git)
            ├─ Build web interface (SPA build service → S3)
            ├─ Parse table schemas (TypeScript AST)
            ├─ Compute pending effects (roles, cron, bots, tables)
            ├─ Create database (clone live if exists, apply DDL)
            └─ Promote to live (apply effects, swap pointer)
```

---

## Method Execution (Live)

```
User clicks button in web SPA
  │
  ├─ Frontend SDK: api.submitVendor({ name: 'Acme' })
  │    └─ Looks up 'submitVendor' in __MINDSTUDIO__.methods → methodId
  │
  ├─ POST /_internal/v2/apps/{appId}/methods/{methodId}/invoke
  │    Authorization: Bearer ms_iface_{token}
  │    Body: { input: { name: 'Acme' } }
  │
  ├─ Platform API:
  │    ├─ Validate interface session token → userId, orgId, releaseId
  │    ├─ Load live release (Postgres, cached)
  │    ├─ Load compiled JS from S3 (Redis cached, 1hr)
  │    ├─ Load execution context (roles, databases — Redis cached, 5min)
  │    ├─ Generate hook authorization token (30min TTL)
  │    └─ POST /execute-compiled-script on execution service
  │
  ├─ Execution Service:
  │    ├─ Acquire sandbox from warm pool (or create cold)
  │    ├─ Write handler.js + index.js
  │    ├─ Run: node index.js
  │    │    ├─ globalThis.ai = { auth, databases }
  │    │    ├─ import handler, call submitVendor(input)
  │    │    │
  │    │    ├─ Handler calls: await Vendors.push({ name, status: 'pending' })
  │    │    │    └─ SDK: POST /_internal/v2/db/query
  │    │    │         Authorization: {CALLBACK_TOKEN}
  │    │    │         Body: { queries: [{ sql: 'INSERT INTO vendors...', params: [...] }] }
  │    │    │
  │    │    │         Platform:
  │    │    │         ├─ Validate hook token → appVersionId
  │    │    │         ├─ Resolve database (first for this version)
  │    │    │         ├─ Download .db from S3 (or local cache)
  │    │    │         ├─ Execute SQL (with RETURNING)
  │    │    │         ├─ Upload .db to S3, bump Redis version
  │    │    │         └─ Return { results: [{ rows: [...] }] }
  │    │    │
  │    │    └─ Return { vendorId: '...' }
  │    │
  │    └─ Read result.json → return to platform
  │
  └─ Platform returns { output: { vendorId: '...' }, $releaseId, $methodId, $durationMs }
       └─ Frontend SDK returns { vendorId: '...' } to the caller
```

---

## Method Execution (Dev — Local CLI)

```
User clicks button in web SPA (served via tunnel proxy)
  │
  ├─ Frontend SDK: api.submitVendor({ name: 'Acme' })
  │    └─ Same as live — __MINDSTUDIO__ was injected by tunnel proxy
  │
  ├─ POST /_internal/v2/apps/{appId}/methods/{methodId}/invoke
  │    Authorization: Bearer ms_iface_{token}
  │    (token has devSessionId + devVersionId set)
  │
  ├─ Platform API (dev path):
  │    ├─ Detect dev session from interface token
  │    ├─ Generate hook token scoped to dev release
  │    ├─ Check role override (impersonation)
  │    ├─ Queue request in Redis:
  │    │    devSessionDao.createRequest(devSessionId, {
  │    │      type: 'execute', methodId, methodExport,
  │    │      input, authorizationToken, roleOverride, streamId
  │    │    })
  │    └─ Wait for result (Redis pub/sub, 30s timeout)
  │
  ├─ Tunnel (on developer's machine):
  │    ├─ GET /_internal/v2/apps/{appId}/dev/poll (long-poll)
  │    ├─ Receives the queued request
  │    ├─ Transpile method source with esbuild
  │    ├─ Spawn child process:
  │    │    ├─ Set CALLBACK_TOKEN = authorizationToken
  │    │    ├─ Set globalThis.ai = { auth, databases }
  │    │    ├─ Import transpiled module
  │    │    ├─ Call submitVendor(input)
  │    │    │    └─ SDK db.push() → POST /db/query (same as live)
  │    │    └─ Return result
  │    └─ POST /_internal/v2/apps/{appId}/dev/result/{requestId}
  │
  └─ Platform resolves the waiting request → returns to frontend
```

**Key insight:** The database query path is identical in live and dev. The only difference is *who* executes the method (sandbox vs local process) and *which* database version the token points at (live release vs dev release). The SDK code is the same.

---

## Sandbox Editor Session

```
Developer opens editor in browser
  │
  ├─ POST /_internal/v2/apps/{appId}/sandbox/start
  │    ├─ Check for existing active session
  │    │    ├─ If exists + still starting: return as-is
  │    │    ├─ If exists + running: verify via execution service
  │    │    │    ├─ Alive: return existing session
  │    │    │    └─ Dead: mark stopped, fall through
  │    │    └─ If none: continue
  │    ├─ Find last snapshot (from most recent session)
  │    ├─ Insert new session (status: starting)
  │    └─ Fire-and-forget: call execution service
  │
  ├─ Execution Service:
  │    ├─ Create Vercel sandbox (from snapshot or scaffold)
  │    ├─ If fresh: install packages, build C&C server
  │    ├─ Start C&C server as detached process
  │    ├─ Poll /health until ready (2s interval, 120s timeout)
  │    └─ Return { sandboxId, sandboxToken, cncDomain }
  │
  ├─ Platform updates session row (status: running, cncDomain, etc.)
  │
  ├─ Frontend polls GET /sandbox/status until cncDomain is populated
  │
  ├─ Frontend connects: wss://{cncDomain}/ws?token={sandboxToken}
  │    └─ C&C server sends init frame (file tree, chat history, etc.)
  │
  ├─ Editor is live — all subsequent interaction is direct WebSocket
  │    (platform API is not in this path)
  │
  ├─ Frontend sends keepalive every ~5 minutes
  │    └─ POST /sandbox/keepalive → extends date_should_cleanup
  │
  └─ Developer closes tab
       ├─ Keepalives stop
       ├─ Cron (every 5 min) finds date_should_cleanup < NOW()
       ├─ POST /sandbox/stop on execution service
       │    ├─ Snapshot (suspends container, preserves state)
       │    └─ Return { snapshotId }
       └─ Platform saves snapshotId, marks session stopped
            └─ Next start resumes from this snapshot
```

---

## Database Query Routing

```
SDK calls db.push() or db.filter()
  │
  ├─ SDK builds SQL (predicate compiler for filters)
  ├─ POST /_internal/v2/db/query
  │    Authorization: {CALLBACK_TOKEN}
  │    Body: { queries: [{ sql, params }] }
  │
  ├─ Platform:
  │    ├─ Validate hook token → extract appVersionId
  │    ├─ Resolve databaseId (explicit or first/default)
  │    ├─ S3 key: app-databases/{appVersionId}/{databaseId}.db
  │    │
  │    ├─ Read path (SELECT):
  │    │    ├─ Check local cache: version match? file exists?
  │    │    │    ├─ Hit: use cached .db file
  │    │    │    └─ Miss: download from S3, update cache
  │    │    └─ Execute query, return rows
  │    │
  │    └─ Write path (INSERT/UPDATE/DELETE):
  │         ├─ Acquire Redis lock (per database)
  │         ├─ Download .db from S3
  │         ├─ Set _session table (user_id for triggers)
  │         ├─ Execute SQL (with RETURNING)
  │         ├─ Upload .db to S3
  │         ├─ Release lock
  │         ├─ Bump Redis version counter
  │         └─ Return rows
  │
  └─ SDK deserializes result (strip @@user@@ prefix, parse JSON columns)
```

---

## Release Pipeline (git push → live)

```
git push to default branch
  │
  ├─ Post-receive hook:
  │    ├─ Sync bare repo to S3
  │    ├─ Bump Redis version counter
  │    └─ Trigger rebuild
  │
  ├─ compileRelease(release, repoPath, headSha, appId, gitUrl):
  │
  │    ├─ 1. Read package.json at commit (for npm dependencies)
  │    │
  │    ├─ 2. Compile methods (parallel):
  │    │    For each method in manifest:
  │    │    ├─ Read source from git (git show)
  │    │    ├─ esbuild bundle → single JS file
  │    │    ├─ Extract npm packages + versions
  │    │    ├─ Upload to S3: v2-builds/{appId}/{sha}/methods/{methodId}.js
  │    │    └─ Track bundle size
  │    │
  │    ├─ 3. Compile interfaces (parallel):
  │    │    ├─ web: SPA build service → archive → S3
  │    │    ├─ api/mcp: generate method index with schemas
  │    │    └─ cron/email/webhook/discord/telegram: generate config
  │    │
  │    ├─ 4. Compute pending effects:
  │    │    ├─ Roles diff (manifest vs current app roles)
  │    │    ├─ Cron diff (from interface config)
  │    │    ├─ Bot command diffs (Discord, Telegram)
  │    │    ├─ Webhook endpoint diffs
  │    │    └─ Table schema diff:
  │    │         ├─ Parse TypeScript table files (AST)
  │    │         ├─ Compare columns against live database
  │    │         └─ Generate DDL (CREATE TABLE, ALTER TABLE ADD COLUMN)
  │    │
  │    ├─ 5. Create staging database:
  │    │    ├─ Clone live database to staging version
  │    │    └─ Apply table DDL to staging copy
  │    │
  │    └─ 6. Promote to live:
  │         ├─ Apply role changes (create/update/delete)
  │         ├─ Apply cron changes
  │         ├─ Sync bot commands (Discord API, Telegram API)
  │         ├─ Update webhook registrations
  │         ├─ Swap current_v2_release_id pointer
  │         └─ Mark release as 'live', old release as 'superseded'
  │
  └─ Feature branch (non-default):
       └─ Same compilation, but marked as 'preview' instead of 'live'
            └─ Accessible via branch-specific URL
```

---

## Scenario Execution

```
Developer (or agent) triggers scenario
  │
  ├─ 1. Truncate:
  │    POST /_internal/v2/apps/{appId}/dev/manage/reset
  │    Body: { mode: 'truncate' }
  │    └─ DELETE FROM every user table (preserves schema + IDs)
  │
  ├─ 2. Get token:
  │    POST /_internal/v2/apps/{appId}/dev/manage/token
  │    └─ Returns { authorizationToken } scoped to dev release
  │
  ├─ 3. Execute seed:
  │    ├─ Transpile scenario file (esbuild)
  │    ├─ Spawn child process with CALLBACK_TOKEN = authorizationToken
  │    ├─ Scenario calls db.push() → routes to dev database
  │    └─ Seed data is now in the dev snapshot
  │
  └─ 4. Impersonate:
       POST /_internal/v2/apps/{appId}/dev/manage/impersonate
       Body: { roles: ['ap'] }
       └─ Subsequent method executions use this role context
```
