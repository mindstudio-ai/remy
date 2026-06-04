# Executive Summary: Remy

> The short version. This is the seed deck condensed to text — a fast read for investors who want the narrative before the longer-form material elsewhere in the repo. For deeper context: the eight numbered diligence files in this folder (start with [`05_moat.md`](./05_moat.md) or [`06_risks-and-downside.md`](./06_risks-and-downside.md), or see the [docs README](../README.md#diligence--investor-facing-material) for the full index), [`landing-page.md`](./landing-page.md), and the [whitepaper](https://goremy.ai/whitepaper).

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

## Traction and production credibility

Two distinct signals, worth keeping separate:

**Remy alpha (the product itself).** Open alpha, launched in late April 2026 — roughly four to six weeks of public availability at the time of writing. In that window: **over 600 applications published, $150,000+ in inference spend** by alpha users (live gallery: [debut.msagent.ai](https://debut.msagent.ai); live builds on YouTube: [@MindStudio_ai/videos](https://www.youtube.com/@MindStudio_ai/videos)). The inference spend is real economic signal — alpha users paying provider rates for serious model usage on real work, even though Remy charges no platform fee during alpha — and power users routinely invest hundreds of hours per project. An institutional customer has built a full fund-management application on Remy at alpha, set to run that organization's fund operations. Remy itself is pre-revenue — pricing and sales motion are deliberately downstream of the Seed close.

**The substrate underneath Remy (the production hardening).** Not a new system. Years of enterprise production traffic underneath MindStudio, the prior product the team built inside GoMeta. The substrate powers hundreds of applications at organizations including **The New York Times, Advance Local, ServiceNow, and His Majesty's Revenue & Customs**. Individual employees at **TikTok, Microsoft, Adobe, Oracle, Intel, Meta, Booking.com, Novo Nordisk** and others have been paying users of the same substrate. Those users are not Remy revenue — but the production hardening of what Remy compiles against (multi-tenant isolation, audit logging, scale tested by real workloads) is real and would take a competitor years to reproduce.

**SOC 2 Type 1 & Type 2. GDPR compliant.**

## Competitive position

A 2x2 of *power of applications produced* (y-axis) vs. *technical skills required* (x-axis):

|  | **Low skill required** | **High skill required** |
|---|---|---|
| **Powerful applications** (real business impact) | **Remy** | Claude Code, Cursor, OpenAI Codex |
| **Less powerful** (prototypes, demos) | Replit, Bolt, Lovable | — |

Remy sits alone in the upper-left quadrant: the only product that combines low technical-skill requirements with the power to produce real business applications. The coding agents are in the upper-right — they produce powerful output, but only for the developers who can drive them. The vibe-coders are in the lower-left — accessible to non-developers, but the output is prototypes and demos.

**Ideal customer:** non-technical business users and the organizations they work inside. Not professional developers (Claude / Cursor / Codex serve them). Not consumers and prosumers (Lovable / Bolt / Replit serve them). The middle.

## The bigger story behind the wedge

The immediate Remy story is the AI app builder market — a defensible $15–25B SAM, with Remy producing real, production-grade applications for a non-technical business buyer no other tool serves today. That's what the Seed is for.

The longer-arc story is what the wedge becomes. About half of the code committed to GitHub today is written with AI assistance, and that share keeps growing. Orders of magnitude more software is being created than three years ago. The cloud infrastructure underneath was designed for human developers writing code on human timescales: console UI for a person, IAM model for a team, deployment review for a human commit, pricing for human-bounded usage. None of those assumptions hold up well when agents are doing most of the writing.

If you were building cloud infrastructure now, you'd build it differently. The incumbents can't easily redesign their abstraction stacks without breaking trillions in customer deployments; the newer infrastructure-primitive players are each building pieces of what a modern cloud would look like, but none of them have an agent at the center of the developer experience. Remy does. The platform underneath is designed around what the agent needs.

That's the long-arc thesis: not "an AI tool that builds apps," but the cloud platform for the agent era of software. The wedge is what the Seed funds. The platform thesis is what the company becomes if it works. (See [Thesis #3](./03_thesis.md#3-thesis-remy-is-building-the-cloud-the-agent-era-needs) for the full argument, or the [Cloud 2.0 narrative](../brand-positioning/cloud-2-narrative.md) for a plain-language articulation aimed at broader audiences.)

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

**Dmitry Shapiro** — Co-founder. Co-founder and CEO of GoMeta, leading the company across Koji (link-in-bio platform, ~700k creators, acquired by Linktree in December 2023) and MindStudio. Previously Product Manager @ Google, CTO @ MySpace, founder of Veoh Networks and Akonix Systems.

**Sean Thielen** — Co-founder. Co-founder of GoMeta alongside Dmitry; CTO across Koji and MindStudio. Built the current state of Remy directly alongside Dmitry, without engineering staff.

## What you can do next

- **Try Remy** — open alpha at [mindstudio.ai/pricing](https://www.mindstudio.ai/pricing).
- **See what people are building** — [debut.msagent.ai](https://debut.msagent.ai).
- **Read the whitepaper** — [goremy.ai/whitepaper](https://goremy.ai/whitepaper).
- **Diligence material in this repo** — the eight numbered files in this folder (`01_overview.md` through `08_deal-and-financials.md`) for the longer-form investor-facing notes; [`landing-page.md`](./landing-page.md) for the public site in markdown. The [docs README](../README.md#diligence--investor-facing-material) has the full index with one-line summaries.

---

*© 2026 Wooster Labs, Inc.*
