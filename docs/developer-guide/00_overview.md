# Overview

> **Note on audience.** This guide documents the platform's primitives: the spec format, the manifest, tables, methods, roles, interfaces. It's for developers building directly on the platform, and for anyone reading the code Remy generates who wants to understand how the pieces fit together. **It is not a description of how end-users of Remy interact with the product.** A Remy user describes what they want in plain language (voice, text, or pasted documents), and the agent generates everything in this guide on their behalf. The user doesn't write MSFM, define tables, or author methods by hand; the agent does that, after a conversation that turns intent into a spec. Read this guide to know *what gets generated*; read the [diligence material](../README.md#diligence--investor-facing-material) and [landing page](../diligence/landing-page.md) for *how the user experiences it*.

## What is a Remy App?

A Remy app is a code project with a clear structure. You define the logic (data models, business rules, user experiences) and the platform handles databases, auth, deployment, and every way users interact with your app.

An app has three layers:

**A spec.** A natural language document describing what the app does. Written in MSFM (MindStudio-Flavored Markdown), it captures the domain, the rules, the workflows. This is the source of truth. An AI agent reads the spec and generates the code, or you write the code directly. Either way, the spec is the application; the code is a derivation.

**A backend contract.** Methods, tables, and roles. Methods are TypeScript functions that implement the logic. Tables define the data model. Roles define who can do what. This lives in `dist/`, and it's a compiled derivation of the spec the way `.js` is a compiled derivation of `.ts`.

**Interfaces.** Ways for users to interact with the contract. A web app, a REST API, a cron job, a webhook, an email trigger, an MCP tool server. The same methods power all of them. Interfaces can be as complex and polished as you want and still be safe: anything real happens in the backend contract, so an interface can't break business logic or corrupt data.

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
      ...
```

---

## What the Platform Provides

### Managed Databases

SQL databases with typed schemas defined as TypeScript interfaces. No connection strings, no migrations to run manually. Push a schema change and the platform diffs it, clones the database, applies DDL, and promotes atomically. A dev session gets its own copy, which you can reset back to live data or truncate to empty tables. See [Development & Deployment](16_development-and-deployment.md).

### Built-in Auth

Define roles in `mindstudio.json`. Assign users to roles in the editor. In your methods, call `auth.requireRole('admin')` and the platform handles sessions, tokens, and user resolution. In your frontend, conditionally render based on the user's roles.

### Multiple Interfaces, One Codebase

The same backend methods power every interface:

| Interface | What it does |
|-----------|-------------|
| **Web** | React/Vite SPA hosted on CDN |
| **API** | REST endpoint with API key auth |
| **Cron** | Scheduled method execution |
| **Webhook** | Inbound HTTP → method invocation |
| **Email** | Inbound email → method invocation |
| **MCP** | AI tool server (methods as tools) |
| **Agent** | Conversational LLM with methods as tools |
| **Voice** | Realtime voice conversation with methods as tools |

Your methods don't know or care which interface invoked them.

### Sandboxed Execution

Methods run in isolated sandboxes with npm packages pre-installed. No servers to manage. The SDK (`@mindstudio-ai/agent`) provides `db` and `auth` namespaces, plus access to 200+ AI models, 1000+ integrations, and platform actions like file uploads and web scraping. See [SDK Actions](11_sdk-actions.md).

### Git-Native Deployment

Push to the default branch → the platform builds, deploys, and goes live. Push to a feature branch → preview deployment. Every release is a snapshot with full build log and commit info. Rollback is a git revert.

---

## Platform Limits

Two things the platform cannot do. Say so early when a requirement heads this way:

- **Native mobile apps** (iOS/Android). Mobile-responsive web apps are fine.
- **Real-time action games** (server-authoritative simulation, guaranteed-order sync) — event delivery is at-most-once and ordering is the app's job, so there is no server tick to build one on.

---

## Minimum Viable App

The smallest thing the platform will build and run:

```
my-app/
  mindstudio.json
  dist/methods/
    src/hello.ts
    package.json
```

The method is reachable via API key. Everything else (tables, interfaces, auth, roles) is additive from there.

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

See [Tables & Database](04_tables-and-database.md), [Files & Storage](08_files-and-storage.md), and [Methods](05_methods.md) for the full API.

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

Development happens in the hosted sandbox editor: file tree, Monaco editor, live preview, terminal, and an AI coding agent. The sandbox is a persistent working environment, snapshotted automatically so work is never lost.

A dev session runs against its own database, a snapshot of live taken at session start, so nothing you do while building touches production data. Edit a method, save, and the next invocation picks up the change with no restart; edit a React component and the preview updates instantly.

The sandbox and production share one execution pipeline, one database engine, and one SDK. Code that works in the sandbox works in production. See [Development & Deployment](16_development-and-deployment.md).

---

## How to Read This Guide

| If you want to... | Read |
|-------------------|------|
| Understand the project layout | [Project Structure](01_project-structure.md) |
| Learn the spec format | [Spec & MSFM](02_spec-and-msfm.md) |
| See every manifest field | [Manifest Reference](03_manifest-reference.md) |
| Work with the database | [Tables & Database](04_tables-and-database.md) |
| Write backend logic | [Methods](05_methods.md) |
| Set up access control | [Auth & Roles](06_roles-and-auth.md) |
| Connect an interface | [Interfaces](07_interfaces.md) |
| Store or serve files | [Files & Storage](08_files-and-storage.md) |
| Search over documents | [Data Sources](09_data-sources.md) |
| Store a third-party credential | [Secrets](10_secrets.md) |
| Use AI models and integrations | [SDK Actions](11_sdk-actions.md) |
| Have the app work autonomously | [Task Agents](12_task-agents.md) |
| Automate a recurring judgment call | [Jewels](13_jewels.md) |
| Measure traffic and custom events | [Analytics](14_analytics.md) |
| Create test data | [Scenarios](15_scenarios.md) |
| Build and deploy | [Development & Deployment](16_development-and-deployment.md) |

For the source code behind the platform, see [`/src/`](../../src) at the repo root.
