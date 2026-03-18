# Deployment

## What Happens When You Push

```bash
git push origin main
```

The platform builds and deploys automatically:

1. **Parse manifest** — read `mindstudio.json` from the commit
2. **Create release** — record in Postgres with status `building`
3. **Mirror files** — copy repo files to S3 for instant editor access
4. **Compile methods** — esbuild bundles each method into a single JS file, extracts npm package dependencies
5. **Compile interfaces** — build the web interface (`npm install && npm run build`), generate configs for API/Discord/Telegram/cron/etc.
6. **Parse table schemas** — TypeScript AST → column definitions, diff against live database
7. **Compute pending effects** — roles diff, cron diff, bot command diffs, webhook/email diffs, table DDL
8. **Apply** — create/update roles, sync bot commands, apply DDL to a staging database copy, swap the live pointer

The build log captures every step with timing.

---

## Release Statuses

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

---

## Preview Deployments

Push to a non-default branch:

```bash
git push origin feat/approvals
```

Same build pipeline, but the release is marked `preview` instead of `live`. Accessible via a branch-specific URL. Each branch gets its own preview release. Pushing again to the same branch supersedes the previous preview.

Preview deployments don't affect the live app. Useful for testing changes before merging.

---

## Database Migrations

### How Schema Changes Are Applied

On deploy, the platform:

1. Parses your table definition files (TypeScript AST)
2. Compares against the current live database schema
3. Generates DDL (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `DROP TABLE`)
4. Clones the live database to a staging copy
5. Applies DDL to the staging copy
6. Promotes the staging copy to live

Automatic migrations handle new tables, new columns, dropped columns (when removed from the interface), and dropped tables (when removed from the manifest). Type changes and renames are not supported in the automatic path.

### Safety

Schema changes are always applied to a clone, never to the live database directly. If the DDL fails, the live database is untouched and the release is marked `failed`.

### Per-Release Databases

Databases are keyed by release ID. Each release gets its own database copy:
- The live release has the production database
- A new release clones from live, applies DDL, then becomes the new live database on promotion
- Dev sessions get their own copy (snapshotted from live on session start)
- Rollback is safe because the previous release's database still exists

---

## Build Logs

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
✓ Discord diff: 1 command
✓ Release promoted to live (12.4s)
```

Each phase is timestamped. On failure, the error and context are captured.

Access via the dashboard or API:

```
GET /apps/{appId}/releases/{releaseId}
```

---

## Side Effects on Deploy

When a release is promoted to live, the platform applies all pending effects computed during build:

| Effect | What happens |
|--------|-------------|
| **Roles** | Create new roles, update descriptions, delete removed roles |
| **Cron** | Upsert scheduled jobs (create/update/remove) |
| **Discord** | Sync slash commands via Discord API |
| **Telegram** | Sync bot commands via Telegram API |
| **Webhooks** | Update endpoint registrations |
| **Email** | Update email trigger routing |
| **Tables** | Clone database, apply DDL, promote |

All effects are computed during build and stored on the release as `pendingEffects`. Nothing changes in the live system until promotion.

---

## Rollback

Rollback is a git operation:

```bash
git revert HEAD
git push origin main
```

This creates a new commit that undoes the last change, triggering a new build and deploy. The previous release's database is still available (databases are per-release), so data isn't lost.

For faster rollback without a new build, the platform supports re-promoting a previous release (via the editor dashboard).

---

## Diagnosing Build Failures

If a build fails:

1. Check the build log (`GET /releases/{releaseId}`)
2. Common issues:
 - **Method compilation error** — TypeScript/syntax error in a method file. The error message includes the file and line.
 - **Web build error** — npm install or build command failed. Check the captured stdout/stderr in the build log.
 - **Table schema error** — TypeScript file couldn't be parsed. Ensure the table definition uses the expected `defineTable<T>()` pattern.
 - **Missing manifest fields** — method declared but path doesn't exist, or export doesn't match.

3. Fix the issue and push again. Failed releases never affect the live release.
