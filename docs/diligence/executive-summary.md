# Executive Summary: Remy

> The short version. This is the seed deck condensed to text — a fast read for investors who want the narrative before the longer-form material elsewhere in the repo. For deeper context: [`diligence-notes.md`](./diligence-notes.md), [`landing-page.md`](./landing-page.md), and the [whitepaper](https://goremy.ai/whitepaper).

---

## The opening

Coding agents — Claude Code, Cursor, OpenAI Codex — are extraordinarily powerful tools that are transforming software development. In the hands of a professional developer, a single person can now do the work of an entire team.

In the hands of a non-technical business user trying to build a custom application, they don't work. Buyers who know exactly what they want the software to do but can't write code, debug, or operate inside a git repo are left with the same options they've always had: overbuilt SaaS subscriptions, fragile spreadsheets, and $50K-$500K dev shop builds.

## The picture the deck draws

Three images, one after the next:

A professional developer in front of a beautifully built cabin, arms crossed, satisfied. The caption reads *"An individual professional developer can do the work of an entire team."*

The same scene with a different protagonist: a non-technical business user, hand to forehead, standing in front of a half-built shack — frame up, no walls, materials scattered on the ground. *"Non-technical business users trying to build custom applications struggle to complete projects with coding agents."*

Then the payoff: the same non-technical user, arms crossed, surveying a sprawling village of finished cabins lit up at dusk. A wooden sign in the foreground reads *"I BUILT ALL OF THESE."* That's the promise of Remy.

## Why the gap exists

Because building a custom business application requires a lot more than writing code. The full picture spans:

| | |
|---|---|
| Ideation & Research | Code Review |
| Product Strategy | Testing / QA |
| Requirements | Security |
| Information Architecture | Content & Data |
| UX Design | Documentation |
| UI Design | DevOps & Infrastructure |
| Technical Architecture | Deployment |
| Development Planning | Monitoring & Observability |
| **Development / Coding** | Maintenance & Support |
| | Iteration & Improvement |

Coding agents do one of those things — the bolded one. Remy does all of them.

## What Remy is

Remy is a product-building agent. A non-technical business user describes what they want; Remy works it into a buildable shape, coordinates a team of specialist sub-agents (design, architecture, QA, research, roadmap), and produces a deployed, production-grade application — backend, database, authentication, web interface — along with the roadmap, pitch deck, design system, and documentation that go with it. A typical first build takes about an hour.

Then it keeps working: marketing assets, analytics, A/B tests, production monitoring, bug fixes, documentation, compliance. Other AI tools stop at the build. Remy is just getting started.

## The enterprise frame

Two promises in one product:

- **Non-technical business users get to rapidly build all types of business applications.**
- **Organizations get an enterprise platform to manage and control everything.**

The platform substrate beneath Remy:

| Layer | Includes |
|---|---|
| Identity | SSO, SCIM, directory sync |
| Deployment | Web app, API, scheduled, email, extension |
| Runtime | Serverless execution, failover |
| Models | 200+ providers, BYO, on-prem |
| Connectors | Integrations to business systems |
| Knowledge | RAG, vector stores, documents |
| Logging & audit | Operational logs, compliance trails |
| Rights | Roles, permissions |
| Versioning | Dev, staging, prod |
| Billing | Budgets, quotas, alerts |

None of it was built in the last twelve months — it's the product of years of platform engineering, hardened by real production traffic.

## Production credibility

The platform substrate underneath Remy has been in production use for years. It powers hundreds of applications at organizations including **The New York Times, Advance Local, ServiceNow, and His Majesty's Revenue & Customs**. Individual employees at **TikTok, Microsoft, Adobe, Oracle, Intel, Meta, Booking.com, Novo Nordisk** and others have been paying users of the same substrate. (Note: those users are not Remy revenue — Remy itself is pre-revenue in open alpha — but the production maturity of what Remy compiles against is real.)

**SOC 2 Type 1 & Type 2. GDPR compliant.**

## Competitive position

A 2x2 of *power of applications produced* (y-axis) vs. *technical skills required* (x-axis):

|  | **Low skill required** | **High skill required** |
|---|---|---|
| **Powerful applications** (real business impact) | **Remy** | Claude Code, Cursor, OpenAI Codex |
| **Less powerful** (prototypes, demos) | Replit, Bolt, Lovable | — |

Remy sits alone in the upper-left quadrant: the only product that combines low technical-skill requirements with the power to produce real business applications. The coding agents are in the upper-right — they produce powerful output, but only for the developers who can drive them. The vibe-coders are in the lower-left — accessible to non-developers, but the output is prototypes and demos.

**Ideal customer:** non-technical business users and the organizations they work inside. Not professional developers (Claude / Cursor / Codex serve them). Not consumers and prosumers (Lovable / Bolt / Replit serve them). The middle.

## What real users are saying

From open-alpha LinkedIn posts by independent users (selected; full set in the deck):

> *"Remy not only built the app, it acted like a product partner. It created the product direction, pitch, roadmap, branding, monetization paths, and use cases I had not fully considered."* — **Krista Gamble**, Product Manager
>
> *"My instinct going in was to manage the build — review designs before committing, break the scope down, stay close to what was being built. Classic PM behavior. And Remy pushed back on all of it. When I stopped trying to be the builder and leaned into being the visionary, the tool clicked."* — **Merziyah Poonawala**, Product & Implementation Leader
>
> *"Same brief. Same goal. Four dimensions. … If you want something that works end to end without the setup tax and that looks beautiful and non-generic, go with Remy."* — **Ligaya Beebe**, comparing Remy to Claude Code on the same project
>
> *"Honestly, it's the whole package that gets me. The roadmap view, the spec view, the fact that you can just click on a thing in the roadmap and it starts building... chef's kiss."* — **Francis Interlandi**, Principal PM @ Toast

## "Don't take our word for it"

The deck makes a direct AI-DD invitation: ask your AI of choice to evaluate the codebase.

- Source: `https://github.com/mindstudio-ai/remy/` and `https://github.com/mindstudio-ai/mindstudio-agent` *(repository URLs reflect the predecessor org; Wooster Labs is the new entity).*
- Suggested prompts: *How would you rate the value of such a platform? How would you rate the difficulty of writing the codebase? How would you rate the code quality?*

The same invitation extends to this repo. Point an AI at it and ask.

## Team

**Dmitry Shapiro** — Co-founder. Previously Product @ Google, CTO @ MySpace, Founder of Veoh Networks and Akonix Systems.

**Sean Thielen** — Co-founder. Previously CTO @ MindStudio, CTO @ Koji. Built the current state of Remy directly alongside Dmitry, without engineering staff.

## What you can do next

- **Try Remy** — open alpha at [mindstudio.ai/pricing](https://www.mindstudio.ai/pricing).
- **See what people are building** — [debut.msagent.ai](https://debut.msagent.ai).
- **Read the whitepaper** — [goremy.ai/whitepaper](https://goremy.ai/whitepaper).
- **Diligence material in this repo** — [`diligence-notes.md`](./diligence-notes.md) (the longer-form investor-facing notes), [`landing-page.md`](./landing-page.md) (the public site, in MD).

---

*© 2026 Wooster Labs, Inc.*
