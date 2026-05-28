# Market & Competition

Market landscape, competitive landscape, the case for why frontier model labs aren't entering this segment, and TAM-SAM-SOM.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

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

## TAM-SAM-SOM Analysis

### TAM: $150B+

Global spending on business application development (custom dev, dev tools, and platforms) exceeds $180B annually, and the low-code and no-code market alone is projected at $187B by 2030. Beyond those figures is substantial shadow-IT spend absorbed by overbuilt SaaS subscriptions used as workarounds for applications that do not yet exist. The buyer base in the US alone sits at ~32M SMBs and ~200K mid-market companies (100-1,000 employees), which forms the ICP core Remy is built for.

### SAM: $15-25B

The serviceable addressable market narrows to US mid-market and SMB companies (10-1,000 employees) with at least one active workflow or data management problem a custom application would solve. Our estimate is that 2-3M US companies fit this profile today. Assuming workspace-based pricing of $100-500 per month, 1% penetration of this base produces **$240M-$1.5B in ARR**. The SAM expands materially if platform licensing to SaaS incumbents is included, since every incumbent that embeds Remy multiplies the addressable seat count without requiring direct SMB sales.

### SOM

SOM is scenario-based, and the relevant story is the wedge vs. destination distinction across the buyer segment.

**Near-term reachable (12-24 months): the technical-PM and semi-technical-operator segment.** ~500K-1M US technical PMs and operators, addressable via PLG self-serve, no sales motion required to convert the first wave. At $50-150/seat/month and 5% penetration into this segment, the near-term SOM lands in the **$50-200M ARR range**. This is the wedge — venture-scale on its own.

**Long-term reachable (24-60 months): the broader non-technical operator base** where the full $15-25B SAM lives. Reached through (a) org-level expansion from technical-PM beachheads and (b) UX maturity that lowers the entry barrier for the operator who doesn't currently think of themselves as technical. SOM into this base is sales-motion-dependent and develops with post-Seed commercial data.

The primary acquisition motion is direct PLG into technical PMs (above). Platform-licensing deals into SaaS incumbents run alongside as an upside amplifier — each closed deal pulls forward thousands or tens of thousands of end-customer seats inside the incumbent's user base, compounding the primary motion materially when one lands. See [Strategy → What wins](./07_strategy-and-gtm.md#what-wins-the-conviction) for the conviction framing.
