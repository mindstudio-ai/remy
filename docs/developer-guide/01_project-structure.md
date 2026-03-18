# Project Structure

## The `src/` and `dist/` Model

Every app has two directories, and the distinction matters:

**`src/`** — the authored source. Natural language specs, brand guidelines, reference materials. Written by humans or AI. No code. This is the application — the intent, the domain knowledge, the rules.

**`dist/`** — the compiled output. TypeScript methods, React frontends, JSON configs. Generated from `src/` by an AI agent (or written directly). This is what the platform builds and runs.

The naming is intentional: `src/` is source, `dist/` is distribution. Just as TypeScript compiles to JavaScript, specs compile to code. You can edit `dist/` directly — that's fine, it's real code — but `src/` is the reset point. Regenerate `dist/` from `src/` at any time.

---

## Required Files

The minimum viable app:

```
my-app/
  mindstudio.json
  dist/
    methods/
      src/
        hello.ts
      package.json
```

One manifest, one method, one package.json. No tables, no interfaces, no roles, no specs. The method is accessible via API key. That's it.

### `mindstudio.json`

The manifest. Declares everything the platform needs to know — methods, tables, roles, interfaces, scenarios. See [Manifest Reference](03_manifest-reference.md) for the complete spec.

### `dist/methods/package.json`

Declares backend dependencies. `@mindstudio-ai/agent` is always available (pre-installed in the sandbox), but you still declare it:

```json
{
  "dependencies": {
    "@mindstudio-ai/agent": "^1.0.0"
  }
}
```

Only packages declared here are available at runtime.

---

## Full Directory Layout

```
my-app/
  mindstudio.json                    ← manifest (declares everything)
  CLAUDE.md                          ← conventions for AI agents (optional)

  src/                               ← authored source (no code)
    app.md                             backend spec (MSFM)
    references/                        source material (PDFs, notes, diagrams)
    interfaces/
      @brand/                          shared brand identity
        voice.md                         tone, terminology, error messages
        visual.md                        colors, typography, components
        assets/                          logos, icons
      web.md                           web UI spec
      api.md                           API conventions
      cron.md                          scheduled job descriptions

  dist/                              ← compiled output (code + config)
    methods/                           backend contract
      src/
        tables/                          one file per table
          vendors.ts
          purchase-orders.ts
          invoices.ts
        common/                          shared helpers (not methods)
          getApprovalState.ts
        submitVendorRequest.ts           one file per method
        approveVendor.ts
        getDashboard.ts
      .scenarios/                      seed data scripts
        apOverdueInvoices.ts
        emptyRequester.ts
      package.json                     backend dependencies

    interfaces/                        interface projections
      web/                               web project directory
        web.json                           web interface config
        package.json
        src/
          App.tsx
          pages/
          components/
      api/interface.json                 API config
      discord/interface.json             Discord bot config
      telegram/interface.json            Telegram bot config
      cron/interface.json                cron config
      webhook/interface.json             webhook config
      email/interface.json               email config
      mcp/interface.json                 MCP config
```

---

## What Goes Where

| What | Where | Notes |
|------|-------|-------|
| Method handlers | `dist/methods/src/*.ts` | One file per method, named export |
| Table definitions | `dist/methods/src/tables/*.ts` | One file per table |
| Shared helpers | `dist/methods/src/common/*.ts` | Imported by methods, not methods themselves |
| Scenarios | `dist/methods/.scenarios/*.ts` | Seed data for testing (not deployed) |
| Backend dependencies | `dist/methods/package.json` | Platform reads this for npm packages |
| Web interface | `dist/interfaces/web/` | Full project directory (Vite, React, etc.) |
| Interface configs | `dist/interfaces/*/interface.json` | One per interface type |
| Specs | `src/*.md` | Natural language, MSFM format |
| Brand identity | `src/interfaces/@brand/` | Shared across all interface specs |
| Reference material | `src/references/` | PDFs, notes, diagrams — context for the agent |

---

## The `src/` Directory

### `app.md` — The Main Spec

The main spec file, written in MSFM (see [Spec & MSFM](02_spec-and-msfm.md)). Describes the data model, business rules, workflows, and access control. The AI agent reads this to understand what the app does and generates the backend code in `dist/methods/`.

`app.md` is the entry point by convention, but there are no strict rules about how this directory is structured. It's up to the developer and the compiler how to organize and interpret its contents.

### `references/` — Source Material

Supporting documents that provide context — the original PDF, meeting notes, flowcharts, regulatory requirements. These aren't specs (they don't have MSFM annotations), but the agent reads them to understand the domain.

### `interfaces/@brand/` — Brand Identity

Shared brand guidelines that apply across all interfaces:

- **`voice.md`** — tone, terminology conventions ("purchase order" not "PO" in UI), error message style (helpful, not technical)
- **`visual.md`** — color palette, typography, component patterns
- **`assets/`** — logos, icons, images

The agent reads these when generating any interface — web, bot responses, API error messages — so everything shares a consistent identity.

### Interface Specs

`src/interfaces/web.md`, `src/interfaces/cron.md`, etc. Specs for each interface type. Describe what the UI should look like, how the cron jobs should behave, what the API conventions are. The agent reads these to generate the corresponding `dist/interfaces/` output.

---

## The `dist/` Directory

### `methods/` — The Backend Contract

The core of the app — the methods and data model.

**`src/tables/*.ts`** — one file per database table. TypeScript interfaces that define the schema. See [Tables & Database](04_tables-and-database.md).

**`src/*.ts`** — one file per method. Named async function exports with typed input/output. See [Methods](05_methods.md).

**`src/common/*.ts`** — shared helpers imported by methods. Not methods themselves — they're not listed in the manifest and can't be invoked directly.

**`.scenarios/*.ts`** — seed scripts for testing. Populate the dev database with specific states. See [Scenarios](08_scenarios.md).

**`package.json`** — declares npm dependencies for the backend.

### `interfaces/` — The Interface Projections

Each interface type gets its own directory or config file.

**`web/`** — a full project directory. Typically Vite + React with its own `package.json`, `src/`, and build configuration. The platform builds it on deploy and hosts the output on CDN. `web.json` inside the directory configures the dev server (port, command).

**Other interfaces** — JSON config files that declare how the interface connects to methods. See [Interfaces](07_interfaces.md) for the config schema for each type.

---

## `CLAUDE.md`

An optional file that tells AI agents how to work in your project. It's not used by the platform — it's for the agent.

Put it in the repo root for project-wide conventions: structure overview, naming conventions, code style preferences, how to write methods, how to use the SDK.

---

## What the Platform Generates vs What You Write

| | You write | Platform generates |
|---|-----------|-------------------|
| **Spec** | `src/app.md` | — |
| **Manifest** | `mindstudio.json` | — |
| **Methods** | `dist/methods/src/*.ts` | Compiled JS bundles (S3) |
| **Tables** | `dist/methods/src/tables/*.ts` | DDL, database files |
| **Web interface** | `dist/interfaces/web/src/` | Built output (S3/CDN) |
| **Interface configs** | `dist/interfaces/*.json` | Bot registrations, cron jobs |
| **Scenarios** | `dist/methods/.scenarios/*.ts` | — (dev only, not deployed) |

You author everything in the repo. On `git push`, the platform reads the manifest, compiles methods, builds interfaces, diffs schemas, and deploys. See [Deployment](10_deployment.md) for the full pipeline.
