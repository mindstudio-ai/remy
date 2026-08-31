# Development & Deployment

Development happens in the hosted sandbox, against a dev release with its own copy of the database. Deployment is a `git push` that builds a new release and promotes it. Both run through the same execution pipeline, the same SDK, and the same schema rules, so code that works in the sandbox works in production.

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

```bash
git push origin main
```

The platform builds and deploys automatically:

1. **Parse manifest** — read `mindstudio.json` from the commit
2. **Create release** — record in Postgres with status `building`
3. **Mirror files** — copy repo files to S3 for instant editor access
4. **Compile methods** — esbuild bundles each method into a single JS file, extracts npm package dependencies
5. **Compile interfaces** — build the web interface (`npm install && npm run build`), generate configs for API/cron/webhook/etc.
6. **Parse table schemas** — TypeScript AST → column definitions, diff against live database
7. **Compute pending effects** — roles diff, cron diff, bot command diffs, webhook/email diffs, table DDL
8. **Apply** — create/update roles, sync bot commands, apply DDL to a staging database copy, swap the live pointer

Every step is captured in the [build log](#build-logs) with timing.

### Release Statuses

```
building → compiled → live    (default branch)
                   → preview  (feature branch)
                   → failed   (build error)
live → superseded             (new release goes live)
```

| Status | Meaning |
|--------|---------|
| `building` | Compilation in progress |
| `compiled` | Build succeeded, not yet promoted |
| `live` | Currently serving production traffic |
| `preview` | Feature branch deployment |
| `failed` | Build error (check build log) |
| `superseded` | Was live, replaced by newer release |
| `dev` | Active dev session (not a deploy) |

### Preview Deployments

Push to a non-default branch:

```bash
git push origin feat/approvals
```

Same build pipeline, but the release is marked `preview` instead of `live`. Accessible via a branch-specific URL. Each branch gets its own preview release. Pushing again to the same branch supersedes the previous preview.

Preview deployments don't affect the live app. Useful for testing changes before merging.

### Database Migrations

On deploy, the platform:

1. Parses the table definition files (TypeScript AST)
2. Compares against the current live database schema
3. Generates DDL (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `DROP TABLE`)
4. Clones the live database to a staging copy
5. Applies DDL to the staging copy
6. Promotes the staging copy to live

Automatic migrations handle new tables, new columns, dropped columns (when removed from the table's TypeScript type), and dropped tables (when removed from the manifest). Type changes and renames are not supported in the automatic path.

**Safety** — schema changes are always applied to a clone, never to the live database directly. If the DDL fails, the live database is untouched and the release is marked `failed`.

**Per-release databases** — databases are keyed by release ID, so each release gets its own copy:

- The live release has the production database
- A new release clones from live, applies DDL, then becomes the new live database on promotion
- Dev sessions get their own copy (snapshotted from live on session start)
- Rollback is safe because the previous release's database still exists

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
✓ Roles diff: 2 to create, 0 to delete
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

When a release is promoted to live, the platform applies all pending effects computed during build:

| Effect | What happens |
|--------|-------------|
| **Roles** | Create new roles, update descriptions, delete removed roles |
| **Cron** | Upsert scheduled jobs (create/update/remove) |
| **Webhooks** | Update endpoint registrations |
| **Email** | Update email trigger routing |
| **Tables** | Clone database, apply DDL, promote |

Effects are stored on the release as `pendingEffects`. Nothing changes in the live system until promotion.

### Post-Deploy Diagnostics

Every live deploy runs an automated Lighthouse audit of the app — performance, accessibility, best-practices, and SEO scores, plus runtime findings (console errors and failed network requests). Pull it via the `mindstudio-prod` CLI to find concrete issues worth fixing while iterating:

- `mindstudio-prod diagnostics get` — scores + runtime findings + a distilled list of failing audits, with a signed link to the full report.
- `mindstudio-prod diagnostics report` — the raw Lighthouse JSON.

The audit runs asynchronously and **lands ~30–60s after the release goes live**, so it is not ready the moment a deploy finishes. Immediately after deploying, `diagnostics get` returns `{"status":"pending"}`; retry shortly after, or use `diagnostics get --wait` to block until it's ready. Both default to the current live release.

### Rollback

Rollback is a git operation:

```bash
git revert HEAD
git push origin main
```

This creates a new commit that undoes the last change, triggering a new build and deploy. The previous release's database is still available (databases are per-release), so data isn't lost.

For faster rollback without a new build, the platform supports re-promoting a previous release (via the editor dashboard).

### Diagnosing Build Failures

If a build fails:

1. Check the build log (`GET /releases/{releaseId}`)
2. Common issues:
   - **Method compilation error** — TypeScript/syntax error in a method file. The error message includes the file and line.
   - **Web build error** — npm install or build command failed. Check the captured stdout/stderr in the build log.
   - **Table schema error** — TypeScript file couldn't be parsed. The table definition must use the expected `defineTable<T>()` pattern.
   - **Missing manifest fields** — method declared but path doesn't exist, or export doesn't match.
3. Fix the issue and push again. Failed releases never affect the live release.
