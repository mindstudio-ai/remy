# Vision

Where this is all going — the thesis, what we've built, what's next, and the principles that guide decisions.

---

## The Thesis

Software has always moved up the stack. Each level of abstraction lets you think about bigger problems. MindStudio Apps is the next step: application logic lives in natural language specs, and everything else — databases, auth, deployment, interfaces — is managed by the platform.

The spec is the application. Code is a compiled derivation. Interfaces are projections. This hierarchy (spec → contract → interfaces) is the organizing principle for everything we build.

This isn't about replacing code with natural language — it's about recognizing that the document describing how something works is already the source of truth for humans. We're making it the source of truth for software too. When you update the procurement policy PDF, you're already "deploying" a change to how humans work. We're just closing the loop: update the spec, the agent regenerates the code, push, it's live.

---

## What We've Built

### The Foundation

- **Git-backed apps** with typed methods, managed SQLite databases, role-based auth, and multi-interface deployment
- **A release pipeline** that compiles specs into deployable artifacts: methods bundled via esbuild, web interfaces built and hosted on CDN, table schemas diffed and applied atomically, integration configs synced to external APIs
- **Sandboxed execution** where methods run in isolated containers with the SDK pre-configured — no infrastructure for the developer to manage

### The Development Environment

- **Local CLI** (`mindstudio-local`) for local-first development — poll-based method execution, proxy injection, schema sync, scenarios
- **Hosted sandbox editor** — Vercel containers running the C&C server with file tree, Monaco editor, live preview, terminal, AI agent, and TypeScript LSP, all on a single port
- **AI coding agent** (`remy`) that reads specs, understands the domain, and generates/modifies code — works standalone or inside the sandbox
- **Zero divergence** between local and hosted development — same tunnel, same execution pipeline, same database, same SDK

### The SDK

- **Backend SDK** (`@mindstudio-ai/agent`) with `db` (typed collections, predicate compiler, time helpers) and `auth` (role checking, user identity) — plus access to thousands of pre-built connectors, AI models, and platform actions
- **Frontend SDK** (`@mindstudio-ai/interface`) with typed RPC to backend methods, file operations, and auth context

### The Developer Experience

- **Scenarios** — seed scripts that set up the dev database and auth context into specific states for testing
- **Impersonation** — quick-switch between roles to test role-based UI
- **Database reset** — restore from live (full data) or truncate (schema only) with IDs preserved
- **Request logging and metrics** — full visibility into method execution

---

## Design Principles (invariants)

These aren't just current decisions — they're constraints that should guide future work.

**Zero divergence.** Local dev, sandbox editor, and production use the same execution pipeline, the same database, the same SDK. If something works in one environment, it works in all of them. Any divergence is a bug.

**Every tool is useful standalone.** The tunnel works without the sandbox. Remy works without the platform. The SDK works with just a token. Each piece has independent value. Composing them creates something greater, but none requires the others.

**Protect user work above all else.** Snapshot by default on every stop. Never-expiring snapshots. Verify before returning stale state. The sandbox is the user's working environment — losing it means losing their work. Every lifecycle decision should default to preserving state.

**The platform does the hard parts.** Model routing, billing, database management, deployment, auth, rate limiting — these live in the platform so app code stays simple. The SDK is thin. The methods are focused. The developer writes business logic, not infrastructure.

**Spec over code.** The spec is the durable artifact. Code is generated. When in doubt, invest in making specs better (more expressive MSFM annotations, better agent understanding, richer compilation) rather than making code more pleasant to write manually. The long-term bet is that specs get better faster than code does.
