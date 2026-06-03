# Product & Traction

What Remy is, how it's used, what gets generated, what happens after the build, and what the alpha looks like as of late May 2026.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

---

## Product Overview

### What Remy is

Remy is an **AI product agent**. A user describes an application (what it does, who it's for, what it needs to handle), and Remy produces the finished software end-to-end. This is a different category from other AI tools: coding agents like Claude Code accelerate engineers working inside existing codebases, and prototype builders like Lovable generate demos from prompts. Remy operates at the level of complete, production-ready applications, with no engineer required in the loop. Underneath, it compiles against its own platform substrate (the models, integrations, and infrastructure that make real deployment possible).

### What using it feels like

Working with Remy is a collaboration. The user starts by describing an idea in plain language, through voice, text, or a pasted document, and Remy engages as a thought partner, asking clarifying questions, proposing design directions, and pulling in its team of specialist sub-agents (described below) as the work progresses. Decisions surface visibly throughout, and the user can revise at any step before Remy moves to implementation.

In practice, a typical build looks something like this. A finance director opens Remy and describes an approval workflow her team needs: who submits, who approves, at what thresholds, and what happens when things get escalated. Remy asks about the data model, integrations with existing tools, and edge cases, and produces a structured spec the user reviews and revises. Once the spec is approved, Remy generates the full application (backend, database, authentication, and web interface) and runs its QA agent against the deployed app before handing it back. The whole process takes thirty to sixty minutes.

### The agent team

When Remy gets to work, it isn't one model doing everything. It's a coordinated team of six specialist sub-agents, each tuned to its domain:

- **Coding Agent** — Built on the same frontier coding models that power Claude Code, Codex, and Antigravity, with patterns from production codebases informing every decision.
- **Design Agent** — Trained on a curated library of contemporary reference and a complete system for thinking about design from first principles. Knows why so much AI-generated design looks generic, and how to avoid it.
- **Roadmap Agent** — Owns the roadmap and the pitch deck. Holds the product vision, pushes the user to think bigger, and keeps the scope sharp as the product grows.
- **QA Agent** — Directly interacts with a real browser. Clicks through flows the way a user would, writes structured bug reports, captures video walkthroughs, and verifies what needs to be verified.
- **Architecture Agent** — A staff-level engineer the rest of the team consults on every meaningful architectural decision, and that keeps an eye on the structural choices that look small now and get expensive later.
- **Research Agent** — Gathers references, studies competitors, pulls in the context the rest of the team needs.

The team uses frontier models from Anthropic, OpenAI, and Google. Each agent can be configured to a specific model per task, and inference cost is passed through to the user at provider rates.

### What you get at the end

At the end of a build, the user has six deliverables:

- A **spec** — a structured, human-readable document capturing what the app does, who it's for, and how it should look. This is the source of truth that the agent compiles from (see [Moat](./05_moat.md) for why this matters).
- A **deployed, production-ready application**, with backend, database, authentication, and a live URL.
- A **design system** — brand identity, typography, color, applied consistently across the app.
- A **product roadmap** outlining potential next features, generated alongside the application and buildable with a single click.
- A **pitch deck** describing what was built and why, sharable with stakeholders.
- **Documentation** for users and for the team that will maintain it.

The application itself is production software, ready to hand to real users on day one.

### What Remy does after the build

Shipping the application is just the beginning. Other AI tools stop at the build; Remy keeps working. The same agent team handles the post-launch loop:

- **Marketing assets** — social posts, email sequences, press kits, ad creative.
- **Analytics** — pageviews, engagement, conversion, live visitor stats.
- **A/B testing** — Remy designs the variants, runs the test, picks the winner.
- **Production monitoring** — watches logs, error rates, latency. Tells the user when something breaks and prepares pull requests to fix it.
- **Bug fixes** — tracks crashes, reproduces them, traces the cause, patches the code.
- **Documentation** — auto-generated and kept current. Help docs, technical docs, API references.
- **Compliance & audits** — SOC 2, GDPR, audit trails maintained as the product evolves.
- **Roadmap iteration** — the next feature is one click away from the maintained roadmap.

This is the "ships and runs" part of "builds, ships, and runs products" — the loop that compounds Remy's TAM against incumbent dev-shop spend and the ongoing PM/marketing/ops cost a buyer would otherwise carry. Most AI tools in this category sell the build. Remy sells the build plus everything that has to happen after it.

### Who it's for

Remy is built for a spectrum of users that evolves over time.

**The early adopter, today: technical PMs and semi-technical operators.** People who get excited about spec-driven development, are comfortable iterating on a structured artifact, and are typically reading places like Lenny's, Hacker News, and AI tooling Discords. They're the buyers showing up in the alpha — every LinkedIn testimonial in the deck is from this segment (Krista Gamble, Merziyah Poonawala, Ligaya Beebe, Francis Interlandi at Toast, and others), and they're the deliberate focus of GTM Phase 1. This segment is a real, sizable market on its own — hundreds of thousands of US technical PMs and ops engineers — and it converts through PLG without a sales motion.

**The destination, as the product matures: the broader non-technical business operator.** Operations leads, finance managers, HR leaders, revenue operations owners. People who know exactly what they need the software to do but don't write code and don't have engineering resources to build it. Remy reaches them through two motions: (a) the technical PM at their company builds something they want to use or fork, and (b) the conversational interface matures to where the cognitive load of a spec is hidden behind the natural-language UX. This is where the broader $15-25B SAM lives; it's the destination, not the immediate claim.

The thesis doesn't require both to land. The technical-PM segment is venture-scale on its own. The broader operator market is the expansion that turns a venture outcome into a category outcome — and the wedge-to-expansion arc is exactly how categories like this get built.

### What gets built on Remy today

Internal business applications are the primary commercial focus. They're not the full extent of what Remy produces; users at alpha are building across full-stack apps, AI agents, websites, and games.

**Internal business applications (the primary commercial focus):**

- Custom inventory and asset tracking for operations teams
- Internal approval and review workflows for finance teams
- Employee onboarding and HR portals
- Sales operations extensions and lightweight CRMs
- Vendor and contract management systems
- Data dashboards and reporting tools
- Fund management and operations tooling

**AI agents, chatbots, and automated tooling:**

- Custom AI chatbots with access to company data and internal systems
- Autonomous agents running on scheduled cycles (research, monitoring, reporting)
- Automated content creation workflows (reports, articles, summaries)
- Slack and Telegram bots for team workflows
- Scheduled alerting and workflow automations

**Consumer applications, websites, and games:**

- Content platforms, communities, and directories
- Portfolio and marketing websites
- Mobile-responsive consumer apps
- Turn-based and asynchronous multiplayer games
- Puzzle and interactive fiction experiences

### Product state

- **Open alpha.** Live and publicly available today.
- **Real production usage.** Customer applications built with Remy are running in production, including institutional tooling.
- **Open source.** The core agent, local development tunnel, backend and frontend SDKs, and browser automation agent are all open-sourced.

---

## Traction

### Alpha usage

**Timeline context, worth knowing up front:** Remy entered open alpha in late April 2026. The traction below reflects roughly four to six weeks of public availability. The team has been heads-down on product depth during this window — commercial motion (pricing, sales, paid customers) is deliberately downstream of the Seed close, not running in parallel. Read everything below with that timeline in mind.

- **Over 600 applications published in the first 30 days of open alpha, with alpha users collectively spending more than $150,000 in inference costs to build them.** A live, continuously-updating gallery is at [debut.msagent.ai](https://debut.msagent.ai) — the breadth across internal tools, AI agents, consumer apps, games, and vertical SaaS is itself a signal of what the agent can produce. The inference spend is meaningful as economic signal: alpha users are paying provider rates for serious model usage on real work, not running benchmark prompts — and they're doing so even though Remy itself charges no platform fee during alpha. Power users routinely invest hundreds of hours in a single project, iterating across many recompile cycles. That depth of engagement is itself evidence the spec-driven workflow holds up under real iterative use, not just first-build demos. Live builds, both from the founders and from real alpha users walking through their own projects, are on YouTube at [@MindStudio_ai/videos](https://www.youtube.com/@MindStudio_ai/videos). Investors who want to see what the product actually outputs — without taking the founders' word for it — should spend time in those two places.

- **An institutional customer has gone deep on a pre-GA build — one notable example of how serious alpha-stage builds can get.** A team at an institutional investor has used Remy during alpha to build a full fund-management application set to run that organization's fund operations, with ongoing rollout underway. **The application was built by the customer using Remy as a product — not built by the Remy team on the customer's behalf.** The customer has no internal engineering team on the build, and the Remy founders were available for occasional advice but did not write the application code. A real institutional deployment on a pre-GA platform is unusual at this stage, and worth pointing at as a depth signal sitting alongside the volume above — one concrete example among many alpha builds, not the only build of interest.

- **The platform substrate Remy compiles against is not a new system.** It matured over years underneath MindStudio and the GoMeta-era infrastructure that preceded it, hardened by real enterprise production traffic at SOC 2 Type 1 / Type 2 and GDPR scale. MindStudio powered hundreds of applications at organizations including The New York Times, Advance Local, ServiceNow, and HMRC. Individual employees at TikTok, Microsoft, Adobe, Oracle, Intel, Meta, Booking.com, Novo Nordisk, and others have been paying users of the same substrate. Remy is pre-revenue and those users are not Remy customers — but the production hardening of what Remy compiles against is real, substantial, and impossible to replicate from a clean sheet in the timeframe a typical Seed-to-Series-A window allows. (See [Moat → The runtime](./05_moat.md#2-the-runtime) for the competitive consequence; [Corporate Structure](./01_overview.md#corporate-structure) for what MindStudio was and why it's being sunset.)

- **Qualitative reception is consistent.** First-time users — including PMs, designers, and operators with no prior Remy exposure — are routinely surprised by what comes out of an hour-long session. The LinkedIn testimonials carried in the seed deck (Krista Gamble, Merziyah Poonawala, Ligaya Beebe, Francis Interlandi at Toast, and others) are independent voices saying this. The pattern is consistent enough that it shows up across builds in completely different categories.

### Current runway

> *[Private — Seed-stage cash position and runway available on request]*
