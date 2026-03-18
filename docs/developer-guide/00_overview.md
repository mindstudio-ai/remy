# MindStudio Apps — Developer Guide

## What is a MindStudio App?

A MindStudio app is a code project with a clear structure. You define the logic — data models, business rules, user experiences — and the platform handles databases, auth, deployment, and every way users interact with your app.

An app has three layers:

**A spec** — a natural language document describing what the app does. Written in MSFM (MindStudio-Flavored Markdown), it captures the domain, the rules, the workflows. This is the source of truth. An AI agent reads the spec and generates the code — or you write the code directly. Either way, the spec is the application; the code is a derivation.

**A backend contract** — methods, tables, and roles. Methods are TypeScript functions that implement the logic. Tables define the data model. Roles define who can do what. This lives in `dist/` — in the same way `.js` is a compiled derivation of `.ts`, the backend code is a compiled derivation of the spec.

**Interfaces** — ways for users to interact with the contract. A web app, a REST API, a Discord bot, a Telegram bot, a cron job, a webhook, an email trigger, an MCP tool server. The same methods power all of them. Interfaces can be as complex and polished as you want — a full React app with rich interactions and beautiful design — but they're always safe, because the backend contract is where anything real happens. The interface can't break business logic or corrupt data.

```
my-app/
  mindstudio.json          ← the manifest (declares everything)
  src/
    app.md                 ← the spec (the application)
    references/            ← supporting material
  dist/
    methods/               ← backend contract (compiled from spec)
      src/*.ts               methods
      src/tables/*.ts        table definitions
      .scenarios/            seed scripts for testing
    interfaces/            ← projections of the contract
      web/                   React SPA
      api/                   REST API config
      discord/               bot config
      ...
```

---

## What the Platform Provides

You write the logic. The platform handles the rest.

### Managed Databases

SQLite with typed schemas defined as TypeScript interfaces. No connection strings, no migrations to run manually. Push a schema change and the platform diffs it, clones the database, applies DDL, and promotes atomically. In development, reset to live data or truncate to empty tables with a single command.

### Built-in Auth

Define roles in `mindstudio.json`. Assign users to roles in the editor. In your methods, call `auth.requireRole('admin')` — the platform handles sessions, tokens, and user resolution. In your frontend, conditionally render based on the user's roles.

### Multiple Interfaces, One Codebase

The same backend methods power every interface:

| Interface | What it does |
|-----------|-------------|
| **Web** | React/Vite SPA hosted on CDN |
| **API** | REST endpoint with API key auth |
| **Discord** | Slash commands that invoke methods |
| **Telegram** | Bot commands + message handling |
| **Cron** | Scheduled method execution |
| **Webhook** | Inbound HTTP → method invocation |
| **Email** | Inbound email → method invocation |
| **MCP** | AI tool server (methods as tools) |

Your methods don't know or care which interface invoked them.

### Sandboxed Execution

Methods run in isolated sandboxes with npm packages pre-installed. No servers to manage. The SDK (`@mindstudio-ai/agent`) provides `db` and `auth` namespaces that just work, plus access to 200+ AI models, 1000+ integrations, and platform actions like file uploads and web scraping.

### Git-Native Deployment

Push to the default branch → the platform builds, deploys, and goes live. Push to a feature branch → preview deployment. Every release is a snapshot with full build log and commit info. Rollback is a git revert.

---

## The Two SDKs

### Backend: `@mindstudio-ai/agent`

Used inside methods. Provides database access, auth, and platform capabilities:

```typescript
import { db, auth } from '@mindstudio-ai/agent';
import { Vendors } from './tables/vendors';

export async function approveVendor(input: { vendorId: string }) {
  auth.requireRole('admin');

  const vendor = await Vendors.update(input.vendorId, {
    status: 'approved',
  });

  return { vendor };
}
```

See [Tables & Database](04_tables-and-database.md) and [Methods](05_methods.md) for the full API.

### Frontend: `@mindstudio-ai/interface`

Used in web interfaces. Typed RPC to backend methods:

```typescript
import { createClient } from '@mindstudio-ai/interface';

const api = createClient<{
  approveVendor(input: { vendorId: string }): Promise<{ vendor: Vendor }>;
}>();

const { vendor } = await api.approveVendor({ vendorId: '...' });
```

See [Interfaces](07_interfaces.md) for setup and configuration.

---

## The Development Workflow

### With the local CLI

```bash
npm install -g @mindstudio-ai/local-model-tunnel
cd my-app
mindstudio-local --port 5173
```

The CLI connects to the platform, polls for method requests, and executes them locally. Your frontend gets live preview with hot reload. Edit code, save, see changes immediately.

### With the hosted editor

Open the sandbox editor in your browser. File tree, Monaco editor, live preview, terminal, and an AI coding agent — all in one place. The sandbox is your persistent working environment, snapshotted automatically so you never lose work.

### Either way

Both use the same execution pipeline, the same database, the same SDK. Code that works locally works in the sandbox works in production.

---

## How to Read This Guide

| If you want to... | Read |
|-------------------|------|
| Understand the project layout | [Project Structure](01_project-structure.md) |
| Learn the spec format | [Spec & MSFM](02_spec-and-msfm.md) |
| See every manifest field | [Manifest Reference](03_manifest-reference.md) |
| Work with the database | [Tables & Database](04_tables-and-database.md) |
| Write backend logic | [Methods](05_methods.md) |
| Set up access control | [Roles & Auth](06_roles-and-auth.md) |
| Connect an interface | [Interfaces](07_interfaces.md) |
| Create test data | [Scenarios](08_scenarios.md) |
| Set up local dev | [Local Development](09_local-development.md) |
| Deploy your app | [Deployment](10_deployment.md) |

For platform internals (how the services work, architecture decisions, infrastructure), see the [Architecture Documentation](../architecture-guide/00_overview.md).
