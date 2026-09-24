# Development & Deployment

Development happens in the hosted sandbox, against a dev release with its own copy of the database. Each person with edit access gets their own workspace — their own copy of the code, their own dev database — and everyone publishes to the same default branch, which is what builds a new release and promotes it. Both run through the same execution pipeline, the same SDK, and the same schema rules, so code that works in the sandbox works in production.

---

## How Development Works

### The Sandbox

The hosted sandbox editor is the development environment:

- File tree + Monaco editor
- Live preview
- Terminal / process output
- AI coding agent (Remy)
- TypeScript language server

The sandbox is snapshotted automatically when idle, so work is never lost: it resumes from the latest snapshot.

### The Inner Loop

Backend changes:

1. Edit method code in `dist/methods/src/`
2. Save
3. The next method invocation (from the preview or the API) uses the updated code — esbuild transpiles per request, so there is no restart step

Frontend changes, when the app has a web interface:

1. Edit React components in `dist/interfaces/web/src/`
2. Save
3. Vite HMR updates the preview instantly

### Schema Sync

When a table definition is added or modified, the change is synced to the dev database automatically. The platform parses the TypeScript, diffs against the current schema, and applies DDL using the same migration rules as production — see [Tables & Database](04_tables-and-database.md).

### The Dev Database

A dev session gets its own database: a snapshot of the live database taken at session start. Dev code writes to that snapshot, never to production.

**Reset to live data**

```
POST /dev/manage/reset
```

Overwrites the dev database with a fresh copy of production data. IDs are preserved, so no reload is needed.

**Truncate (empty tables)**

```
POST /dev/manage/reset
Body: { "mode": "truncate" }
```

Keeps the schema and deletes all row data. Scenarios use this to start from empty tables before seeding.

**Scenarios**

Running a scenario puts the dev database into a specific, repeatable state:

1. Truncate all tables
2. Execute the seed function (the same `db.push()` calls a method would make)
3. Assign the scenario's declared roles to the dev test user

See [Scenarios](15_scenarios.md). To test the app from a particular role's perspective, set the dev test user's roles. That is a real write to the user's row, so `auth.userId`, `requireRole`, and role lookups behave exactly as in production — see [Auth & Roles](06_roles-and-auth.md) for the mechanics.

### Debugging

**Console output** — `console.log`, `console.warn`, and `console.error` in methods are captured per invocation and surfaced in the editor's process output.

**Request logs**

```
GET /apps/{appId}/requests
GET /apps/{appId}/requests/{requestId}
```

Every method execution, including dev, is logged with full input, output, duration, and error info. For a deployed app, `mindstudio-prod requests` retrieves the same server-side logs, errors, and latency.

**Method metrics**

```
GET /apps/{appId}/metrics/summary
GET /apps/{appId}/metrics/methods/{methodId}
```

Aggregated execution metrics: call count, error rate, duration percentiles.

---

## What Happens on Deploy

Every commit that lands on the default branch deploys. Publishing is what puts one there: the workspace commits its changes and pushes.

```bash
git push origin HEAD
```

Each workspace is a full clone on the default branch, so there is no shared working tree to contend for — several people can publish from several sandboxes. When two of them publish close together the second push is rejected as non-fast-forward; that workspace fetches, merges the release it missed, and pushes again.

From the push on, the platform builds and deploys automatically:

1. **Parse manifest** — read `mindstudio.json` and every declared interface config from the commit; a missing or broken config fails the build
2. **Create release** — record in Postgres with status `building`
3. **Compile methods and build the web interface** — in parallel, in isolated build sandboxes: esbuild bundles each method into a single JS file and the npm dependencies are resolved once into an artifact the release carries; the web interface runs its own build (`npm install && npm run build`)
4. **Compile the other interfaces** — API, MCP, agent, voice, cron, webhook and email configs are checked against the compiled methods, and their markdown (system prompts, tool descriptions) is inlined
5. **Diff table schemas** — TypeScript AST → column definitions, diffed against the live database; any change is rehearsed on a copy of the live database, so a migration that can't run fails the build
6. **Promote** — apply the table changes to a fresh copy of the live database, apply the jewel identity, update the cron jobs, then point the app at the new release

Every step is captured in the [build log](#build-logs) with timing. The default branch's files are also copied to storage, for the editor's file view.

### Release Statuses

```
building → compiled → live    (default branch)
                   → preview  (feature branch)
                   → failed   (build error)
building → superseded         (a newer push to the branch cancelled it)
live     → superseded         (a newer release went live)
preview  → superseded         (the branch's next build replaced it)
```

| Status | Meaning |
|--------|---------|
| `building` | Compilation in progress |
| `compiled` | Build succeeded, not yet promoted |
| `live` | Currently serving production traffic |
| `preview` | Feature branch deployment |
| `failed` | Build error (check build log) |
| `superseded` | Replaced: a live release a newer one replaced, a preview the branch's next build replaced, or a build a newer push cancelled |
| `dev` | Active dev session (not a deploy) |

### Preview Deployments

Push any branch other than the default:

```bash
git push origin HEAD:refs/heads/<branch>
```

Same build pipeline, but the release is marked `preview` instead of `live`. Accessible via a branch-specific URL, and it runs against a copy of the data rather than production. Each branch gets its own preview release; pushing the branch again supersedes the previous one.

Preview deployments don't affect the live app — they are how you show work before it ships. A branch sitting at the default branch's tip builds no preview, because the live release already covers that commit.

### Database Migrations

On deploy, the platform:

1. Parses the table definition files (TypeScript AST)
2. Compares against the current live database schema
3. During the build, rehearses the changes on a copy of the live database, so a migration that can't run fails the build before anything goes live
4. At promotion, copies the live database afresh to the new release and applies the changes there — new tables are created; a table with new, dropped, or retyped columns or changed `unique` constraints is rebuilt (a table with the declared shape is created, every row is copied across, and it replaces the old one in one transaction); tables removed from the manifest are dropped
5. Points the app at the new release and its database. Queries to the live database wait out the few seconds between the copy and the switch, so no write is left behind in the old copy

Renames are not detected: a renamed column or table is a drop plus an add, so its data does not carry over.

**Safety** — schema changes are always applied to a clone, never to the live database directly. If the DDL fails, the live database is untouched and the release is marked `failed`.

**Per-release databases** — databases are keyed by release ID, so each release gets its own copy:

- The live release has the production database
- A new release clones from live at promotion, applies DDL, then becomes the new live database
- Dev sessions get their own copy (snapshotted from live on session start)
- A replaced release's database is kept but never served again; rolling back builds a new release from the current live data (see [Rollback](#rollback))

### Build Logs

Every release has a detailed build log:

```
✓ Release created from commit a1b2c3d
✓ Compiling 13 methods
✓ Compiled submit-vendor-request (submitVendorRequest) [4.2KB]
✓ Compiled get-dashboard (getDashboard) [3.1KB]
✓ ...
✓ Compiling web interface
✓ Installing NPM packages...
✓ Web interface compiled [47 files]
✓ Tables diff: 4 to create, 0 to alter
✓ Cron diff: 2 jobs
✓ Release promoted to live (12.4s)
```

Each phase is timestamped. On failure, the error and context are captured.

Access via the dashboard or API:

```
GET /apps/{appId}/releases/{releaseId}
```

### Side Effects on Deploy

When a release is promoted to live, the platform applies the pending effects computed during build, in this order:

| Effect | What happens |
|--------|-------------|
| **Tables** | Copy the live database to the new release, apply the DDL |
| **Jewels** | Upsert the app's jewel user and its roles |
| **Cron** | Upsert scheduled jobs by route (a job keeps its history; one removed from the manifest is deleted with its run history) |

Then the live pointer moves. If any effect fails, the pointer doesn't move and the current live release keeps serving.

Everything else — API routes, MCP tools, agent and voice config, webhook endpoints, email routing, roles — is read from the live release at request time, so it changes the moment the new release goes live, with nothing to apply.

Effects are stored on the release as `pendingEffects`. Nothing changes in the live system until promotion.

### Post-Deploy Diagnostics

Every live deploy runs an automated Lighthouse audit of the app — performance, accessibility, best-practices, and SEO scores, plus runtime findings (console errors and failed network requests). Pull it via the `mindstudio-prod` CLI to find concrete issues worth fixing while iterating:

- `mindstudio-prod diagnostics get` — scores + runtime findings + a distilled list of failing audits, with a signed link to the full report.
- `mindstudio-prod diagnostics report` — the raw Lighthouse JSON.

The audit runs asynchronously and **lands ~30–60s after the release goes live**, so it is not ready the moment a deploy finishes. Immediately after deploying, `diagnostics get` returns `{"status":"pending"}`; retry shortly after, or use `diagnostics get --wait` to block until it's ready. Both default to the current live release.

### Rollback

Rollback is a git operation: revert, then publish.

```bash
git revert HEAD
git push origin HEAD
```

This creates a new commit that undoes the last change, triggering a new build and deploy. The new release starts from the current live data, so nothing written since the bad deploy is lost. A schema change the revert undoes is migrated like any other: a column the reverted commit added is dropped, with its data.

There is no way to move the live pointer back to an earlier release without a build.

### Diagnosing Build Failures

If a build fails:

1. Check the build log (`GET /releases/{releaseId}`)
2. Common issues:
   - **Method compilation error** — TypeScript/syntax error in a method file. The error message includes the file and line.
   - **Web build error** — npm install or build command failed. Check the captured stdout/stderr in the build log.
   - **Table schema error** — TypeScript file couldn't be parsed. The table definition must use the expected `defineTable<T>()` pattern.
   - **Missing manifest fields** — method declared but path doesn't exist, or export doesn't match.
   - **Interface config error** — a declared interface's config file is missing, isn't valid JSON, or lacks its top-level key (`{ "web": { ... } }`). Set `"enabled": false` on the manifest entry to leave an interface out.
   - **Missing markdown** — a system prompt or tool `description` names a file that doesn't exist.
   - **Agent model error** — the agent's `model` isn't a chat model the workspace can use.
3. Fix the issue and push again. Failed releases never affect the live release.
