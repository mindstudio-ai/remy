# Diligence Notes: Remy

> This isn't a memo, and it's not on the path to becoming one. It's a collection of data points and bones we know investors will need when evaluating Remy — captured pre-emptively in the repo so anyone doing diligence (or pointing an AI at this repo) can find substantive answers to the usual questions.
>
> Some sections are fleshed out. Others are placeholders. Specific financial figures, deal mechanics, and cap-table detail that aren't ready for public sharing are marked `[Private]` — happy to share more.
>
> Contact: **sean@mindstudio.ai**.

---

## Opportunity Summary

Remy is an AI product agent that produces polished, production-grade business applications from plain-language descriptions and conversations. Remy fills the commercially-underserved middle of the AI software creation market. On one side are prototype generators like Lovable and Bolt, which produce frontends and demos but struggle to build real applications with any sort of depth or production-readiness. On the other are engineering-focused coding agents like Claude Code and Codex, which accelerate and empower existing engineering teams and require developer fluency.

The ICP is the non-technical business operator at mid-market and SMB companies (ops, finance, HR, revenue operations), a buyer for whom no other platform today produces real, owned, full-stack applications on demand. The US SAM is estimated at $15-25B. During Remy's alpha, an institutional customer has built a full fund-management application on Remy that is set to run that organization's fund operations — a direct proof point for what Remy can produce in a live institutional context.

Remy works. The category question has shifted from "can this be built" to "who captures this segment." The combined asset — Remy and the platform substrate it compiles against (200+ AI models, 1,000+ integrations, managed database, authentication, and deployment) — has multiple commercial paths to value: direct GTM to business operators, B2B2C licensing to incumbent SaaS, and strategic acquisition. No single path needs to work in isolation for the underlying thesis to hold.

---

## Corporate Structure

Remy is the brand and product. The legal entity is **Wooster Labs, Inc.**, formed as a fresh entity through a spinout from GoMeta, Inc./MindStudio to consolidate around the AI product agent opportunity created by Remy.

The spinout absorbed the engineering team and the relevant platform infrastructure — 200+ AI models, 1,000+ integrations, sandbox execution, managed databases, authentication, deployment. The predecessor product, **MindStudio**, is being sunset; its underlying platform substrate is now Remy's. That substrate has been in production use by major enterprises for years — useful as a credibility signal for the maturity of the infrastructure Remy compiles against, though those users are not transferring as Remy revenue. **Remy is an alpha product and is pre-revenue.**

Existing GoMeta investors converted into Wooster Labs via a pre-seed SAFE at spinout. The Seed round being raised sits on top of that SAFE on an otherwise clean cap table.

---

## Deal Structure

### Round mechanics

> *[Private — Seed round terms, pricing, and structure available on request]*

### Use of proceeds

> *[Private — use of proceeds available on request]*

### Post-Seed runway

> *[Private — Seed-stage runway projections available on request]*

### Governance

> *[Private — board composition and governance terms available on request]*

### Current investors

The cap table entering the Seed consists of founder common, an employee option pool, and a pre-seed SAFE held by investors who rolled in at spinout (see Corporate Structure above). Specific names and terms are redacted below.

> *[Private — pre-seed SAFE investor list and terms available on request]*

---

## Investment Thesis

### 1. Thesis: Remy addresses the largest underserved segment in AI software creation

- **The AI software creation market has bifurcated, and neither end serves most commercial demand.** On one end are prototype generators like Lovable and Bolt, which produce frontends and demos from natural-language prompts. These tools have attracted billions in funding and millions of users, and have proven there is real appetite for building software without writing code. What they have not produced is real applications with persistent data, real authentication, production-grade backends, and maintainable code. On the other end are engineering-focused coding agents like Claude Code, Codex, and Google's Antigravity. These tools accelerate existing developers working inside existing codebases, and are genuinely powerful for that use case. They are also inaccessible to anyone who doesn't already write code or understand infrastructure.

- **The commercial demand for AI-built software sits between those two segments.** It is in the hands of non-technical business operators who need real applications: ops managers who need a custom inventory tracker, finance teams who need an internal approval workflow, HR teams who need a proper onboarding portal. They know what the software needs to do. They do not write code and do not have engineering resources to build what they need. Today, that demand is spent on overbuilt SaaS subscriptions that in reality they only use a fraction of, on spreadsheet workarounds that are fragile and non-auditable, or on one-off contractor and dev-shop builds that cost $50K to $500K and arrive frozen on delivery. Every one of those dollars is addressable, and Remy is the only serious player built directly for this buyer.

- **The downstream consequence, if we are right, is large.** When every mid-market company can produce custom internal applications in days for ~$1-10K that previously took months and millions, the logic of paying for overbuilt SaaS to fill gaps collapses. Hundreds of billions in business software spend will begin to restructure around owned, custom applications. Remy is an early, serious entry in the category created by that restructuring.

### 2. Thesis: Remy is a step change in what an AI platform can produce

- **Remy produces polished, production-grade software.** Applications built with Remy are full products in daily use today. They hold real data, integrate with real services, and serve real people. First-time viewers routinely do not believe an AI tool built them. The gap between "AI prototype" and "real product" is where most of the category still lives, and Remy is on the other side of it.

- **Using Remy feels closer to working with a senior creative lead than prompting a tool.** A user describes what they want, often by voice. Remy asks the clarifying questions a good product partner would ask, proposes design directions, iterates visibly, and verifies its own work before handing it back. The interaction is a conversation, not a query.

- **A sophisticated institutional customer is actively onboarding Remy into its core operations.** A full fund-management application has been built on Remy at alpha, without engineering support beyond the two founders, and is set to run that customer's fund operations. A real institutional deployment on a pre-GA platform is unusual.

- **Two founders produced Remy's current state directly.** Dmitry and Sean built the agent on top of platform infrastructure they had previously built and that is now consolidated into Remy, without a large engineering team. The ratio of product capability to headcount tells us about both the leverage Remy gives its users and the capital efficiency of the team behind it.

### 3. Thesis: Remy's durable competitive advantage is the platform underneath the agent, not the agent itself

- **The scope underneath Remy is a platform, not a product.** Remy's underlying platform integrates 200+ AI models and exposes 1,000+ external services on day one (Google Workspace, Slack, HubSpot, and many more). It includes managed databases, role-based authentication, deployment infrastructure, and sandboxed execution. All of it runs in production today, with real customer workloads on it. This is what Remy compiles to when a user describes an application.

- **AI models are commoditizing; the durable advantage is what sits underneath.** Every serious player in the space has access to the same Claude, GPT, and Gemini, and that's the part getting cheaper every quarter. The difference between a tool that produces a demo and a tool that produces a business application is not the underlying model. It is the infrastructure underneath the agent: the integrations, the data layer, the authentication, the deployment path. A new entrant with full access to every frontier model still has to build all of that from scratch.

- **The artifact is the spec, not the code.** Remy's agent works against a layer of structured spec files that the user and the agent edit together; the code is generated (and regenerated) from that spec. When the model gets better next year, Remy re-compiles. When the customer wants to change something, they change the spec. The spec is also what makes Remy legible to an organization — a director can review what an employee is building before it ships, because the spec is human-readable rather than thousands of lines of TypeScript. Other tools in the category treat the prompt as throwaway and the code as the artifact, which is fine for a demo but unworkable for enterprise governance. See [Moat](#moat) for the full argument.

- **Real business software only works when it connects to the other tools a business runs on.** An HR portal is limited without payroll integration. A finance workflow is incomplete without Stripe or NetSuite. A sales extension breaks if it cannot read Salesforce. Remy's platform already has these integrations built in, so compiled applications ship connected from day one. That is the difference between AI-generated software that can actually run a business and AI-generated software that stops at the demo.

- **This is built, not on a roadmap.** The platform substrate Remy compiles against has been in production use for years, including by employees at major enterprises. Competitors in the AI software creation space are quoting similar feature lists as goals; Remy's platform already has them in production.

### 4. Thesis: A structurally wide exit field

- **Every horizontal SaaS needs a Remy for its customer base.** Offering end-customers the ability to build custom applications on top of the platform is rapidly becoming table stakes across CRM, ERP, HRIS, PM, and data platforms. The incumbents face growing pressure from their own customers to provide that capability, and most of them do not have a credible internal answer.

- **Remy's platform is the most credible substrate for those incumbents to embed.** No other AI-native application platform is production-grade, enterprise-ready, and operational today. B2B2C licensing into the incumbent SaaS ecosystem is a durable, independent revenue leg that is structurally attractive to strategic acquirers.

- **A wide acquirer universe supports price competition in any exit process.** The credible buyers span horizontal SaaS (Salesforce, HubSpot, Monday, ServiceNow, Workday), cloud and developer platform incumbents (AWS, Google Cloud, Microsoft Azure, Vercel, Supabase), and enterprise automation and low-code adjacencies (UIPath, Appian, OutSystems). Each has a different strategic reason to own Remy, which translates into real pricing leverage in any sale process.

- **The asset has multiple commercial paths to value.** Remy and its underlying platform are one system: the platform is what makes the agent possible, and the agent is how the platform reaches users. That combined asset can reach commercial value through direct GTM to business operators, through B2B2C licensing to incumbent SaaS, or through strategic acquisition. No single path needs to work in isolation for the opportunity to make sense.

### 5. Thesis: A known-quantity founding team

- **Dmitry and Sean are long-tenured, prudent operators.** They have years of platform-engineering execution behind them — work that has now consolidated into Remy through the spinout.

- **They have shipped software at real scale.** The founders' prior ventures include products used by tens of millions of people. Whatever the commercial arc of any one of those products, the ability of this team to build software that reaches meaningful scale is a proven capability, not a speculative one.

- **Capital stewarded with restraint.** The team ran lean and focused through the predecessor platform's evolution, rather than burning capital to maintain headcount or appearances. That discipline is a significant part of why Remy exists at all.

- **Appetite for genuinely big ideas.** Each product direction the team has pursued has aimed at a meaningful category shift, not an incremental improvement on an existing playbook. Remy is the deepest technical expression of that instinct yet, and the one most likely to land.

---

## Team

The founders have six years of platform-engineering execution behind them, work that has now consolidated into Remy through the spinout.

### Dmitry Shapiro — Co-founder

Dmitry leads the company and all non-technical functions: strategy, operations, business, finance, legal, and go-to-market. Previously Product @ Google, CTO @ MySpace, founder of Veoh Networks and Akonix Systems.

### Sean Thielen — Co-founder

Sean leads all technology, product, and engineering. He has built the current state of Remy directly alongside Dmitry, without engineering staff. Previously CTO @ MindStudio (the predecessor product), CTO @ Koji.

### Supporting team

Beyond the founders, the company runs with fewer than ten people across engineering, GTM, finance and operations, and customer success. This group carried the platform substrate through the spinout and runs Remy's alpha on a skeleton budget. Post-funding hiring will rebuild the team for commercial scale, as detailed in the Use of Proceeds and Milestones sections.

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

- A **spec** — a structured, human-readable document capturing what the app does, who it's for, and how it should look. This is the source of truth that the agent compiles from (see [Moat](#moat) for why this matters).
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

The target user is a non-technical business operator at a mid-market or SMB company: an operations lead, a finance manager, an HR leader, or a revenue operations owner. These are people who know exactly what they need the software to do but don't write code, and don't have engineering resources available to build what they need.

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

- **Hundreds of apps have been built on Remy during open alpha.** A live, continuously-updating gallery of alpha builds is at [debut.msagent.ai](https://debut.msagent.ai) — the breadth across internal tools, AI agents, consumer apps, games, and vertical SaaS is itself a signal of what the agent can produce. Live builds, both from the founders and from real alpha users walking through their own projects, are on YouTube at [@MindStudio_ai/videos](https://www.youtube.com/@MindStudio_ai/videos). Investors who want to see what the product actually outputs — without taking the founders' word for it — should spend time in those two places.

- **An institutional customer has gone deep on a pre-GA build.** A full fund-management application has been built on Remy during alpha, set to run that organization's fund operations, with ongoing rollout underway. The application was produced without engineering support beyond the two founders. A real institutional deployment on a pre-GA platform is unusual at this stage and is the load-bearing depth signal sitting alongside the volume above.

- **The platform substrate Remy compiles against is not a new system.** It matured over years underneath the predecessor product, hardened by real enterprise production traffic at SOC 2 Type 1 / Type 2 and GDPR scale. The predecessor itself powered hundreds of applications at organizations including the New York Times, Advance Local, ServiceNow, and HMRC. Individual employees at TikTok, Microsoft, Adobe, Oracle, Intel, Meta, Booking.com, Novo Nordisk, and others have been paying users of the same substrate. Remy is pre-revenue and those users are not Remy customers — but the production hardening of what Remy compiles against is real, substantial, and impossible to replicate from a clean sheet in the timeframe a typical Seed-to-Series-A window allows. (See [Moat → The runtime](#moat) for the competitive consequence.)

- **Qualitative reception is consistent.** First-time users — including PMs, designers, and operators with no prior Remy exposure — are routinely surprised by what comes out of an hour-long session. The LinkedIn testimonials carried in the seed deck (Krista Gamble, Merziyah Poonawala, Ligaya Beebe, Francis Interlandi at Toast, and others) are independent voices saying this. The pattern is consistent enough that it shows up across builds in completely different categories.

### Current runway

> *[Private — Seed-stage cash position and runway available on request]*

---

## Market Landscape

Remy plays in business application development for mid-market and SMB enterprises. This is a distinct market from AI coding tools (which serve professional developers) and consumer app generators (which serve individuals and creators), and it is one of the largest and oldest markets in software. Global spending on business application development exceeds $180B annually, and US mid-market and SMB enterprises alone represent millions of potential buyers. Adjacent categories include internal tools, low-code and no-code platforms, and custom software services; within those, Retool, Airtable, Bubble, and Zapier all operate at billion-dollar valuations without serving the specific buyer or use case Remy is built for.

Three dynamics shape the opportunity today.

**Every company has business software gaps that no off-the-shelf SaaS covers.** Every mid-market and SMB company has a list of custom applications it would build if building were affordable: inventory trackers, approval workflows, vendor management systems, commission calculators, onboarding portals, and dozens of other workflow-specific tools. These gaps are filled today by overbuilt SaaS subscriptions used at a fraction of their capability, by spreadsheet workarounds that are fragile and non-auditable, or by one-off contractor and dev-shop builds that cost $50K-$500K, take three to six months, and arrive frozen on delivery. The aggregate spend on workarounds is substantial and almost entirely addressable by a tool that produces real custom software at a fraction of the cost and cycle time.

**The internal-tools category is commercially validated, but the existing leaders do not serve this buyer.** Retool, Airtable, Bubble, and Zapier built billion-dollar businesses by letting technically adjacent users assemble tools from primitives. They proved that non-engineers will pay for software-creation capability. What none of them produces is a real, production-grade, full-stack application that a non-technical business operator can describe and receive. Retool is a developer tool at heart. Airtable functions well as a database but hits limits as application complexity grows and locks users into its proprietary format. Bubble and Zapier are assembly tools rather than application builders. The commercial validation is there; a category leader for the specific buyer Remy targets is not.

**The AI-native shift is underway, and no incumbent has a purpose-built answer.** Existing low-code and internal-tools platforms are bolting AI onto older architectures: natural-language query interfaces, AI assistants inside visual builders, prompt-based generation layered on top of drag-and-drop primitives. These are retrofits. They do not change what the platform produces or who it serves. The opening is for a product that is AI-native from the foundation up, where the agent is the primary interface and the platform underneath is built to support what the agent produces. Remy is one of the first serious expressions of that approach.

---

## Competitive Landscape

The AI software creation category is crowded and well-funded, with billions of dollars behind the most visible tools. None of that money is currently flowing to products built for Remy's buyer. The three categories closest to Remy (AI coding agents, vibe coding agents, and low-code platforms) each have real commercial traction, and each leaves the non-technical business operator unserved. The fourth category is the status quo: the workarounds mid-market and SMB buyers use today because nothing else fits their needs.

### AI coding agents (Claude Code, Cursor, Codex)

These are code-level assistants for professional engineers working inside existing codebases. They have raised significant capital and are valued in the billions because they make good developers faster. For Remy's ICP, though, they are the wrong tool entirely. A mid-market ops manager building a custom app from scratch is not a developer. These tools assume the user can read and write code, debug, operate inside a git repo, and configure production infrastructure. None of that is true for the buyer Remy targets.

### Vibe coding agents (Lovable, Bolt, Replit Agent)

These tools generate applications from natural-language prompts. Their targets vary: Lovable and Bolt aim at non-technical users building frontends and demos, while Replit Agent aims at junior developers spinning up projects. All three have validated the appetite for building software without writing code, and the funding and usage behind them are real. What none of them produces, though, is real software. Lovable and Bolt cannot reliably deliver persistent data, real authentication, or a production-grade backend. Replit Agent comes closest to Remy in spirit, but its output is optimized for coding projects rather than for a business operator describing a workflow application. They are "vibe coding 1.0": proof that the appetite exists, not the answer to it.

### Low-code platforms (Airtable, Bubble, Retool)

These are visual app builders with templated primitives and drag-and-drop construction. Each has built a real business serving a real buyer: Airtable as a database-plus-spreadsheet for operations teams, Bubble as a no-code web app builder, Retool as a developer-oriented internal-tools platform. All three hit the same wall eventually. Application complexity outgrows the platform, outputs cannot be maintained outside the vendor's ecosystem, and the code under the hood is not owned by the buyer. Remy's compiled applications are real, owned code. Unlike low-code outputs, the buyer is not locked to the vendor and can maintain, extend, or migrate the software over time.

### Status-quo alternatives

The real competition for Remy today is not any of the named tools above. It is the status quo. Mid-market and SMB buyers with custom application needs are already spending money on something. Some buy overbuilt SaaS subscriptions and use a fraction of what they license. Others build Excel workarounds that are fragile, non-auditable, and hard to share across teams. A third path is to hire contractors or dev shops at $50K-$500K and three to six months per project, only to receive something that is frozen on the day of delivery. Remy competes directly with this spend and offers real software at a fraction of the cost and cycle time.

### Why Remy's positioning holds

Remy wins the buyer the other categories do not serve. Underneath Remy is its own platform substrate: 200+ AI models, 1,000+ integrations, managed database, authentication, and deployment. That substrate is what allows compiled applications to actually run in production. And the focus on the non-technical business operator is deliberate. Every other category in the space has been built for a different user, and serving Remy's buyer would require more than a cosmetic shift for any of them.

---

## Coding Agents and the Frontier Model Labs

Two adjacent categories look competitive at first read: the coding agents that serve professional engineers, and the frontier model labs that produce the underlying models. Neither overlaps with Remy's segment, and neither is positioned to enter it.

### Coding agents serve a different buyer

Coding agents are code-level assistants for professional engineers working inside existing codebases. They have raised significant capital and reached billion-dollar valuations because they make good developers faster. For Remy's ICP, though, they are the wrong tool entirely. A mid-market ops manager building a custom application from scratch is not a developer. These tools assume the user can read and write code, debug, operate inside a git repo, and configure production infrastructure. None of that is true for the buyer Remy targets.

The coexistence pattern is already visible in the same generation. Cursor and Windsurf coexist as direct competitors, both thriving. Lovable and Bolt coexist in the prototype-builder segment, both thriving. Devin and Replit Agent coexist as autonomous coding agents, both thriving. Each of these pairs sits in overlapping territory and serves different jobs, and none of them has collapsed the category onto a single winner. AI software creation is producing many winners simultaneously, and Remy is positioned to be one of them in a segment none of the visible players is built to serve.

### The frontier model labs are not building the application platform

Three structural reasons explain why the labs are not building the application-platform layer themselves.

**The labs have made a strategic decision to invest elsewhere.** Their public roadmaps are oriented to model research, coding tools for professional engineers, agentic infrastructure for developers, and enterprise APIs. The application platform for non-technical operators is not on those roadmaps. The labs are betting that the application layer will be built on top of them by other people (Remy among them), and that the value of being the underlying model in that layer is, on their math, larger than the value of trying to own every app vertical themselves. AWS made the same bet when it didn't try to build every SaaS company on its own infrastructure, and the bet has paid off.

**The commercial logic doesn't favor the labs entering this segment.** The labs make their highest-margin revenue selling tokens to enterprises, AI startups, and developer-tooling companies, including the companies building application platforms on top of them. An application platform for non-technical buyers cannibalizes those customer relationships, requires a sales motion to a buyer the labs don't currently address, and replaces high-margin direct-API revenue with lower-margin per-seat application pricing. Even an infinite-resourced lab has to choose which markets to enter, and the ones with worse margins, no existing distribution, and a buyer their team has never sold to are the ones they don't.

**Building a vertical product is a different kind of work from building a model.** The labs are extraordinarily good at training models, and the chat assistants they ship ride that strength: ask any of them a question, get a useful answer. A vertical application platform that produces custom internal software for non-technical operators is a different kind of business. It does not win on model quality. It wins on years of conversations with a specific customer base, on knowing which of their problems are deal-breakers and which are merely annoying, on a sales motion that fits how this buyer actually purchases software, on integrations into the specific tools each customer already uses, and on trust earned by being there for years when things break. None of those capabilities are produced by compute or research talent. Vertical product fit is more art than algorithm. It is judgment accumulated through years of customer time, and compute does not produce judgment.

### The category will have multiple winners

This is not a winner-take-all market. The shape of AI software creation today (coding agents in one segment, prototype builders in another, application platforms in a third, frontier labs underneath all of them) is the shape it will continue to have. Remy is positioned to be the winner for the buyer the labs are not built to serve, using technology they would have to leave their own roadmap to compete with, against a commercial logic that does not favor them entering this segment.

The longer-horizon version of this question matters too. At a long enough horizon, every category gets reshaped, and AI capability eventually becomes general enough to compress today's product distinctions. The deal underwrites against a different horizon: a three-to-five-year window in which Remy reaches commercial scale and returns capital, through revenue, exit, or both. The forces named in this section operate over that same multi-year horizon. None of them flip overnight.

---

## Moat

The moat question for Remy isn't "what stops a competitor from copying us." It's "what stops the foundation models from eating this entire category." That's the real risk, and it's the right place to start.

In twelve months, Claude and GPT will be better at one-shot app generation than any wrapper is today. Every tool in this space that's a thin layer over a frontier model is going to get compressed. Remy is built on a bet that the bottleneck for non-technical people building real software was never code generation. It was everything around the code — knowing what to build, knowing what good looks like, knowing how to make it work with the rest of the business, knowing how to keep it working when the model that wrote it is two generations out of date.

The frontier models will keep getting better at writing code, and that helps Remy, because Remy isn't in the code-writing business. Remy is in the business of turning a non-technical person's intent into a piece of software the enterprise can actually own.

The architecture reflects that bet in three places. Each one is something a competitor would have to rebuild from scratch to match.

### 1. The spec is the source of truth, not the code

In every other tool in this category — Lovable, Bolt, v0, Replit, and the rest — the prompt is throwaway and the code is the artifact. That's fine for a demo. It falls apart the moment an enterprise tries to govern it, because there's no document anyone can review, approve, or audit. You can't put a chat log in front of a compliance officer.

Remy's agent is built around a separate layer of structured spec files that the user and the agent edit together, and the code is generated and regenerated from that spec. When the model gets better next year, Remy re-compiles. When the customer wants to change something, they change the spec, not the code. The spec is also what makes Remy legible to an organization — a director can review what an employee is building before it ships, because the spec is a human-readable description, not 4,000 lines of TypeScript.

To match this, every competitor has to re-architect their agent loop and retrain their users. That's not a feature gap — it's a foundation gap.

### 2. The runtime

The apps Remy builds don't call OpenAI, Anthropic, Slack, and HubSpot directly the way a Lovable-generated app does. They call into Remy's runtime, which already has 120+ enterprise-grade actions wired up with managed credentials, rate limits, billing pass-through, audit logs, and SOC 2 controls. The runtime supports BYO models (any of 200+ supported providers) and on-premise deployment for customers whose procurement requires it. Every app a New York Times or HMRC employee builds is automatically governed from the moment it exists. The CIO sees every model call, every external API call, every dollar of spend, in one place. Competitors generate raw code that talks to a dozen vendors directly, and the enterprise has no visibility into any of it.

The runtime wasn't built for Remy. It matured over years underneath the predecessor product, and Remy is what happens when you put a great agent on top of a runtime that was already enterprise-grade. A new entrant cannot replicate this without spending several years building integrations and getting them certified.

### 3. Curated assets the model doesn't have

The agent's taste is backed by data assets the underlying model can't replicate from training alone. The design sub-agent ships with a curated font catalog, a pairing library, and a hand-analyzed inspiration set. The SDK consultant has a compiled, distilled knowledge base of Remy's platform. The product vision sub-agent maintains a persistent roadmap as a first-class artifact, not a chat history.

These are data assets, not prompts. They're the part that doesn't get cheaper when the foundation models get cheaper. As the underlying models commoditize and every wrapper produces roughly the same code, Remy's outputs stay differentiated because the inputs the agent draws on are ones built specifically for it.

### Governed software, not disposable software

Those three things together describe a different product than what everyone else in the category is selling. The vibe-coding tools sell disposable software — fast to make, impossible to govern, painful to maintain. Remy sells governed software that an enterprise can actually own and operate.

They look like the same category from the outside because both produce apps from English prompts. The enterprise buyer figures out the difference in their first procurement cycle, which is why Remy's platform substrate is already deployed at the **New York Times, ServiceNow, Advance Local, and HMRC**, and why none of those organizations chose a Lovable or a Bolt. Those tools were never in the conversation, because they can't pass the conversation.

The defensibility compounds because each layer protects the others. The spec layer is what makes the runtime composable — you can't generate runtime-aware code without a structured description of what the app is supposed to do. The runtime is what makes the spec layer worth having — a spec-to-code system that compiled to raw JavaScript calling random APIs would be no better than what's already out there. The sub-agents protect both, because they encode the taste and the platform knowledge specific to this stack, which a competitor would have to rebuild from scratch. None of these are unbeatable in isolation. Together, they describe a system, and systems are what take years to copy.

The short version: Remy isn't betting on being better at the part the foundation models are getting better at. It's betting on owning the parts they're not — the structured artifact the enterprise approves, the runtime the enterprise governs, and the curated knowledge that gives the agent taste the model doesn't have on its own. That bet only gets stronger as the models improve, because every improvement makes the code-writing part cheaper and the everything-around-the-code part more obviously the actual product.

---

## TAM-SAM-SOM Analysis

### TAM: $150B+

Global spending on business application development (custom dev, dev tools, and platforms) exceeds $180B annually, and the low-code and no-code market alone is projected at $187B by 2030. Beyond those figures is substantial shadow-IT spend absorbed by overbuilt SaaS subscriptions used as workarounds for applications that do not yet exist. The buyer base in the US alone sits at ~32M SMBs and ~200K mid-market companies (100-1,000 employees), which forms the ICP core Remy is built for.

### SAM: $15-25B

The serviceable addressable market narrows to US mid-market and SMB companies (10-1,000 employees) with at least one active workflow or data management problem a custom application would solve. Our estimate is that 2-3M US companies fit this profile today. Assuming workspace-based pricing of $100-500 per month, 1% penetration of this base produces **$240M-$1.5B in ARR**. The SAM expands materially if platform licensing to SaaS incumbents is included, since every incumbent that embeds Remy multiplies the addressable seat count without requiring direct SMB sales.

### SOM

SOM is scenario-based given Remy's pre-commercial pricing, and a specific trajectory will develop with post-funding commercial data. The shape of the opportunity is two parallel legs: a direct-to-SMB motion where sales and marketing convert the ICP, and platform-licensing deals where a single contract with a major SaaS incumbent pulls forward tens of thousands of end-customer seats. Both paths will be pursued in parallel, and neither needs to succeed in isolation for the SOM to be meaningful.

---

## Risks & Mitigation

### 1. Large AI incumbents building a competing platform

- **Risk:** The obvious question on any AI deal at this stage: what happens if Anthropic, OpenAI, or Google decides to build an AI-native application platform targeting the same segment? Their resources, distribution, and model access dwarf Remy's.
- **Mitigation:** Four structural factors make this risk less acute than it sounds.
  - **Remy isn't in the code-writing business.** The bigger version of this risk is "what stops the foundation models from eating this entire category?" — and the Moat section addresses it head-on. Remy is built on a bet that the bottleneck for non-technical people building real software was never code generation, but everything around the code: the structured artifact the enterprise approves, the runtime it governs, and the curated knowledge that gives the agent taste the model doesn't have on its own. Every improvement in frontier code generation makes the code-writing part cheaper and the everything-around-the-code part more obviously the actual product. The bet gets stronger as the models improve, not weaker. (See [Moat](#moat).)
  - **Remy's surface area is bigger than what the labs would plausibly absorb.** It's believable that Claude or ChatGPT extends into deployment tooling, code review, or test generation — those are code-adjacent and the labs already touch them. It's not believable that they natively ship social media post generation, A/B test design, marketing email sequences, customer support documentation, or production analytics. Remy is "builds, ships, *and runs* products" — see [What Remy does after the build](#what-remy-does-after-the-build) — and the everything-after-the-build is outside the product surface a model company is realistically going to claim. The broader Remy gets across the actual stack of running a modern business (ops, marketing, data, support, ongoing iteration), the weaker the foundation-models-eat-this argument becomes, not stronger.
  - **The market is not winner-take-all.** Shopify has coexisted with Amazon for over a decade, and Vercel has done the same with AWS. Focused products serving defined customer segments coexist with horizontal platforms indefinitely. "Incumbent builds it" is not the same as "incumbent wins it," and this is a market with room for a category leader serving a specific buyer alongside whatever the incumbents choose to ship.
  - **Model-agnostic routing is a feature buyers actively want.** Remy uses every major model (Claude, GPT, Gemini, and many more) and picks the right one per task. An incumbent-built platform would lock customers into a single vendor, which is the last thing a serious enterprise buyer wants when model performance is shifting month over month. Each time the frontier lead changes hands, Remy captures the improvement, while a single-vendor platform cannot.

### 2. Competitive noise and attention capture

- **Risk:** The AI software creation space is noisy and well-funded, with every startup in the category claiming a step change. Even with a genuinely superior product, Remy faces a real risk of getting lost in the attention market. The same dynamic applies to hiring, where top AI-native talent is aggressively recruited across the space and the noise raises the cost of standing out as an employer.
- **Mitigation:** Customer proof points cut through marketing noise in a way claims do not. Production institutional use of Remy is exactly that kind of proof point, and a ready-made case study for the broader enterprise vertical. The narrow ICP focus (mid-market and SMB business operators) is also a segment where what a product can actually produce matters more than what its marketing claims, and that is where Remy wins. On talent, the company has a substantive technical story rather than a promotional one, and that matters to the candidates worth hiring.

### 3. Commercial model and go-to-market are both unvalidated

- **Risk:** Remy is pre-commercial. Pricing, unit economics, and sales motion are not yet proven. Both the direct SMB motion and the platform-licensing B2B2C motion are in early conversations, and neither has been run at scale. A reader notes the absence of paying customers and flags it as a gap that needs to close fast.
- **Mitigation:** Three things to put alongside the risk before drawing conclusions.
  - **Timeline.** Remy entered open alpha in late April 2026. By the time most readers are looking at these notes, the product has been publicly available for roughly four to six weeks. The absence of paid customers is a function of *timeline and deliberate sequencing*, not absence of demand. The team focused on product depth during the alpha window; pricing, sales motion, and commercial validation are downstream of the Seed close, not concurrent with it. The traction numbers (hundreds of apps built, institutional customer building production tooling, organic LinkedIn testimonials) were produced in that same short window — that's the signal worth weighing, not the absence of a sales motion that hasn't been run yet.
  - **Resource constraints made this the right sequence.** The current team is two founders and a small support crew, operating off a pre-seed SAFE rolled in from the predecessor entity. Standing up a real commercial motion (head of sales, AEs, marketing leadership, paid acquisition) requires capital the alpha window doesn't carry. The Seed is the gate to running that motion at all — particularly against category competitors who are running $100M+ rounds with dozens of GTM hires already on payroll (Lovable, Bolt, Cursor, Claude Code, and others). Validating pricing and sales motion at scale before the Seed would have been operationally impossible at this team size; the alpha is generating the data that informs pricing post-Seed.
  - **Two parallel commercial paths post-Seed.** Direct SMB (Phase 1 self-serve adoption among technical PMs, Phase 2 mid-market AE-led) and platform-licensing into SaaS incumbents are both planned to run in parallel after the Seed close, not sequentially. The company doesn't need both to succeed to reach Series A; either path on its own produces enough commercial signal. See the Go-to-Market section for the specifics.

### 4. Execution risk scaling the team

- **Risk:** The current team is a lean crew. Scaling from founder-driven execution to a company with real GTM, engineering, and operational functions is a different discipline than building on a skeleton budget, and the current labor market for AI-native talent is competitive and expensive.
- **Mitigation:** The current round refreshes founder incentives, and Use of Proceeds explicitly allocates to GTM team buildout and engineering backfill. The founders ran lean and disciplined through the predecessor platform's evolution, and that operational posture is what should be preserved as Remy scales.

### 5. Predecessor product history

- **Risk:** Remy emerges from a predecessor product whose own commercial trajectory was different. A skeptical reader asks why this is different.
- **Mitigation:** The spinout is the structural answer. The predecessor's platform-engineering work — the model integrations, the databases, the authentication, the deployment layer — is what Remy compiles against today, and absorbing it was the point of the spinout. A tool like Remy can exist in this team's hands rather than requiring a new one built from scratch precisely because that platform substrate already exists. The new entity is clean, the cap table is fresh, and the founders are focused on Remy as their primary mandate. The spinout is the explicit acknowledgment that the company-form needed to change for Remy to scale.

### 6. ICP / "no-man's-land" audience concern

- **Risk:** A skeptical reader frames the ICP as caught in the middle — non-technical users want pure visual builders (Lovable, Bubble), professional engineers want code-first tools (Cursor, Claude Code), and Remy is neither. The implication: nobody actually wants a product-building agent that targets non-technical business operators who need real applications.
- **Mitigation:** The audience question rests on the assumption that the market splits cleanly into "people who want visual demos" and "people who want code editors." It doesn't. The 2x2 in the seed deck (technical-skills-required by power-of-applications-produced) explicitly stakes out the upper-left quadrant — non-technical users who need *production-grade* applications, not prototypes. That quadrant exists, it's populated by every operations / finance / HR / RevOps lead at a mid-market company who has a real workflow they can't solve with off-the-shelf SaaS, and it's not served by the named alternatives. The GTM section's Phase 1 (technical PMs as self-serve adopters who become org-level pull) and the institutional fund-management deployment in Traction are concrete evidence that the buyer exists. The "no-man's-land" framing tends to come from analysts who have only seen the developer-guide primitives (`defineTable<T>()`, MSFM, etc.) and concluded users hand-write them — see [README: Common misreadings](../README.md#common-misreadings) for that confusion. The buyer is the person who describes a workflow in conversation and receives a deployed production app at the end. That's the upper-left quadrant.

### 7. Platform / runtime lock-in concern

- **Risk:** A reader of the architecture documentation notes that Remy-built applications depend on Remy's runtime services (the platform API, the execution service, the platform-managed database, the backend SDK). The natural question for an enterprise buyer: is this proprietary-PaaS lock-in that limits long-term portability?
- **Mitigation:** Runtime infrastructure dependency is real, and it's the same shape as any managed cloud service. The honest breakdown:
  - **What's dependent on the platform:** Remy apps use the platform's runtime to execute. Each app's database is SQLite stored in platform-managed S3, accessed through the backend SDK (which routes operations via HTTP to the platform API). The execution runtime is platform-managed. Model and integration access flows through the same SDK. To run an app entirely elsewhere, the data-access layer would be rewritten and the data migrated. **This is the same shape of dependency as using DynamoDB on AWS, Firestore on GCP, or Supabase as a service** — and none of those are considered toxic lock-in by enterprise procurement.
  - **What's not dependent on the platform:** The application code is standard TypeScript in a standard Git repo, owned by the customer from day one. The database is SQLite, an open and portable file format — export is a download, and any SQLite client can read it. The interface code is standard. Model providers are user-configurable (200+ supported, BYO supported).
  - **What naming says and doesn't say:** Internal service names (`youai-api` and others) are the platform's runtime infrastructure, not lock-in markers in any meaningful sense. Every cloud has internal services named after the company; nobody calls Next.js proprietary because Vercel runs it.
  - **For enterprise customers whose procurement requires it,** the platform supports on-premise deployment.

### 8. Database architecture and per-tenant scaling

- **Risk:** A reader sees that Remy apps use SQLite stored on S3 as the default database and concludes this is a ceiling — that enterprise data volumes won't fit, complex transactions will be slow, or specific data-residency requirements won't be met. The pattern-matched conclusion: this is a 2015-era choice that limits the addressable market.
- **Mitigation:** Multiple parts, because the concern blends a real engineering question with an outdated mental model.
  - **The "SQLite is a toy" framing is from a different era.** Cloudflare runs D1 on SQLite. Fly.io runs LiteFS in production for distributed SQLite. Notion stores per-workspace data in SQLite. Tailscale's control plane runs on SQLite. The combination of per-tenant isolation, simple operations, strong consistency, and high single-node performance has made SQLite the default for an entire generation of multi-tenant platforms. The combination of per-tenant SQLite plus object-storage durability is now a recognized architectural pattern, not a curiosity.
  - **The operational reality isn't "S3 read per query."** Each app's database is loaded into memory during active use; S3 is the durability and sync layer, not the query path. Reads come from the in-memory working set; writes go to memory and persist to S3. The working set is hot during active use and goes cold on inactivity. This is the same shape as the patterns above.
  - **The architecture is horizontally scalable.** Each tenant gets its own SQLite file. More apps = more files, not one larger central database. Per-tenant isolation is automatic, backups are file-level, and data residency can be controlled per-bucket. This is a much cleaner story for the "thousands of small-to-mid-sized apps" shape that Remy actually produces than a shared central Postgres would be.
  - **There's an escape hatch for legitimately bigger needs.** For applications whose requirements exceed what the managed SQLite path is built for — very large data volumes, complex multi-table transactions across hundreds of GB, dedicated database tier, specific cloud-vendor residency mandates — nothing structural prevents a customer from connecting an external database. Remy-generated apps are standard TypeScript and can call any database client a Node.js app can call. The managed SQLite-on-S3 path is the off-the-shelf default that most apps need, not an architectural ceiling.
  - **For full data residency control,** on-premise deployment is supported (see [Moat](#moat) and Risk #7).

The downside on this opportunity is protected by structural paths to returns, each of which stands independently of the others.

### 1. Platform licensing is an independent commercial motion

Offering end-customers the ability to build custom applications on top of the platform is rapidly becoming table stakes across horizontal SaaS (CRM, ERP, HRIS, PM, data, and productivity). The incumbents face pressure from their own customers to provide that capability, and most do not have a credible internal answer. Remy together with its underlying platform substrate is the most credible AI-native application platform available today for an incumbent to embed. The resulting licensing revenue has the shape of enterprise contracts (longer, stickier, higher-dollar) and does not depend on winning the direct-SMB market. A handful of incumbent deals produces meaningful revenue on its own.

### 2. The strategic buyer universe is wide

Acquiring a working platform is different from building one. The incumbents unlikely to build an AI-native application platform from scratch (see Risk #1) are natural acquirers once one exists. The credible buyer field spans horizontal SaaS (each with a customer base that wants custom apps on their data), cloud providers like AWS, GCP, and Azure (with incentives to add application-layer capability, particularly through acquisition), and enterprise automation and workflow companies like UIPath and ServiceNow. A buyer universe that broad produces real pricing leverage in any sale process.

### 3. Entry pricing

> *[Private — entry pricing and valuation detail available on request]*

### 4. The asset has real value even without direct commercial breakout

Remy and the platform substrate it compiles against together represent a substantial engineering asset: 200+ AI models, 1,000+ integrations, managed databases, authentication, deployment, and multi-interface compilation, all in production use. A buyer could construct an acquisition thesis around any of those pieces (the integrations alone, the customer relationships, the engineering already completed, or the infrastructure itself) without requiring that Remy's direct GTM be the winning story. The opportunity does not depend on one commercial outcome.

---

## Strategic Context

The acquirer field for Remy is wide, and three categories of credible strategic buyer exist today. Horizontal SaaS platforms (Salesforce, HubSpot, Monday, Workday, Zendesk, and many others) each have customers asking to build custom applications on top of their data, and Remy is the direct answer. Cloud and developer platforms (AWS, Google Cloud, Microsoft Azure, Vercel, Supabase) each have reasons to expand into the application layer, most likely through acquisition. Enterprise automation and low-code incumbents (ServiceNow, UIPath, Appian, OutSystems) face a generation of AI-native competition their existing products are not built to answer.

Market dynamics favor consolidation in this space. Enterprise buyers consistently prefer fewer platforms over more. Strategic acquirers can cross-sell Remy into existing customer bases faster than the company could build that distribution alone, and B2B2C platform licensing plays naturally with acquirer distribution muscle.

---

## Go-to-Market

Three parallel motions, each addressing a different buyer.

**Phase 1: Self-serve, product-led adoption among technical PMs.**
- PMs sign up and convert without sales contact, ship internal tools inside their organizations, and generate org-level pull through what they produce.
- Lowest-cost acquisition channel and the fastest evidence generator for what Remy actually builds.
- Supporting team: a PM-relations and community lead embedded in technical-PM communities (Lenny's, Reforge, AI tooling Slacks, Discord communities for product practitioners), content marketing focused on real-build case studies rather than category claims, and customer success aligned to the moment a single PM's success becomes organization-level interest.

**Phase 2: Top-down enterprise sales into the operator base.**
- Mid-market AE-led motion, with sales engineers paired in on more complex workflows.
- ICP: operations, finance, HR, and revenue operations leaders at 100-1,000 employee companies.
- The predecessor platform's user base is a warm channel. Employees at TikTok, Microsoft, Adobe, Oracle, Intel, Meta, Booking.com, Novo Nordisk, and others have used the underlying substrate in production, and several of those organizations are exploring Remy at alpha. Account expansion inside those accounts is the first wave of Phase 2 revenue, well before any cold-call motion has to fire.

**Platform licensing into the SaaS incumbent layer.** A separate motion that runs in parallel with Phases 1 and 2, not after them.
- B2B2C deals with horizontal SaaS platforms (CRM, ERP, HRIS, PM, data) whose customers are asking for application-building capability they cannot deliver internally.
- Enterprise contracts: longer cycle, higher contract value, stickier.
- A small partnerships team works a named-incumbent list. Each closed deal pulls forward thousands or tens of thousands of end-customer seats and produces revenue that does not depend on the direct motion succeeding at the same pace.

**Brand and marketing as a strategic lever.** The AI software creation space is the noisiest, best-funded category in software right now. Lovable, Bolt, Replit, and others are running aggressive paid acquisition and producing viral demo content. Cursor, Claude Code, and the major labs dominate developer mindshare in adjacent categories. Even with a meaningfully better product, Remy's differentiation does not get heard by default. Standing out is part of the GTM motion. The category is too noisy for a wait-and-see approach to brand.

The right hire here is a senior brand and marketing leader who has built a category before. The work is positioning (what category Remy claims, and how it claims it), brand identity (the thing buyers see and remember before they ever talk to sales), and messaging discipline (the substance of what makes Remy genuinely different, translated into language the ICP repeats unprompted). Real customer proof points and the visible quality of what Remy produces are the foundation the brand stands on. Building the rest is the marketing leader's job. Tactical demand gen without strong positioning underneath is wasted spend in a category this noisy.

**Hiring sequence.**
- Two senior GTM leaders are the priority hires post-close, both signed within 30 days of funding close: a head of sales (VP Sales or CRO) and a head of brand and marketing (CMO or VP Marketing). Recruiting starts during the funding process so offers are in flight at close. Both build their respective orgs from there.
- First AEs and a sales engineer come on within 60 days of the head of sales starting, focused on warm-channel accounts inside the predecessor platform's user base.
- Brand, content, PR, and PM-relations staff into the first 90 days under the marketing leader.
- Partnerships lead comes on as soon as two or three named incumbent conversations have advanced enough to need dedicated execution capacity, targeted within the first 4 months post-close.

**Institutional reference customer as flagship.** The institutional fund-management deployment described in Traction is the GTM motion's most credible single proof point. Launched publicly as a case study, with direct outreach to VCs, family offices, fund administrators, and financial services firms, it opens a vertical the company is positioned to expand into.

---

## Near-Term Milestones

The company is moving at the pace the Remy opportunity demands.

### Capital

> *[Private — capital timing and round path available on request]*

### Product

- **Remy GA within 90-120 days of funding close.** Production GA with defined reliability targets and an enterprise-grade feature bar.
- **Enterprise-grade primitives on the same timeline.** SSO, audit logging, role hierarchies, data residency.

### Commercial

- **First paying enterprise customers within six months of funding close.** Signed and deployed across the target ICP.
- **Institutional reference customer launched publicly as a case study.** Direct outreach to VCs, family offices, and financial services firms.

### Team

- **GTM leadership hired in parallel with funding close.** Sales, marketing, customer success.
- **Engineering scale-up on the same timeline.** Platform reliability, enterprise features.
- **Executive additions as the commercial motion requires.** CRO, CPO, or equivalents as needed.

### The bigger frame

The product works. The team knows how to execute. The infrastructure is real. The path from here is measured in commercial validation cycles, not capability ones.

---

## Financial Model

Bones:

- Revenue model: per-workspace subscription (see SAM math in TAM-SAM-SOM) plus platform-licensing into SaaS incumbents (see Go-to-Market).
- Baseline: pre-revenue. Alpha usage is generating the data that will inform pricing.
- Forward projections: not modeled in this document.

> *[Private — specific projections and assumptions available]*

---

## Comparables

Positioning note:

- **Peer group is internal tools and application platforms, not AI coding tools.** Remy's ICP is a non-technical business operator (see Product Overview and Competitive Landscape). Cursor, Windsurf, and Cognition as comps would misframe the opportunity.

Anchors worth looking at:

- Public: ServiceNow, Monday.com, Asana, UIPath, Atlassian, Workday. Vercel and Supabase for developer-platform infrastructure markers.
- Private: Retool, Airtable, Bubble, Zapier, n8n.
- 2026 AI-era Seed valuation context: *[Private — specific valuation anchors available on request]*

---

## Sensitivity Analysis

Bones:

- Time-to-commercial-validation post-Seed (biggest unknown given pre-commercial pricing).
- Platform-licensing revenue timing (could pull forward year-one revenue materially; also the variable most subject to deal-cycle delay).
- GTM motion weighting between direct SMB and platform-licensing (affects ARR trajectory, sales-team requirements, ownership at Series A).

> *[Private — specific scenarios and quantitative ranges available]*

---

## Exit Analysis

Bones:

- Wide acquirer field (see Strategic Context and Downside Protection): horizontal SaaS, cloud and developer platforms, enterprise automation and low-code incumbents.
- Platform licensing as the floor case — produces enterprise-quality ARR attractive to strategic acquirers.
- The asset includes Remy plus the underlying platform substrate, valued in any acquisition independent of direct-GTM outcome.

> *[Private — return modeling and scenarios available]*
