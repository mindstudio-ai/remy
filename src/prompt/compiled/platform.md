# MindStudio Platform

A MindStudio app has three layers: a **spec** (natural language in `src/`), a **backend contract** (methods, tables, roles in `dist/`), and **interfaces** (web, API, bots, cron, etc. — also in `dist/`). The spec is the source of truth; the code is a derivation.

`src/` is the authored source — natural language specs, brand guidelines, reference materials. No code. `dist/` is the compiled output — TypeScript methods, frontends, JSON configs. You can edit `dist/` directly, but `src/` is the reset point. Regenerate `dist/` from `src/` at any time.

## Directory Layout

```
my-app/
  mindstudio.json                    ← manifest (declares everything)

  src/                               ← authored source (no code)
    app.md                             backend spec (MSFM)
    references/                        supporting material (PDFs, notes, diagrams)
    interfaces/
      @brand/                          shared brand identity
        visual.md                        aesthetic direction, surfaces, spacing
        colors.md                        brand color palette (type: design/color)
        typography.md                    fonts and type styles (type: design/typography)
        voice.md                         tone, terminology, error messages
        assets/                          logos, icons
      web.md                           web UI spec
      api.md                           API conventions
      agent.md                         agent personality and behavior spec
      cron.md                          scheduled job descriptions
    roadmap/                           feature roadmap (one file per item, type: roadmap)

  dist/                              ← compiled output (code + config)
    methods/                           backend contract
      src/
        tables/                          one file per table (TypeScript interfaces)
        common/                          shared helpers (imported by methods, not methods themselves)
        *.ts                             one file per method (named async function export)
      .scenarios/                      seed data scripts (dev only, not deployed)
      package.json                     backend dependencies

    interfaces/                        interface projections
      web/                               full project directory (Vite + React)
        web.json                           dev server config
        package.json
        src/
      api/api.json                       REST API config
      discord/interface.json             Discord bot config
      telegram/interface.json            Telegram bot config
      cron/interface.json                cron config
      webhook/interface.json             webhook config
      email/interface.json               email config
      mcp/interface.json                 MCP config
      agent/                             agent interface
        agent.json                         agent config
        system.md                          compiled system prompt
        tools/                             tool descriptions (one .md per method)
```

## What Goes Where

| What | Where | Notes |
|------|-------|-------|
| Method handlers | `dist/methods/src/*.ts` | One file per method, named export |
| Table definitions | `dist/methods/src/tables/*.ts` | One file per table |
| Shared helpers | `dist/methods/src/common/*.ts` | Imported by methods, not invokable directly |
| Scenarios | `dist/methods/.scenarios/*.ts` | Seed data for testing (not deployed) |
| Backend dependencies | `dist/methods/package.json` | Only declared packages are available at runtime |
| Web interface | `dist/interfaces/web/` | Full Vite + React project directory |
| Interface configs | `dist/interfaces/*/interface.json` | One per non-web interface type |
| Specs | `src/*.md` | Natural language, MSFM format |
| Brand identity | `src/interfaces/@brand/` | visual.md (aesthetic), colors.md (palette), typography.md (fonts), voice.md (tone), assets/ |
| Roadmap | `src/roadmap/*.md` | Feature roadmap items (type: roadmap). One file per feature with status, dependencies, and history. |
| Reference material | `src/references/` | Context for the agent, not consumed by platform |

## The Two SDKs

**Backend: `@mindstudio-ai/agent`** — used inside methods. Provides `db` (database), `auth` (access control), and platform capabilities (AI, integrations, connectors). Pre-installed in the sandbox; must also be declared in `dist/methods/package.json`.

```typescript
import { db, auth } from '@mindstudio-ai/agent';
```

**Frontend: `@mindstudio-ai/interface`** — used in the web interface. Typed RPC to backend methods.

```typescript
import { createClient } from '@mindstudio-ai/interface';

const api = createClient<{
  approveVendor(input: { vendorId: string }): Promise<{ vendor: Vendor }>;
}>();

const { vendor } = await api.approveVendor({ vendorId: '...' });
```

## What the Platform Provides

- **Managed databases.** SQLite with typed schemas. Push a schema change and the platform diffs, migrates, and promotes atomically.
- **Built-in auth.** Opt-in via manifest. Developer builds login UI, platform handles verification codes (email/SMS), cookie sessions, and role enforcement. Backend methods use `auth.requireRole('admin')` for access control.
- **Multiple interfaces, one codebase.** Web, API, Discord, Telegram, Cron, Webhook, Email, MCP — all invoke the same methods. Methods don't know which interface called them.
- **Sandboxed execution.** Each method invocation runs in its own isolated execution context with npm packages pre-installed.
- **Git-native deployment.** Push to default branch to deploy. Push to feature branch for preview. Rollback is a git revert.
- **Secrets.** Encrypted environment variables with separate dev/prod values. Injected as `process.env` in methods. For third-party service credentials not covered by the SDK.

## Minimum Viable App

```
my-app/
  mindstudio.json
  dist/methods/
    src/hello.ts
    package.json
```

One manifest, one method, one package.json. The method is accessible via API key.
