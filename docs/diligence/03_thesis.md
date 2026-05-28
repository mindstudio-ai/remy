# Investment Thesis

Five sub-theses, each independent. Read in order or jump to whichever is most relevant.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

---

## 1. Thesis: Remy addresses the largest underserved segment in AI software creation

- **The AI software creation market has bifurcated, and neither end serves most commercial demand.** On one end are prototype generators like Lovable and Bolt, which produce frontends and demos from natural-language prompts. These tools have attracted billions in funding and millions of users, and have proven there is real appetite for building software without writing code. What they have not produced is real applications with persistent data, real authentication, production-grade backends, and maintainable code. On the other end are engineering-focused coding agents like Claude Code, Codex, and Google's Antigravity. These tools accelerate existing developers working inside existing codebases, and are genuinely powerful for that use case. They are also inaccessible to anyone who doesn't already write code or understand infrastructure.

- **The commercial demand for AI-built software sits between those two segments.** The eventual destination market is in the hands of non-technical business operators who need real applications: ops managers who need a custom inventory tracker, finance teams who need an internal approval workflow, HR teams who need a proper onboarding portal. They know what the software needs to do. They do not write code and do not have engineering resources to build what they need. Today, that demand is spent on overbuilt SaaS subscriptions that in reality they only use a fraction of, on spreadsheet workarounds that are fragile and non-auditable, or on one-off contractor and dev-shop builds that cost $50K to $500K and arrive frozen on delivery. Every one of those dollars is addressable, and Remy is the only serious player built directly for this buyer.

- **The most accessible entry point into this market is the semi-technical end of the spectrum.** Technical PMs and operators who are comfortable iterating on a structured artifact and reading communities like Lenny's, Hacker News, and AI tooling Discords are the alpha's converting segment today. The path to the broader non-technical operator base runs through them: orgs adopt via a technical-PM champion, the UX matures, the population of reachable users widens. The thesis doesn't require the non-technical operator to be the day-one buyer; it requires a path to them, and the technical-PM wedge is that path. (Risk #6 in the Risks doc lays out the wedge → expansion arc in full.)

- **The downstream consequence, if we are right, is large.** When every mid-market company can produce custom internal applications in days for ~$1-10K that previously took months and millions, the logic of paying for overbuilt SaaS to fill gaps collapses. Hundreds of billions in business software spend will begin to restructure around owned, custom applications. Remy is an early, serious entry in the category created by that restructuring.

## 2. Thesis: Remy is a step change in what an AI platform can produce

- **Remy produces polished, production-grade software.** Applications built with Remy are full products in daily use today. They hold real data, integrate with real services, and serve real people. First-time viewers routinely do not believe an AI tool built them. The gap between "AI prototype" and "real product" is where most of the category still lives, and Remy is on the other side of it.

- **Using Remy feels closer to working with a senior creative lead than prompting a tool.** A user describes what they want, often by voice. Remy asks the clarifying questions a good product partner would ask, proposes design directions, iterates visibly, and verifies its own work before handing it back. The interaction is a conversation, not a query.

- **A sophisticated institutional customer is actively building serious software on Remy.** A team at an institutional investor has used Remy during alpha to build a full fund-management application set to run their fund operations. The application was built *by the customer* using Remy as a product — not by the Remy team for the customer — without an engineering team on the customer side. It's one of many serious alpha-stage builds (hundreds visible in [Debut](https://debut.msagent.ai)); a real institutional deployment on a pre-GA platform is unusual and worth pointing at specifically as a depth signal.

- **Two founders produced Remy's current state directly.** Dmitry and Sean built the agent on top of platform infrastructure they had previously built and that is now consolidated into Remy, without a large engineering team. The ratio of product capability to headcount tells us about both the leverage Remy gives its users and the capital efficiency of the team behind it.

## 3. Thesis: Remy's durable competitive advantage is the platform underneath the agent, not the agent itself

- **The scope underneath Remy is a platform, not a product.** Remy's underlying platform integrates 200+ AI models and exposes 1,000+ external services on day one (Google Workspace, Slack, HubSpot, and many more). It includes managed databases, role-based authentication, deployment infrastructure, and sandboxed execution. All of it runs in production today, with real customer workloads on it. This is what Remy compiles to when a user describes an application.

- **AI models are commoditizing; the durable advantage is what sits underneath.** Every serious player in the space has access to the same Claude, GPT, and Gemini, and that's the part getting cheaper every quarter. The difference between a tool that produces a demo and a tool that produces a business application is not the underlying model. It is the infrastructure underneath the agent: the integrations, the data layer, the authentication, the deployment path. A new entrant with full access to every frontier model still has to build all of that from scratch.

- **The artifact is the spec, not the code.** Remy's agent works against a layer of structured spec files that the user and the agent edit together; the code is generated (and regenerated) from that spec. When the model gets better next year, Remy re-compiles. When the customer wants to change something, they change the spec. The spec is also what makes Remy legible to an organization — a director can review what an employee is building before it ships, because the spec is human-readable rather than thousands of lines of TypeScript. Other tools in the category treat the prompt as throwaway and the code as the artifact, which is fine for a demo but unworkable for enterprise governance. See [Moat](./05_moat.md) for the full argument.

- **Real business software only works when it connects to the other tools a business runs on.** An HR portal is limited without payroll integration. A finance workflow is incomplete without Stripe or NetSuite. A sales extension breaks if it cannot read Salesforce. Remy's platform already has these integrations built in, so compiled applications ship connected from day one. That is the difference between AI-generated software that can actually run a business and AI-generated software that stops at the demo.

- **This is built, not on a roadmap.** The platform substrate Remy compiles against has been in production use for years, including by employees at major enterprises. Competitors in the AI software creation space are quoting similar feature lists as goals; Remy's platform already has them in production.

## 4. Thesis: A structurally wide exit field

- **Every horizontal SaaS needs a Remy for its customer base.** Offering end-customers the ability to build custom applications on top of the platform is rapidly becoming table stakes across CRM, ERP, HRIS, PM, and data platforms. The incumbents face growing pressure from their own customers to provide that capability, and most of them do not have a credible internal answer.

- **Remy's platform is the most credible substrate for those incumbents to embed.** No other AI-native application platform is production-grade, enterprise-ready, and operational today. B2B2C licensing into the incumbent SaaS ecosystem is a durable, independent revenue leg that is structurally attractive to strategic acquirers.

- **A wide acquirer universe supports price competition in any exit process.** The credible buyers span horizontal SaaS (Salesforce, HubSpot, Monday, ServiceNow, Workday), cloud and developer platform incumbents (AWS, Google Cloud, Microsoft Azure, Vercel, Supabase), and enterprise automation and low-code adjacencies (UIPath, Appian, OutSystems). Each has a different strategic reason to own Remy, which translates into real pricing leverage in any sale process.

- **The exit landscape compounds the primary thesis.** Remy and its underlying platform are one system: the platform is what makes the agent possible, and the agent is how the platform reaches users. A buyer field this wide — alongside a winning direct motion — produces real pricing leverage in any eventual sale process. The exit optionality is on top of the central bet, not a substitute for it. See [Strategy → What wins](./07_strategy-and-gtm.md#what-wins-the-conviction) for the primary motion the team is convicted on.

## 5. Thesis: A known-quantity founding team

- **Dmitry and Sean are long-tenured, prudent operators.** They have years of platform-engineering execution behind them — work that has now consolidated into Remy through the spinout.

- **They have shipped software at real scale.** The founders' prior ventures include products used by tens of millions of people. Whatever the commercial arc of any one of those products, the ability of this team to build software that reaches meaningful scale is a proven capability, not a speculative one.

- **Capital stewarded with restraint.** The team ran lean and focused through the predecessor platform's evolution, rather than burning capital to maintain headcount or appearances. That discipline is a significant part of why Remy exists at all.

- **Appetite for genuinely big ideas.** Each product direction the team has pursued has aimed at a meaningful category shift, not an incremental improvement on an existing playbook. Remy is the deepest technical expression of that instinct yet, and the one most likely to land.
