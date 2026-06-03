# Risks & Downside Protection

The honest-look-at-what-could-go-wrong section, paired with the structural-paths-to-returns section that mitigates downside scenarios.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

---

## Risks & Mitigation

### 1. Large AI incumbents building a competing platform

- **Risk:** The obvious question on any AI deal at this stage: what happens if Anthropic, OpenAI, or Google decides to build an AI-native application platform targeting the same segment? Their resources, distribution, and model access dwarf Remy's.
- **Mitigation:** Four structural factors make this risk less acute than it sounds.
  - **Remy isn't in the code-writing business.** The bigger version of this risk is "what stops the foundation models from eating this entire category?" — and the Moat section addresses it head-on. Remy is built on a bet that the bottleneck for non-technical people building real software was never code generation, but everything around the code: the structured artifact the enterprise approves, the runtime it governs, and the curated knowledge that gives the agent taste the model doesn't have on its own. Every improvement in frontier code generation makes the code-writing part cheaper and the everything-around-the-code part more obviously the actual product. The bet gets stronger as the models improve, not weaker. (See [Moat](./05_moat.md).)
  - **Remy's surface area is bigger than what the labs would plausibly absorb.** It's believable that Claude or ChatGPT extends into deployment tooling, code review, or test generation — those are code-adjacent and the labs already touch them. It's not believable that they natively ship social media post generation, A/B test design, marketing email sequences, customer support documentation, or production analytics. Remy is "builds, ships, *and runs* products" — see [What Remy does after the build](./02_product-and-traction.md#what-remy-does-after-the-build) — and the everything-after-the-build is outside the product surface a model company is realistically going to claim. The broader Remy gets across the actual stack of running a modern business (ops, marketing, data, support, ongoing iteration), the weaker the foundation-models-eat-this argument becomes, not stronger.
  - **The market is not winner-take-all.** Shopify has coexisted with Amazon for over a decade, and Vercel has done the same with AWS. Focused products serving defined customer segments coexist with horizontal platforms indefinitely. "Incumbent builds it" is not the same as "incumbent wins it," and this is a market with room for a category leader serving a specific buyer alongside whatever the incumbents choose to ship.
  - **Model-agnostic routing is a feature buyers actively want.** Remy uses every major model (Claude, GPT, Gemini, and many more) and picks the right one per task. An incumbent-built platform would lock customers into a single vendor, which is the last thing a serious enterprise buyer wants when model performance is shifting month over month. Each time the frontier lead changes hands, Remy captures the improvement, while a single-vendor platform cannot.

### 2. Competitive noise and attention capture

- **Risk:** The AI software creation space is noisy and well-funded, with every startup in the category claiming a step change. Even with a genuinely superior product, Remy faces a real risk of getting lost in the attention market. The same dynamic applies to hiring, where top AI-native talent is aggressively recruited across the space and the noise raises the cost of standing out as an employer.
- **Mitigation:** Customer proof points cut through marketing noise in a way claims do not. Production institutional use of Remy is exactly that kind of proof point, and a ready-made case study for the broader enterprise vertical. The narrow ICP focus (mid-market and SMB business operators) is also a segment where what a product can actually produce matters more than what its marketing claims, and that is where Remy wins. On talent, the company has a substantive technical story rather than a promotional one, and that matters to the candidates worth hiring.

### 3. Commercial model and go-to-market are both unvalidated

- **Risk:** Remy is pre-commercial. Pricing, unit economics, and sales motion are not yet proven. Both the direct SMB motion and the platform-licensing B2B2C motion are in early conversations, and neither has been run at scale. A reader notes the absence of paying customers and flags it as a gap that needs to close fast.
- **Mitigation:** Three things to put alongside the risk before drawing conclusions.
  - **Timeline.** Remy entered open alpha in late April 2026. By the time most readers are looking at these notes, the product has been publicly available for roughly four to six weeks. The absence of paid customers is a function of *timeline and deliberate sequencing*, not absence of demand. The team focused on product depth during the alpha window; pricing, sales motion, and commercial validation are downstream of the Seed close, not concurrent with it. The traction numbers (hundreds of apps built, institutional customer building production tooling, organic LinkedIn testimonials) were produced in that same short window — that's the signal worth weighing, not the absence of a sales motion that hasn't been run yet.
  - **Resource constraints made this the right sequence.** The current team is two founders and a small support crew, operating off the pre-seed SAFE that prior GoMeta investors rolled forward at spinout. Standing up a real commercial motion (head of sales, AEs, marketing leadership, paid acquisition) requires capital the alpha window doesn't carry. The Seed is the gate to running that motion at all — particularly against category competitors who are running $100M+ rounds with dozens of GTM hires already on payroll (Lovable, Bolt, Cursor, Claude Code, and others). Validating pricing and sales motion at scale before the Seed would have been operationally impossible at this team size; the alpha is generating the data that informs pricing post-Seed.
  - **The primary motion is sharp.** Phase 1 self-serve PLG into technical PMs converts the immediately-reachable segment; Phase 2 AE-led expansion brings org-level revenue once a PM beachhead is established. Platform licensing into SaaS incumbents runs alongside as an upside amplifier — compounding the primary motion by pulling forward thousands of seats per deal when one lands. The team is convicted on the primary motion as the path that wins; licensing and strategic exit optionality are amplifiers, not hedges. See [Go-to-Market](./07_strategy-and-gtm.md) for the specifics.

### 4. Execution risk scaling the team

- **Risk:** The current team is a lean crew. Scaling from founder-driven execution to a company with real GTM, engineering, and operational functions is a different discipline than building on a skeleton budget, and the current labor market for AI-native talent is competitive and expensive.
- **Mitigation:** The current round refreshes founder incentives, and Use of Proceeds explicitly allocates to GTM team buildout and engineering backfill. The founders ran lean through the MindStudio period — operating without raising additional capital across roughly two years — and that operational posture is what should be preserved as Remy scales.

### 5. Predecessor history

- **Risk:** GoMeta has been operating since 2018. Its prior chapters produced a venture-backed product (Koji) that was acquired in December 2023 on terms that did not return capital to investors, and a successor product (MindStudio) that found customers and revenue but did not scale to venture proportions. The natural diligence question is the right one to ask directly: why is Remy different, and why is this team raising again now?

- **What we have to own:**

  - **Koji didn't return capital.** GoMeta raised ~$10M Series A in 2020 and a $20M Series B led by Jump Capital in January 2022. The link-in-bio category consolidated under Linktree; Koji was acquired by Linktree in December 2023 on terms that did not return capital to GoMeta's investors. Linktree sunset the consumer product on January 31, 2024; significant portions of the underlying technology remain in active use inside Linktree today.
  - **MindStudio didn't scale to venture proportions.** Built on GoMeta's remaining cash starting in 2024, without raising additional capital. Real customers — including The New York Times, ServiceNow, His Majesty's Revenue & Customs, and Advance Local — and real revenue. But the drag-and-drop AI workflow-builder form (the same category as n8n, Zapier, Make) was being structurally compressed by the same frontier-model maturation that's now creating the Remy opportunity. When an agent can read user intent in plain language and write code that does what a visual workflow would have done — faster, more flexibly, without requiring the user to learn to use and maintain a tool — the visual builder is a worse abstraction. MindStudio is being sunset.
  - **It's been roughly four years between Koji's Series B (January 2022) and Remy's Seed (now).** Prior investors have held paper across two product cycles without a return event.

  None of this is hidden by the corporate structure or the new entity. It's how we'd describe the history if asked directly.

- **Why we're excited about Remy:**

  - **The MindStudio period produced the substrate Remy compiles against, and the form Remy takes.** From the Koji acquisition through to Remy's alpha, GoMeta operated on remaining cash without raising additional capital — roughly two years building the platform substrate that Remy now sits on top of (200+ models, 1,000+ integrations, sandbox execution, managed databases, auth, deployment, SOC 2 Type 1/2, GDPR), and figuring out what the agent-generation form of the product should be. That substrate took years to build and harden; competitors starting from a clean sheet today would need years to replicate it. Remy is what came out of that work.
  - **Remy is the bet.** The alpha (see [Traction](./02_product-and-traction.md#traction)) is the early data — hundreds of apps built by real users in weeks, an institutional customer building production tooling, organic operator testimonials. Remy is the first product where the answer to "is this venture-scale" is clearly yes to us, and that's why we're raising now.
  - **The pre-seed SAFE rolling forward from prior investors is a reference check.** GoMeta's existing investors watched both the Koji landing and the MindStudio period play out from inside the cap table. Their decision to roll into Wooster Labs at spinout, on Remy-specific terms, is the closest thing to an independent endorsement of the new opportunity.

- **The bottom line:** the question isn't "is the team good at building things" — they've built things, including a $36M-raised consumer product with 700k creators and an enterprise platform substrate hardened through years of real production traffic. The question is "is *Remy* the venture-scale opportunity this team has been waiting to put outside capital behind." We think the answer is yes, and we'd rather make that case on the actual product than on the corporate story.

### 6. ICP coherence — early adopter vs. destination market

- **Risk:** A careful reader notices a tension across the materials. The positioning ([`messaging.md`](../brand-positioning/messaging.md): "a new way to program," spec-driven development, "not no-code") and the observed early adopters (every LinkedIn testimonial in the deck is from a product manager — Gamble, Poonawala, Beebe, Interlandi — and GTM Phase 1 explicitly targets technical PMs) point at a semi-technical buyer. But other parts of the diligence framing position the ICP as the non-technical operator at a mid-market or SMB company. These are different people. The skeptical reader concludes: the "non-technical operator" framing is investor-narrative, the actual buyer is the technical PM, and the real reachable market is smaller than the $15-25B SAM implies.
- **Mitigation:** The skeptic is partially right, and the materials should be honest about this. The accurate framing isn't one buyer — it's a wedge → expansion arc with two distinct segments at different stages.
  - **The early adopter, today: technical PMs and semi-technical operators.** This is the segment showing up in the alpha. A real market in its own right — hundreds of thousands of US technical PMs and ops engineers — converting via PLG (self-serve, no sales contact). The deck's testimonials are independent evidence that this segment finds Remy compelling. GTM Phase 1 is built around them, deliberately, because they're the easiest-to-acquire wedge into a much larger market.
  - **The destination, as the product matures: the broader operator base.** Operations leads, finance managers, HR leaders, RevOps owners — people who don't currently think of themselves as "technical." Two motions get Remy to them: (a) the technical PM at their company builds something they want to use or fork, and (b) the conversational UX matures to where the cognitive load of a spec is hidden behind the natural-language interaction. This is where the $15-25B SAM lives. It's the destination, not the current claim.
  - **The arc compounds: wedge first, destination market as the product matures.** The technical-PM segment converts on a faster timeline and is the alpha's evident traction. The broader operator base is the expansion that turns a venture outcome into a category outcome — the deliberate destination, not a hedge against the wedge not landing. The thesis names both because both are real and both are being built toward.
  - **The wedge → expansion shape is how categories like this actually get built.** Figma started with senior product designers (a relatively small population) and expanded to "everyone in the design conversation." Notion started with technical hobbyists and expanded to the broader knowledge-work market. Linear started with engineering teams and expanded to product. The technical-PM beachhead isn't a fallback ICP that emerged from product limitations — it's the deliberate entry point, and the materials should describe it that way.

### 7. Platform / runtime lock-in concern

- **Risk:** A reader of the architecture documentation notes that Remy-built applications depend on Remy's runtime services (the platform API, the execution service, the platform-managed database, the backend SDK). The natural question for an enterprise buyer: is this proprietary-PaaS lock-in that limits long-term portability?
- **Mitigation:** Runtime infrastructure dependency is real, and it's the same shape as any managed cloud service. The honest breakdown:
  - **What's dependent on the platform:** Remy apps use the platform's runtime to execute. Each app's database is platform-managed SQL, accessed through the backend SDK (which routes operations via HTTP to the platform API). The execution runtime is platform-managed. Model and integration access flows through the same SDK. To run an app entirely elsewhere, the data-access layer would be rewritten and the data migrated. **This is the same shape of dependency as using DynamoDB on AWS, Firestore on GCP, or Supabase as a service** — and none of those are considered toxic lock-in by enterprise procurement.
  - **What's not dependent on the platform:** The application code is standard TypeScript in a standard Git repo, owned by the customer from day one. The database is SQLite, an open and portable file format — export is a download, and any SQLite client can read it. The interface code is standard. Model providers are user-configurable (200+ supported, BYO supported).
  - **What naming says and doesn't say:** Internal service names (`youai-api` and others) are the platform's runtime infrastructure, not lock-in markers in any meaningful sense. Every cloud has internal services named after the company; nobody calls Next.js proprietary because Vercel runs it.
  - **For enterprise customers whose procurement requires it,** the platform supports on-premise deployment.

### 8. Data architecture for per-tenant workloads

- **Risk:** A technically-minded reader looking at Remy's per-tenant database model flags it for closer review. Will enterprise data volumes scale? Will complex transactions perform? Will data-residency requirements be addressable?
- **Mitigation:** Each app gets its own SQL database, hot in memory during active use, durably persisted to object storage. This is the same pattern Cloudflare D1, Fly.io LiteFS, Notion, and Tailscale run in production at scale, and a substantial ecosystem has invested in production-hardening it. The engine handles ACID transactions, indexes, query planning, full-text search, JSON, and the rest of what's expected of a modern RDBMS — comfortably per-tenant at volumes well above what most business applications produce. For workloads that exceed the managed path, customers can connect any external database directly (Remy apps are standard TypeScript and can call any database client). For data-residency requirements, on-premise deployment is supported (see [Moat](./05_moat.md) and Risk #7). MindStudio's enterprise deployments validated this architecture in production at scale before Remy.

---

## Range of outcomes

The conviction case lives in [Strategy → What wins](./07_strategy-and-gtm.md#what-wins-the-conviction): Remy wins as the dominant product agent for the business-software market, via PLG into the technical-PM wedge and org expansion into the broader operator base. That's the central bet.

Two things make the range of outcomes on that bet asymmetric on the upside — not because they're parallel paths competing with the central thesis, but because they compound it when they land.

### 1. Platform licensing as an upside amplifier

Offering end-customers the ability to build custom applications on top of the platform is rapidly becoming table stakes across horizontal SaaS (CRM, ERP, HRIS, PM, data, and productivity). The incumbents face pressure from their own customers to provide that capability, and most do not have a credible internal answer. Remy together with its underlying platform substrate is the most credible AI-native application platform available today for an incumbent to embed. When a licensing deal lands, it pulls forward thousands or tens of thousands of seats inside a SaaS incumbent the direct motion would have reached one company at a time — accelerating the primary thesis by orders of magnitude. The resulting contracts have enterprise shape (longer, stickier, higher-dollar). The team treats this as upside layered on the central motion, not as a hedge against the central motion stalling.

### 2. Strategic exit optionality

Acquiring a working platform is different from building one. The credible buyer field spans horizontal SaaS (each with a customer base that wants custom apps on their data), cloud providers like AWS, GCP, and Azure (with incentives to add application-layer capability, particularly through acquisition), and enterprise automation and workflow companies like UIPath and ServiceNow. That breadth produces real pricing leverage in any eventual sale process — exit optionality on the way to a category outcome, not a substitute for one.

### 3. Entry pricing

> *[Private — entry pricing and valuation detail available on request]*
