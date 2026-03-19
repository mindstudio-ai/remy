# MindStudio Apps: Platform Architecture

## What This Is

Software has always moved up the stack. Machine code to assembly to C to Python to TypeScript; each level lets you think about bigger problems. Abstractions are how complexity gets built. This doesn't change when AI is writing the code.

MindStudio Apps moves up another level. Application logic lives in natural language specs, documents that capture what an app does and why, reproducibly enough that an AI agent can regenerate the implementation while preserving the meaning.

**The spec is the application.** During development of the platform, we validated this by building a procure-to-pay system, starting from a PDF that described how procurement works at a company. That document became the app's spec. The AI agent read it, generated the data model, wrote the methods, built the interfaces. The PDF *was* the application; everything else was derived from it. (This mirrors reality: that PDF was already the source of truth for how humans in the company worked. We're just making it executable.)

An app has three layers, and the hierarchy matters:

**The spec** — a natural language document (written in MSFM, MindStudio-Flavored Markdown) that describes what the app does, how it works, what the data looks like, who can do what. This is the source. It lives in `src/`.

**The backend contract** (methods, tables, and roles) is a compiled derivation of the spec, just as `.js` is a compiled derivation of `.ts`. Methods are TypeScript functions that implement the logic. Tables define the data model. Roles define access control. The code is real, it runs, it matters, but the spec is the source of truth. An AI agent can regenerate the contract from the spec. A human can modify the code directly and the spec can be updated to match. This is why TypeScript lives in `dist/`; it's the compiled output.

**Interfaces** are projections of the contract into different modalities. A web app, a REST API, a Discord bot, a Telegram bot, a cron job, a webhook, an email trigger, an MCP tool server. The same methods power all of them. Interfaces come and go as the world changes; today it's web and API, tomorrow it might be voice or whatever platform emerges next. The contract endures. The spec endures longer.

The platform provides the abstractions that make all of this work: a typed database with a clean SDK, role-based auth enforced automatically, sandboxed execution, a deployment pipeline triggered by git push, interfaces that connect your backend to any modality, plus 200+ AI models, 1000+ integrations, and platform actions via the MindStudio SDK. The agent and the human focus on the real meat (the logic, the data model, the experience) instead of getting lost in everything else required to ship an application.

Push to git, the platform compiles and deploys. Every release is a snapshot. Rollback is a git revert.

---

## System Architecture

```
                  ┌─────────────────────────────────────────────┐
                  │  Developer / AI Agent                       │
                  │                                             │
                  │  Writes specs + code → git push             │
                  │  OR uses hosted editor (sandbox)            │
                  └──────────────┬──────────────┬───────────────┘
                                 │              │
                       git push  │              │  WebSocket (editor)
                                 ▼              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Platform API (youai-api)                                                        │
│                                                                                  │
│  HTTP + WebSocket + SQS worker. Manages apps, releases, sessions, billing.       │
│  Orchestrates sandbox lifecycle. Routes method invocations. Serves databases.    │
│                                                                                  │
│  Key surfaces:                                                                   │
│  ├── V2 App routes — CRUD, rebuild, dashboard, releases                          │
│  ├── Method invocation — resolve release → dispatch to sandbox                   │
│  ├── Dev sessions — poll-based loop for local CLI development                    │
│  ├── Sandbox sessions — lifecycle for hosted editor environments                 │
│  ├── Database management — SQLite-on-S3 with local caching                       │
│  ├── Roles & permissions — app-level RBAC                                        │
│  ├── Agent chat — vendor-agnostic LLM proxy (SSE streaming)                      │
│  └── Integrations — Discord, Telegram, email, webhooks, cron                     │
└──────────┬──────────────────────────────────────────────────┬────────────────────┘
           │                                                  │
           │  HTTP (provisioning)                             │  HTTP (execution)
           ▼                                                  ▼
┌──────────────────────────┐                    ┌──────────────────────────────────┐
│  Execution Service       │                    │  Vercel Sandbox Containers       │
│                          │                    │                                  │
│  Stateless provisioner.  │───creates/stops───▶│  ┌─ C&C Server (port 4387) ───┐  │
│  Vercel SDK wrapper.     │                    │  │  File tree + Monaco editor │  │
│  Sandbox manager:        │                    │  │  Live preview (proxy)      │  │
│  start, stop, verify,    │                    │  │  Terminal / process output │  │
│  build-snapshot.         │                    │  │  AI agent (remy)           │  │
│                          │                    │  │  Dev tunnel (headless)     │  │
│  Function executors:     │                    │  │  TypeScript LSP            │  │
│  JS/TS, Python,          │                    │  │  File watcher              │  │
│  compiled scripts.       │                    │  └────────────────────────────┘  │
│  Warm pool for           │                    │                                  │
│  low-latency execution.  │                    │  Browser connects directly via   │
└──────────────────────────┘                    │  WebSocket — API is not in the   │
                                                │  editor data path.               │
                                                └──────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│  Developer Tools (standalone, composable)                                        │
│                                                                                  │
│  mindstudio-local          — CLI for local development. Polls platform for       │
│  (local tunnel)              method requests, transpiles + executes locally,     │
│                              proxies frontend with __MINDSTUDIO__ injection.     │
│                              Works standalone or headless inside sandbox.        │
│                                                                                  │
│  remy                      — AI coding agent. Claude-powered tool-use loop.      │
│  (coding agent)              Reads specs, writes code, runs commands.            │
│                              Works as standalone CLI or headless in sandbox.     │
│                                                                                  │
│  @mindstudio-ai/agent      — Backend SDK. db namespace (collections, queries),   │
│  (backend SDK)               auth namespace (roles, permissions). Thin HTTP      │
│                              client that talks to platform via CALLBACK_TOKEN.   │
│                                                                                  │
│  @mindstudio-ai/interface  — Frontend SDK. Typed RPC to backend methods,         │
│  (frontend SDK)              auth context, file operations. Reads config from    │
│                              window.__MINDSTUDIO__ (injected by platform).       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Inventory

### Platform API (`youai-api`)

The central backend. Express HTTP server, WebSocket server, and SQS background worker running in Kubernetes. Manages everything: app CRUD, git repos, releases, compilation, database operations, auth, billing, sessions, and sandbox lifecycle.

The API is the orchestrator: it decides policy (when to start/stop sandboxes, how to route method calls, what permissions to enforce) while delegating mechanism to other services. It never runs user code directly.

**Docs:** [platform-api.md](01_platform-api.md)

### Execution Service (`youai-custom-function-execution-service`)

Stateless provisioner that wraps the Vercel Sandbox SDK. Two responsibilities: (1) manage sandbox containers for the hosted editor (create, stop, verify, snapshot), and (2) execute user functions in isolated containers (JS/TS, Python, compiled scripts).

Deliberately stateless. Vercel is the source of truth for sandbox state. The execution service is a thin translation layer between the platform API's lifecycle decisions and Vercel's container primitives.

**Docs:** [execution-service.md](02_execution-service.md)

### Sandbox C&C Server (`mindstudio-sandbox`)

Runs *inside* each sandbox container on a single port (4387). Orchestrates the entire hosted editor experience: file system access, process management (dev server, tunnel, agent, LSP), WebSocket protocol for the browser editor, reverse proxy for live preview, and state persistence across hibernation.

The browser connects directly to the C&C server's WebSocket; the platform API is not in the editor's data path. This gives the editor the same responsiveness as a local development environment.

**Docs:** [sandbox-server.md](03_sandbox-server.md)

### Coding Agent (`remy`)

AI coding assistant powered by Claude. Runs a tool-use loop: receives a message, calls Claude with tools (readFile, writeFile, editFile, bash, grep, glob, listDir, LSP queries), executes tool calls locally, sends results back, repeats until done.

Works as a standalone CLI (interactive terminal UI) or in headless mode (JSON protocol over stdin/stdout, driven by the C&C server). Uses the platform's `/_internal/v2/agent/remy/chat` endpoint for LLM access, so the platform handles model routing and billing.

**Docs:** [coding-agent.md](04_coding-agent.md)

### Local Dev Tunnel (`mindstudio-local`)

CLI tool that bridges a local development environment to the platform. Polls the platform for method execution requests, transpiles TypeScript with esbuild, executes methods in isolated child processes, and reports results back. Also runs a proxy server that injects `__MINDSTUDIO__` into HTML responses so the frontend SDK works without configuration.

Designed to be useful standalone: a developer can use it for local development without the sandbox editor. The sandbox uses it in headless mode (same binary, `--headless` flag) to execute methods inside the container.

**Docs:** [local-tunnel.md](05_local-tunnel.md)

### Backend SDK (`@mindstudio-ai/agent`)

TypeScript SDK for backend methods. Provides `db` (database operations: collections, queries, mutations, time helpers) and `auth` (role checking, user identity) namespaces. Under the hood, a thin HTTP client that routes all operations through the platform API using a `CALLBACK_TOKEN` that encodes execution context (which release, which database, which user).

The SDK is intentionally thin; all business logic lives in the platform. The SDK is just a typed interface to platform capabilities.

**Docs:** [backend-sdk.md](06_backend-sdk.md)

### Frontend SDK (`@mindstudio-ai/interface`)

TypeScript SDK for web interfaces. Provides `createClient<T>()` for typed RPC to backend methods, `platform` for file operations, and `auth` for read-only user identity. Reads configuration from `window.__MINDSTUDIO__`, a global injected by the platform (in production) or the tunnel proxy (in development).

**Docs:** [frontend-sdk.md](07_frontend-sdk.md)

---

## How Everything Connects

The system has two primary modes of operation:

### Production (live apps)

A user interacts with an app through an interface (web, API, Discord, etc.). The interface invokes a method. The platform resolves the live release, loads the compiled JavaScript, dispatches to a sandbox container, and returns the result. Database queries from within the method route back through the platform via the callback token.

### Development (building apps)

A developer works on an app through either the local CLI or the hosted sandbox editor. Both use the same underlying mechanism: the tunnel polls the platform for method requests, executes them locally (in the CLI's Node.js process or in the sandbox container), and reports results back. The developer sees live preview, can run scenarios, impersonate roles, and reset databases, all without deploying.

The key design principle: **zero divergence between local and hosted development.** The same tunnel binary, the same method execution pipeline, the same database, the same SDK. Code that works locally works in the sandbox works in production.

---

## How to Read This Documentation

**Start here** if you want the big picture.

**Read a service doc** ([platform-api.md](01_platform-api.md), [sandbox-server.md](03_sandbox-server.md), etc.) if you're working on or integrating with a specific service.

**Read [data-flows.md](08_data-flows.md)** to trace a request end-to-end through the system: method execution, database queries, the deploy pipeline, sandbox lifecycle.

**Read [infrastructure.md](09_infrastructure.md)** for the "where does X live" reference: S3 key schemes, Redis namespaces, PostgreSQL tables.

**Read [vision-and-roadmap.md](10_vision-and-roadmap.md)** for where this is all going: the thesis, the aspirations, and the design principles that guide future work.

For **building apps** (not the platform), see the [Developer Guide](../developer-guide/00_overview.md) instead.
