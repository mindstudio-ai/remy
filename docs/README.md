# Docs

Long-form materials about Remy. This folder is the resource layer for everyone who needs context beyond the code: investors doing diligence, developers building on the platform, technical readers digging into how it works, and anyone trying to understand what Remy is and how we talk about it.

## What's here

### [`diligence/`](./diligence)

Investor-facing material. Diligence notes (the longer-form thinking), an executive summary (the short version of the seed deck), and a markdown mirror of the [goremy.ai](https://goremy.ai/) landing page. Captured pre-emptively so an investor — or an AI pointed at this repo — can find substantive answers to the usual questions without waiting on a meeting. Nothing here is a finished pitch artifact; it's raw material investors will draw on for their own work.

- [`diligence-notes.md`](./diligence/diligence-notes.md) — the longer-form material: market, competition, moat, GTM, risks, team.
- [`executive-summary.md`](./diligence/executive-summary.md) — the seed deck condensed to text.
- [`landing-page.md`](./diligence/landing-page.md) — markdown mirror of the public goremy.ai landing page.

Specific financial figures, deal mechanics, and cap-table detail are marked `[Private]` in these documents. Available on request under NDA.

### [`developer-guide/`](./developer-guide)

Guide for developers building applications on Remy and the underlying platform. Eleven numbered chapters covering project structure, the spec format (MSFM — MindStudio-Flavored Markdown), the manifest, tables, methods, roles & auth, interfaces, scenarios, local development, secrets, and deployment. Start at [`00_overview.md`](./developer-guide/00_overview.md).

### [`architecture-guide/`](./architecture-guide)

Platform architecture deep-dive. Eleven numbered chapters covering the platform API, execution service, sandbox server, coding agent, local tunnel, backend and frontend SDKs, data flows, infrastructure, and the vision and thesis behind the whole system. For technical readers — including investor advisors — who want to understand how it all fits together. Start at [`00_overview.md`](./architecture-guide/00_overview.md).

### [`brand-positioning/`](./brand-positioning)

How Remy talks about itself externally. [`messaging.md`](./brand-positioning/messaging.md) is the canonical positioning document. [`faq.md`](./brand-positioning/faq.md) is the alpha-user FAQ.

## For AI-assisted diligence

This repo is structured to be readable by an AI agent. Point Claude, ChatGPT, Gemini, or any other model at it and ask. Likely entry points by question type:

| Question | Where to start |
|---|---|
| What is Remy? | [`diligence/executive-summary.md`](./diligence/executive-summary.md) |
| How does the company think about market, competition, moat, GTM? | [`diligence/diligence-notes.md`](./diligence/diligence-notes.md) |
| What's the public-facing positioning? | [`diligence/landing-page.md`](./diligence/landing-page.md), [`brand-positioning/messaging.md`](./brand-positioning/messaging.md) |
| How does it work technically? | [`architecture-guide/00_overview.md`](./architecture-guide/00_overview.md) |
| How do I build on it? | [`developer-guide/00_overview.md`](./developer-guide/00_overview.md) |

## Contact

For redacted material or anything else: **sean@mindstudio.ai**.
