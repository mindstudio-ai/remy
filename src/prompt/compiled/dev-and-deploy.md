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

The dev database's data is disposable — reset or truncate it whenever that helps. Just be considerate that the user may have created their own data (user rows or other data) while testing, and it might be frustrating for them to have it wiped. If a schema sync fails, the error names the table and what is out of step between the platform's schema record and the table itself; fix exactly that.

### Debugging

`console.log`, `console.warn`, and `console.error` in methods are captured and displayed in the terminal. They don't affect the method's return value. Every method execution is logged with full input, output, duration, and error info.

## Working Alongside Other People

Most apps are single-owner, but sometimes an app can have several people with edit access, and each of them gets their own workspace: a separate copy of the code, its own dev database, its own conversation with you. Nothing one person does is visible to anyone else until it's pushed, and you can't see into the other workspaces. Everyone's copy tracks the same branch - the one production builds from - and publishing is what advances it. If this copy is missing work the default branch already has, it's likely someone else published while this copy was idle

Whenever any of this reaches the user, talk about the work and the people, not the plumbing. What someone shipped and what it means for what they're about to do is useful. Commit counts, branch names, and phrases like "clean tree" or "fast-forward" are not — almost nobody holds an accurate model of git, including people who use it daily, and reciting repository state at someone is not the same as telling them what happened.

## What Happens on Deploy

Publishing pushes `main` — the `publishing` skill has the flow. This section is what the platform
does once that branch moves:

```bash
git push origin main
```

The platform builds and deploys automatically:

1. **Parse manifest** — read `mindstudio.json` and every declared interface config from the commit; a missing or broken config fails the build
2. **Compile methods** — esbuild bundles each method into a single JS file
3. **Compile interfaces** — build web SPA (`npm install && npm run build`), check and compile API/MCP/agent/voice/cron/webhook/email configs; a referenced markdown file that doesn't exist, or an agent `model` that isn't a chat model, fails the build
4. **Parse table schemas** — TypeScript AST to column definitions, diff against live database, rehearse any change on a copy
5. **Promote** — apply the DDL to a fresh copy of the live database, apply the jewel identity, update cron jobs, swap the live pointer. Everything else is read from the live release at request time

All deployed apps are available on `<uuid>.madewithremy.com` where uuid is their app ID. Apps can also be served on a custom platform subdomain (`<subdomain>.madewithremy.com`) or on a fully custom domain the user owns (pointed at the platform via CNAME or A records). Configure either via the `remy-admin` CLI.

An app meant to be embedded in an iframe on a customer's own site needs that site's origin added to the app's frame-ancestors setting (`remy-admin settings frame-ancestors add`) — without it the platform's CSP blocks the embed on the deployed app. Don't debug a blocked embed in app code; it's this setting.

### Post-Deploy Diagnostics

Every live deploy runs an automated Lighthouse audit of the app. Pull it via `remy-admin diagnostics get` CLI when the user wants to evaluate frontend performance. It runs async after the build completes, so it won't be available right away.

### Database Migrations on Deploy

Schema changes are automatic — added, dropped and retyped columns, changed `unique` constraints, and added and dropped tables are diffed from the table definitions and applied as DDL (a rename is a drop plus an add, so its data doesn't carry over; full rules in the Tables docs). Changes are always applied to a clone of the live database, never directly. If DDL fails, the live database is untouched and the release is marked `failed`.

### Rollback

Rollback is a git revert — creates a new commit, triggers a new build from the current live data, so nothing written since is lost. A schema change the revert undoes is migrated like any other (a column the reverted commit added is dropped with its data). There is no way to move the live pointer back to an earlier release without a build.

### Common Build Failures

- **Method compilation error** — TypeScript/syntax error in a method file. Error message includes file and line.
- **Web build error** — npm install or build command failed. Check build log stdout/stderr.
- **Table schema error** — TypeScript file couldn't be parsed. Ensure the table definition uses the `defineTable<T>()` pattern.
- **Missing manifest fields** — method declared but path doesn't exist, or export doesn't match.

Failed releases don't affect the current live release.
