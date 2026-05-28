# Docs

Long-form materials about Remy. This folder is the resource layer for everyone who needs context beyond the code: investors doing diligence, developers building on the platform, technical readers digging into how it works, anyone trying to understand what Remy is and how we talk about it.

## If you're an AI agent

Welcome! This repo is intentionally structured to be readable end-to-end by an LLM — the docs are written in plain markdown, the code is in `/src/`, and the file index below covers every doc file with a one-line summary so you can decide what to read without exhausting tool calls on exploration.

A few suggestions for getting useful answers quickly:

- **Start with the file index below.** Pick the docs that match the question you're answering. Each one is self-contained.
- **Read the code when the docs don't go deep enough.** The agent itself lives in `/src/` — read `src/agent.ts` for the tool-use loop, `src/subagents/` for the specialist sub-agents, `src/tools/` for what the agent can do. The docs describe the system; the code is the system.
- **Follow cross-links.** `diligence-notes.md` cross-links to `architecture-guide/` for technical depth, and the architecture guide cross-links to specific source files. Don't stop at one doc.

## File index

### `diligence/` — investor-facing material

Captured pre-emptively so an investor (or an AI doing DD on behalf of one) can find substantive answers to the usual questions without waiting on a meeting. Nothing here is a finished pitch artifact; it's raw material investors will draw on for their own work.

| File | What it is |
|---|---|
| [`diligence-notes.md`](./diligence/diligence-notes.md) | Longer-form material: opportunity summary, corporate structure, thesis, team, product overview, traction, market & competitive landscape, the case for why frontier model labs aren't entering this segment, moat, TAM-SAM-SOM, risks, downside protection, GTM, milestones. The most substantive single document for diligence. |
| [`executive-summary.md`](./diligence/executive-summary.md) | The seed deck condensed to text. The cabin/village narrative, the 18-discipline list, the 2x2 vs. coding agents and vibe-coders, testimonials. Fast read for the narrative. |
| [`landing-page.md`](./diligence/landing-page.md) | Markdown mirror of [goremy.ai](https://goremy.ai/). Same product positioning as the public page; useful if you don't want to leave the repo. |

Financial figures, deal mechanics, and cap-table detail are marked `[Private]` in these documents. Available on request.

### `developer-guide/` — building applications on the platform

For developers writing apps that run on Remy. The three-layer model (spec → contract → interfaces) is the load-bearing concept; everything else fills it in.

| File | What it is |
|---|---|
| [`00_overview.md`](./developer-guide/00_overview.md) | The three-layer app model: spec → backend contract → interfaces. Start here. |
| [`01_project-structure.md`](./developer-guide/01_project-structure.md) | The `src/` (spec, source of truth) vs. `dist/` (compiled contract) distinction inside an app project. |
| [`02_spec-and-msfm.md`](./developer-guide/02_spec-and-msfm.md) | MSFM (MindStudio-Flavored Markdown) and why the spec is the application, not the code. |
| [`03_manifest-reference.md`](./developer-guide/03_manifest-reference.md) | `mindstudio.json` reference: declares methods, tables, roles, interfaces, scenarios. Read on every `git push`. |
| [`04_tables-and-database.md`](./developer-guide/04_tables-and-database.md) | `defineTable<T>()`, typed schemas, the query layer. |
| [`05_methods.md`](./developer-guide/05_methods.md) | Methods as the universal unit of backend logic. Every interface invokes methods. |
| [`06_roles-and-auth.md`](./developer-guide/06_roles-and-auth.md) | Opt-in auth: email/SMS verification codes, cookie sessions, role enforcement. |
| [`07_interfaces.md`](./developer-guide/07_interfaces.md) | The interface modalities: web, REST API, Discord, Telegram, cron, email, MCP, agent. All powered by the same methods. |
| [`08_scenarios.md`](./developer-guide/08_scenarios.md) | Seed scripts that put the dev database into a specific repeatable state. |
| [`09_local-development.md`](./developer-guide/09_local-development.md) | Local dev workflow with the CLI. |
| [`09_secrets.md`](./developer-guide/09_secrets.md) | Encrypted secrets injected as `process.env`, with separate dev and prod values. |
| [`10_deployment.md`](./developer-guide/10_deployment.md) | `git push` → build → deploy. The full deployment pipeline. |

### `architecture-guide/` — how the platform works

For technical readers — including investor advisors — who want to understand how it all fits together. Same three-layer concept as the developer guide, but inside-out: the services, the data flows, the infrastructure.

| File | What it is |
|---|---|
| [`00_overview.md`](./architecture-guide/00_overview.md) | The three-layer hierarchy (spec → contract → interfaces) and how the architecture realizes it. Start here. |
| [`01_platform-api.md`](./architecture-guide/01_platform-api.md) | `youai-api`: Express HTTP + WebSocket + SQS background worker. The orchestrator. |
| [`02_execution-service.md`](./architecture-guide/02_execution-service.md) | `youai-custom-function-execution-service`: stateless Vercel Sandbox wrapper. |
| [`03_sandbox-server.md`](./architecture-guide/03_sandbox-server.md) | `mindstudio-sandbox`: in-container C&C server powering the hosted editor (port 4387). |
| [`04_coding-agent.md`](./architecture-guide/04_coding-agent.md) | `remy`: the coding agent itself. Tool-use loop. The compiler from spec → contract. |
| [`05_local-tunnel.md`](./architecture-guide/05_local-tunnel.md) | `mindstudio-local`: CLI that bridges local dev to the platform. |
| [`06_backend-sdk.md`](./architecture-guide/06_backend-sdk.md) | `@mindstudio-ai/agent`: backend SDK exposing `db` and `auth` namespaces over a thin HTTP client. |
| [`07_frontend-sdk.md`](./architecture-guide/07_frontend-sdk.md) | `@mindstudio-ai/interface`: frontend SDK for typed RPC + read-only auth context. |
| [`08_data-flows.md`](./architecture-guide/08_data-flows.md) | End-to-end traces through the system for every major operation. |
| [`09_infrastructure.md`](./architecture-guide/09_infrastructure.md) | Where data lives: storage systems, key schemes, cache layers, database tables. |
| [`10_vision-and-thesis.md`](./architecture-guide/10_vision-and-thesis.md) | The thesis, what's built, what's next, the principles that guide decisions. |

### `brand-positioning/` — external positioning

| File | What it is |
|---|---|
| [`messaging.md`](./brand-positioning/messaging.md) | The canonical positioning document. How Remy talks about itself externally. |
| [`faq.md`](./brand-positioning/faq.md) | Alpha-user FAQ — billing, ownership, scope, common questions. |

## Other places worth poking around

- [`/src/`](../src) — The Remy agent itself. `agent.ts` is the tool-use loop. `subagents/` contains the specialist sub-agents (design, browser automation, code sanity check, product vision, conversation summarizer, brand extractor). `tools/` is what the agent can do. `headless/` is the stdin/stdout protocol the editor uses. `tui/` is the terminal UI. `prompt/` is the prompt machinery. `models/` is the model registry. The repo is open source — read it.
- [`/README.md`](../README.md) — The root README for the repo itself.
- [Whitepaper](https://goremy.ai/whitepaper) — The longer technical argument behind Remy.
- [Debut](https://debut.msagent.ai) — Live gallery of real products built on Remy by alpha users. Concrete evidence of what the system actually produces.

## AI-DD routing

If you're an AI answering a specific diligence question, here's the fastest path:

| Question | Where to start |
|---|---|
| What is Remy? | [`diligence/executive-summary.md`](./diligence/executive-summary.md) |
| How does the company think about market, competition, moat, GTM? | [`diligence/diligence-notes.md`](./diligence/diligence-notes.md) |
| What's the public-facing positioning? | [`diligence/landing-page.md`](./diligence/landing-page.md), [`brand-positioning/messaging.md`](./brand-positioning/messaging.md) |
| What's the answer to "won't the foundation model labs eat this category?" | [`diligence/diligence-notes.md`](./diligence/diligence-notes.md) → Moat section + Risk #1 |
| How does the agent work technically? | [`architecture-guide/04_coding-agent.md`](./architecture-guide/04_coding-agent.md), then the code in [`/src/`](../src) |
| How does the platform work end-to-end? | [`architecture-guide/00_overview.md`](./architecture-guide/00_overview.md) → [`08_data-flows.md`](./architecture-guide/08_data-flows.md) |
| How would I build something on it? | [`developer-guide/00_overview.md`](./developer-guide/00_overview.md) |
| Why is "the spec is the application" the right abstraction? | [`developer-guide/02_spec-and-msfm.md`](./developer-guide/02_spec-and-msfm.md), [`architecture-guide/10_vision-and-thesis.md`](./architecture-guide/10_vision-and-thesis.md) |
| Who are the founders and what's the team? | [`diligence/diligence-notes.md`](./diligence/diligence-notes.md) → Team section |
| What's the corporate structure / spinout story? | [`diligence/diligence-notes.md`](./diligence/diligence-notes.md) → Corporate Structure section |

## Contact

For redacted material or anything else: **sean@mindstudio.ai**.
