# Infrastructure

The "where does X live" reference. Storage systems, key schemes, cache layers, and database tables.

---

## Vercel Sandboxes

Isolated containers for code execution. Two use cases:

### Editor Sandboxes (C&C Server)

- Runtime: Node 24, 4 vCPUs / 8GB RAM
- Timeout: 1 hour (dev) / 5 hours (prod)
- Exposed port: 4387
- Created from: base snapshot (pre-baked) or scaffold git repo
- Snapshot: suspends the container, captures full filesystem
- Snapshot expiration: never (user's working environment)
- Cost: $0.08/GB-month for snapshot storage

### Execution Sandboxes (Function Execution)

- Runtime: Node 24 or Python 3.13
- Timeout: 30 minutes
- Created from: snapshot (warm pool) or fresh
- Single-use: one execution per sandbox
- Warm pool: 1 (dev) / 5 (prod) pre-created sandboxes

---

## S3 Storage

Bucket: `youai-appdata-private`

| Prefix | Content | Cache |
|--------|---------|-------|
| `app-databases/{versionId}/{databaseId}.db` | SQLite databases | Local file + Redis version |
| `v2-builds/{appId}/{commitSha}/methods/{methodId}.js` | Compiled method bundles | Redis (1hr) |
| `v2-git-files/{appId}/{branch}/{filePath}` | Mirrored git files | Signed URLs (1hr) |
| `v2-diffs/{appId}/{commitSha}.patch` | Commit diffs (unified) | Signed URLs (1hr) |
| `v2-static/{releaseId}/` | Web interface build output | CF Worker CDN |
| `git-repos/{appId}.tar` | Bare git repo archives | Redis version counter |

### Database Files

SQLite `.db` files with WAL mode enabled. Each database has:
- A Postgres metadata record (`app_data_databases` + `app_data_database_tables`)
- An S3 file at `app-databases/{versionId}/{databaseId}.db`
- A Redis version counter (`AppDataDb/Version/v1:{databaseId}`)
- A local file cache on each API worker (TTL: 1 hour)

**Write path:** acquire Redis lock → download from S3 → execute SQL → upload to S3 → release lock → bump version counter

**Read path:** check local cache version against Redis → hit: use local file → miss: download from S3

### Git File Mirror

After each push, files from the default branch are mirrored to S3 at `v2-git-files/{appId}/{branch}/{filePath}`. This enables instant file access in the editor via signed URLs (no git operations needed). Falls back to `git show` from the bare repo if the mirror hasn't completed yet.

---

## Redis

### Cache Namespaces

| Tag | Key | Value | TTL |
|-----|-----|-------|-----|
| `AppDataDb/Version/v1` | `{databaseId}` | version timestamp | — |
| Hook auth tokens | `{token}` | `{ appId, appVersionId, userId, orgId, ... }` | 30 min |
| `V2GitCloneToken` | `{token}` | `{ appId }` | 6 hours |
| `V2SandboxSessionDao/CallbackAuthorizations/v1` | `{token}` | `{ appId }` | 45 min |
| Compiled JS cache | `{releaseId}:{methodId}` | JS source | 1 hour |
| Execution context | `{releaseId}` | `{ roleAssignments, databases }` | 5 min |
| Permission cache | `{appId}/{userId}` | permission level | short |

### Session State

| Key pattern | Purpose |
|-------------|---------|
| Interface sessions (`ms_iface_*`) | 1hr TTL, carries user + method map + dev fields |
| Dev session heartbeat | Tracks tunnel connectivity |
| Dev session proxy URL | For dashboard live preview link |
| Dev session role override | Impersonation roles |
| Dev session request queue | Pending method execution requests |
| Dev session results | Published via pub/sub when tunnel posts results |

### Pub/Sub

| Channel | Purpose |
|---------|---------|
| V2 stream chunks | Token streaming from method execution |
| Dev request results | Tunnel posts result → resolves waiting API request |
| Cache invalidation | Cross-worker cache busting |
| App event bus | Web build server status, etc. |

---

## PostgreSQL

### V2 App Tables

| Table | Purpose |
|-------|---------|
| `v2_app_git_repos` | Git repo metadata (branches, file tree, push history) |
| `v2_app_releases` | Release records (manifest, methods, interfaces, build log, status) |
| `v2_sandbox_sessions` | Sandbox editor sessions (sandboxId, cncDomain, snapshotId, status) |
| `app_data_databases` | Database metadata (name, version scope) |
| `app_data_database_tables` | Table schema metadata (name, columns as JSON) |
| `v2_request_log` | Method execution logs (input, output, duration, errors) |
| `method_metrics_5m` | Aggregated method metrics (5-minute buckets) |

### Auth & Permissions Tables

| Table | Purpose |
|-------|---------|
| `app_permissions` | User permission levels per app (edit, use) |
| `app_roles` | Role definitions per app (name, description) |
| `app_role_assignments` | User-to-role mappings per app |
| `organization_api_keys` | API keys per organization |

### Integration Tables

| Table | Purpose |
|-------|---------|
| `app_trigger_discord` | Discord bot registrations |
| `app_trigger_telegram` | Telegram bot registrations |
| `app_trigger_emails` | Email address registrations |
| `scheduled_runs` | Cron job configurations |

### Connection Pools

| Pool | Purpose | Config |
|------|---------|--------|
| Writer | Primary for writes | Standard timeout |
| Reader | Read replica for reads | Standard timeout |
| Report reader | Heavy queries (metrics, exports) | Extended timeout |

---

## Performance Reference (warm path)

| Step | Time |
|------|------|
| Resolve release | ~2ms |
| Load execution context | ~1ms (cache hit) |
| Load compiled JS | ~0ms (cache hit) |
| Generate hook token | ~1ms |
| **API overhead total** | **~4ms** |
| Database query (cached .db) | ~2-4ms |
| Sandbox cold start (warm pool hit) | ~2-5s |
| Sandbox cold start (no pool) | ~10-15s |
| Editor sandbox creation (from snapshot) | ~30-60s |
| Editor sandbox creation (fresh) | ~90-120s |
