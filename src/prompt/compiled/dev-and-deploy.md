# Development & Deployment

## How Development Works

The sandbox uses the same tunnel binary and execution pipeline as local development. Code changes take effect immediately — esbuild transpiles methods per-request, no restart needed. The dev database is a disposable snapshot of production.

### The Dev Inner Loop

1. Edit method code in `dist/methods/src/` — next method invocation uses updated code automatically
2. Edit frontend code in `dist/interfaces/web/src/` — HMR updates the browser instantly
3. Add/modify table definitions — schema changes sync to the dev database automatically
4. Run scenarios to set up specific data states for testing

### Dev Database

The dev session gets its own database — a snapshot of the live database at session start. Your code writes to this snapshot, not to production.

- **Reset to live data** — overwrite the dev database with a fresh copy of production
- **Truncate** — keep the schema, delete all row data (used by scenarios for a clean canvas)
- **Schema sync** — add a field to a table interface and it's immediately available in dev

The dev database is disposable. Experiment freely — there's no risk of breaking anything. Just be considerate that the user may have created their own data (user rows or other data) while testing, and it might be frustrating for them to have it wiped.

### Debugging

`console.log`, `console.warn`, and `console.error` in methods are captured and displayed in the terminal. They don't affect the method's return value. Every method execution is logged with full input, output, duration, and error info.

## What Happens on Deploy

```bash
git push origin main
```

The platform builds and deploys automatically:

1. **Parse manifest** — read `mindstudio.json` from the commit
2. **Compile methods** — esbuild bundles each method into a single JS file
3. **Compile interfaces** — build web SPA (`npm install && npm run build`), generate configs for API/Discord/Telegram/cron/etc.
4. **Parse table schemas** — TypeScript AST to column definitions, diff against live database
5. **Compute effects** — roles diff, cron diff, bot command diffs, table DDL
6. **Apply** — create/update roles, sync bot commands, apply DDL to a staging database copy, swap the live pointer

All deployed apps are available on <uuid>.msagent.ai where uuid is their app ID. If an app has a custom subdomain, it's available at <subdomain>.msagent.ai as well. This can be configured using the `mindstudio-prod` CLI via bash.

### Preview Deployments

Push to a non-default branch for a preview deployment — same build pipeline, but doesn't affect the live app. Useful for testing changes before merging.

### Database Migrations on Deploy

Schema changes are automatic:
- **New tables** — `CREATE TABLE` applied automatically
- **New columns** — `ALTER TABLE ADD COLUMN` applied automatically
- **Dropped columns** — `ALTER TABLE DROP COLUMN` applied automatically when a column is removed from the interface
- **Dropped tables** — `DROP TABLE` applied automatically when a table file is removed from the manifest
- **Type changes and renames** — not supported in the automatic migration path

Schema changes are always applied to a clone of the live database, never directly. If DDL fails, the live database is untouched and the release is marked `failed`.

### Rollback

Rollback is a git revert — creates a new commit, triggers a new build. The previous release's database still exists (databases are per-release), so data isn't lost.

### Common Build Failures

- **Method compilation error** — TypeScript/syntax error in a method file. Error message includes file and line.
- **Web build error** — npm install or build command failed. Check build log stdout/stderr.
- **Table schema error** — TypeScript file couldn't be parsed. Ensure the table definition uses the `defineTable<T>()` pattern.
- **Missing manifest fields** — method declared but path doesn't exist, or export doesn't match.

Failed releases don't affect the current live release.
