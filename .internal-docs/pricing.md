# Remy Pricing — Alpha → GA

Working notes on Remy's pricing model. Captures the decisions, the reasoning behind them, the things we explicitly chose *not* to do, and the open implementation questions still to resolve. Written for the team to come back to when memory fades on why something is the way it is.

Last meaningful update: June 2026.

---

## The model, in one paragraph

Remy is one product at one price: **$99/month**, or **$79/month with annual billing** (save $237/year — equivalent to two months free). Before paying, users get a **7-day free trial**. Inference is **pass-through at provider rates**, always — no markup, no credit games. Users fund an inference balance up front (suggested minimum: ~$100 to get going on a real build) and that balance is theirs forever, debited as they use Remy. No tiers. No per-seat. No team plan. No enterprise tier card on the page — just a "for organizations, get in touch" footer link. The entry point is Remy-only, structurally separated from the existing MindStudio surface.

---

## What's included

- Full Remy: all six specialist sub-agents, frontier models throughout (no degraded model bait-and-switch).
- **Unlimited projects, unlimited deploys.** No slot count, no per-app pricing — project count isn't what costs us money.
- Custom domains for deployed apps.
- "Remove Remy branding" from deployed apps.
- Priority human support.
- Generous hosting for any realistic alpha-customer scale — effectively absorbed. The vast majority of apps cost pennies to run, even with thousands of users, and there's no need to introduce a hosting line item until something hits actual scale.
- Inference always pass-through at provider rates — **no markup, ever.** Two ways to pay: (1) auto pass-through billing (top up a balance, we handle billing the providers and debiting your balance at provider rate) or (2) bring your own provider API keys (Anthropic, OpenAI, Google, etc.) for direct billing. Real-time per-conversation cost display. No expiring credits, no opaque conversion. As models get better and cheaper, you benefit directly.

## Annual billing

**Monthly: $99/month. Annual: $79/month, billed annually ($950.40/year — 20% off, equivalent to two months free).** Same product, same features either way.

### Why offer annual

- **Cash flow:** $950 up front beats $99 dribbling in monthly across the year.
- **Lower churn by default:** annual subs stay through the term.
- **Better ARR mechanics:** annual contracts convert cleanly to ARR for fundraising.
- **20% aligns with the Cursor anchor.** "Two months free" is the stronger marketing framing for the same magnitude — buyers comparison-shopping will see the same discount they expect.

### Mid-term price changes

Bog-standard SaaS. Monthly subscriptions renew at whatever the prevailing price is at the next renewal. Annual subscriptions are locked at their signup price for the full 12-month term — any future pricing changes affect them only at renewal. This protection is part of the value of choosing annual.

### Refund policy

The 7-day trial is the evaluation window. After conversion, no refunds — same as standard SaaS practice. The trial is generous enough that anyone signing annual has had a real product experience before committing.

### No promotional annual rates

The annual price is the annual price. No Black Friday 50% off, no "early bird" stunts, no discount-stacking. Inconsistent with the rest of the brand voice ("we don't dress up prices").

## What "tier" is it called?

It isn't. The product is "Remy" and the price is "$99/month (or $79/month annual)." No "Pro" / "Builder" / "Pro+." Naming the tier would imply there are others, and there aren't. The pricing page reads: *Try Remy free for 7 days. Remy is $99/month after that.* That's the whole frame.

---

## Why these specific decisions

### How we frame Remy in the market (load-bearing)

The single most important framing decision: **Remy is an AI agent.** Not a platform. Not a builder. An AI agent that builds, ships, and runs products.

This matters because users don't have a clean mental model for "AI app builder + production platform + observability stack + integration layer." They do have a clean mental model for "AI agent" — and crucially, that mental model isn't "LLM API in a tool-use loop." It's *"magic tool that does stuff."* That's the user-side definition of "agent" and Remy plays inside it.

What flows from that framing:

- **Remy is "the agent."** All the capability — building code, deploying it, hosting it, running the database, managing auth, monitoring production, fixing bugs, shipping marketing, running A/B tests — is *the agent doing the work*. Not "platform features the agent uses." The agent.
- **The competitive framing is other AI agents, not Vercel-plus-Supabase.** When users (or investors) compare Remy to something, they compare to Lovable, Bolt, Cursor, Claude Code. Those are all also AI agents — but each only does part of the job. Lovable writes a frontend. Bolt writes a frontend with a small backend. Cursor edits your existing code. Claude Code accelerates engineers. Remy does the whole thing. **Remy is the most capable agent in its category, and that's the headline competitive claim.**
- **The pricing-page narrative is "look at everything this agent handles."** Not "look at the platform breadth you're getting." Same content, different mental model — but the framing matters because it stays in-category instead of inviting a "wait, is this a platform play?" sidetrack.
- **The agent-is-open-source claim is a credibility signal, not a "the value is somewhere else" signal.** The code is open because we're confident in what we built. But "the agent" isn't just code — it's also the 200+ integrated models, the 1,000+ pre-authenticated integrations, the production runtime, the curated design assets, the years of substrate hardening. The code is what the agent *runs*; the agent is the full capability. (See "The agent code is open source" in the page-required-content section.)

This framing is the load-bearing one in the doc. Every specific decision below builds on it.

### Why no traditional free tier

The inference cost itself is the qualification filter. An MVP costs roughly $100 in inference; serious users in alpha are spending thousands. Anyone willing to drop $50–100 to even try the product is already self-selecting as serious. A free trial gives them the experience without the perpetual-free-tier drag (support burden, abuse vectors, "people who'll never pay" cluttering the metrics).

### Why 7 days, not 14 or 30

The wow moment is in the first hour of using Remy. 7 days gives users one initial build plus 5–6 days to iterate, try a second project, or let it lapse. Critically, it forces the conversion decision while the experience is fresh. A 14- or 30-day trial would let users drift past the wow moment and convert (or churn) on something less compelling than their initial build.

### Why $99 specifically

- Clearly premium against the comp cluster (Lovable / Bolt / Replit / v0 / Cursor entry tiers all sit at $20–25). The price itself signals "this agent does more."
- Still psychologically accessible to an individual buyer with a card. No procurement, no expense-report friction.
- $1M ARR = ~850 paying users. Plausible target for an alpha graduating to GA over 12 months.
- Leaves room to raise to $149 or $199 at GA (when the post-launch loop is more mature) and use the raise itself as a launch moment. Easier to raise from $99 → $149 than from $49 → $149.
- Against the typical serious user's $1000–$2000/mo inference spend, $99 is rounding error — ~5% of their stack. Doesn't compete with their inference budget, complements it.
- **Value justification (secondary, not the primary comp):** the third-party services needed to replicate what Remy bundles — database, hosting, error tracking, analytics, monitoring, roadmap, pitch deck, integrations, auto-PR-for-bugs, plus a coding agent — run **~$200-400/mo for a serious solo builder** before any usage overages. See [`competitive-stack.md`](./competitive-stack.md) for the feature-by-feature mapping. We don't lead with that on the pricing page — anchoring against third-party services pulls users into a "wait, is this a platform?" frame that fights the agent positioning — but it's the math that makes $99 feel fair.

### Why pass-through inference is the load-bearing differentiator

This deserves more space than the other "why" sections because it's the single biggest commercial-differentiation lever Remy has against the comp set — and it only works if users actually understand it. On the surface, every AI tool says "you pay for usage." The differentiator is the *mechanics underneath* that line, and the page has to make those mechanics explicit.

**The mechanics:**

- **All inference is pass-through at provider rates. No markup, ever.** Remy makes no money on inference. The $99 subscription covers the agent; inference is what it is.
- **Two ways to pay for inference, user picks:**
  1. **Auto pass-through billing (default).** User funds an inference balance via Remy. We bill the providers, debit the user's balance at provider rate. User sees real-time per-conversation cost, current balance, history. Top up anytime.
  2. **Bring your own provider API keys.** User connects their own Anthropic / OpenAI / Google accounts. Inference billed directly to them by the provider; Remy never touches the money. Useful for: users with existing provider relationships, enterprise customers whose security policy requires they own the billing relationship, users who want direct provider billing for tax / expense / audit reasons.
- **User picks the models (or lets the agent pick).** No tier-gated model access, no "Pro+ unlocks better models."
- **Real-time cost display** so users see what they're spending as they spend it.

**Why every comp does the opposite, and why our move is durable:**

Lovable, Bolt, Replit, Cursor, v0 — all of them wrap inference in opaque credits or tokens with markup baked in. The math is intentionally hard to back into. Their review articles all spend paragraphs explaining "hidden costs" and "what you actually pay." Users have learned to dread credit math.

Remy doesn't play that game. The commercial bet: we capture more value by being the trusted choice in a category where everyone else has trained users to expect to get burned. Margin we forego on inference markup, we earn back in trust, retention, and word-of-mouth from a "serious B2B builder" ICP that hates surprise bills.

**The model-market tailwind:**

Claude, GPT, Gemini, and others are getting better and cheaper every quarter. Under a credit/token pricing model with markup baked in, the vendor captures the spread when model costs drop — users don't see lower prices. Under Remy's pass-through model, every model price drop flows directly to users automatically. **The user benefits from the model market maturing; the vendor doesn't pocket the savings.** This is a structural advantage that compounds over time and is hard to undo if a competitor wants to follow us — they'd have to restructure their entire pricing model publicly, which is brand-damaging.

**Why it only works if it's communicated:**

If the pricing page reads "we use AI models, you pay for usage," it sounds like every other AI tool — the differentiator is invisible. The mechanics (no markup, BYO keys, real-time visibility, you benefit from model improvements) have to be on the page explicitly. Without that, users will assume Remy works the way every other AI tool does, and we'll have given away the differentiator for nothing.

### Why no per-seat / team tier

The alpha ICP is solopreneurs and product-brained builders, not teams. Per-seat pricing on a solo-builder product signals you don't know what you're building. Team pricing becomes real when there's a real sales motion to sell it — post-seed, with a head of sales hired specifically for that. Building an enterprise tier without the motion to sell it is theater.

### Why "for organizations" is a footer stub, not a tier card

If real enterprise interest walks through the door, we handle it bespoke — at a price set in conversation, not on a page. Putting an "Enterprise — Contact Us" card on the pricing page invites the wrong kind of question and signals a motion we don't have yet. A single footer line acknowledges the door is open without inviting us to pretend we're chasing it.

### Why unlimited projects (and not per-project pricing)

Webflow / Squarespace / Wix / Shopify priced per-site because their primary product *was* hosting — each plan covered one site, and the site was the unit of value being sold. Remy is in a different category: the primary product is the agent that builds the thing. Project count isn't a meaningful cost driver — inference is. The AI-tool comp set (Lovable, Bolt, v0, Cursor, Replit Core/Pro) has converged on unlimited projects for exactly this reason.

Claiming unlimited is also consistent with the rest of the pricing posture: no credit packs, no degraded models, no per-seat, no slot counts. They're all expressions of the same underlying principle — *we price for the value we deliver, not for arbitrary limits on things we don't care about counting.*

The rare abuse case (someone deploys 10,000 spam sites) gets handled by a quiet acceptable-use clause in the TOS — legal cover that exists behind the scenes, not on the pricing page.

### Why a Remy-specific entry point, separate from MindStudio

- Brand coherence. Remy is the product going forward. MindStudio is the substrate being sunset. The brand surface should reflect that.
- No arbitrage: $99/mo Remy > $20/mo MindStudio Starter, so even if a curious user finds the legacy plan, they self-deselect into the lesser experience.
- Natural sunset path. When MindStudio Starter eventually gets fully retired, there's already an established Remy surface — no floor pulled out.
- Faster funnel iteration. Remy-only signup/onboarding can be tuned without worrying about breaking MindStudio flows.

---

## Pricing page — required content

The pricing page is more than tier cards. It needs to do three jobs:

1. **Show breadth** — a "what Remy does" surface near the top, so users see right away that this isn't "Lovable with a bigger price tag." It's the agent handling everything an app needs.
2. **Defuse anxieties** — the trust-buying paragraphs that pre-empt the predictable objections.
3. **Set expectations** — what inference actually costs, what's covered, what isn't.

One feature display + seven explanatory paragraphs.

### What Remy does (feature display — lead element on the page)

Pitches the breadth in *agent capabilities*, not platform features. Same content as a feature grid would be, but the framing is "Remy handles all of this for you" — staying inside the AI agent mental model rather than inviting a platform-comparison frame.

Draft content for the display:

| | |
|---|---|
| **Builds your app end-to-end** | Six specialist agents work as a team: coding, design, architecture, QA, research, roadmap |
| **Deploys it for you** | Git-backed, push-to-deploy, one-click rollback |
| **Hosts it on a real URL** | Global CDN, custom domains, SSL handled |
| **Runs the database** | Managed, typed schemas, automatic migrations, backups |
| **Manages auth** | Email/SMS verification codes, sessions, role-based access |
| **Watches it in production** | Live logs, error tracking, performance metrics, product analytics |
| **Keeps shipping after launch** | Roadmap, marketing assets, A/B tests, auto-generated PRs for bug fixes |
| **Has 200+ AI models built in** | Pass-through pricing, BYO API keys if you prefer |
| **Has 1,000+ integrations ready** | Pre-authenticated; no API key management to deal with |
| **Production-grade compliance** | SOC 2 Type 1 & 2, GDPR, audit logs |

The point: every row reads as something *the agent does*. The user mental model stays "Remy is an AI agent" — not "Remy is a platform that has an agent." That keeps the competitive frame on other AI agents (Lovable, Bolt, Cursor, Claude Code) where Remy wins on breadth, rather than on infrastructure providers (Vercel, Supabase) where Remy would have to defend on a different axis.

### Inference is the real cost — own it up front

> Remy uses frontier AI models — Claude Opus, Sonnet, Seedream, Gemini, others — and the inference cost is real. A typical project runs $100–$500 in inference depending on scope; serious builders running multiple projects often spend $1000+ a month. Plan to set aside at least $100 to get going on a real build. The $99 subscription covers everything else: the agent, the specialists, the design system, the post-launch loop, custom domains, your hosted apps.

The point: prime the user for the *real* spend (inference) up front so they don't bounce at day 3 when their balance runs low. By the time they reach the $99 number, the mental anchor has shifted — the subscription is the *small* line item, not the big one.

### How inference billing actually works (the differentiator)

> Inference passes through to you at provider rates. **No markup. We don't make money on inference.** Two ways to pay: use our auto-billing (top up a balance, we handle the rest) or **connect your own provider API keys** (Anthropic, OpenAI, Google, others) and bill the providers directly — useful if you have existing accounts, want direct billing, or have a security policy that requires it. You pick the models, you see the real-time cost, you keep your balance forever. And as the models get better and cheaper over time, **you benefit directly — not us absorbing the spread**.

The point: this is the **single biggest differentiator** Remy has versus the comp set, and it's invisible unless the page says it explicitly. Every other AI tool wraps inference in opaque credits with markup baked in; every review article complains about it. The "no markup / BYO keys / real-time visibility / you benefit from model improvements" framing is what separates Remy commercially from Lovable, Bolt, Replit, Cursor, v0. If the page doesn't make these mechanics explicit, the differentiator is given away for nothing — users assume Remy works the same way every other AI tool works.

### Hosting isn't a hidden landmine

> Most apps built on Remy serve real traffic for pennies in hosting cost. A backend serving thousands of users typically costs us less than a dollar a month. Your hosting is included — we absorb it for everything you build during alpha. If something you build hits genuinely large scale, we'll talk to you about it. In the meantime, build like cost isn't a constraint, because for almost every app, it isn't.

The point: people massively overestimate what their app will cost to host. The fear of "what if it gets popular and I get a huge bill" is real and irrational and shouldn't be left for the user to wrestle alone.

### The agent code is open source

> Remy's agent code is in public GitHub repos. You can read it, fork it, point an AI at it for a diligence pass. We're confident enough in what we've built to put it in the open.
>
> The code is what the agent runs on — not the whole agent. The agent is also the 200+ pre-integrated AI models, the 1,000+ pre-authenticated service integrations, the production-grade sandboxed runtime, the managed database layer, the SOC 2 / GDPR substrate, and the curated design and architecture data assets the specialists draw on. Self-hosting the code gets you the orchestration logic. Using Remy gets you the agent.

The point: pre-empts the "if it's open source, can't I just self-host it?" objection and turns it into a *trust signal* instead. The framing matters: we're not saying "the agent is the code and you can have it free" — we're saying "the agent is the integrated whole, and the code being open is evidence we have nothing to hide." Vercel/Next.js precedent applies: the framework is open, the integrated experience is the product. Keeps the user mental model on "Remy is an AI agent" rather than slipping into "Remy is a platform that has an agent."

### It's just code

> You own your code, your database, and your data. If you want to host your Remy app somewhere else, you can — it's a TypeScript backend and a standard frontend. There's a little unbundling work (swapping out the managed database, mostly), but any LLM can walk you through it in a few minutes. We're infrastructure, not lock-in.

The point: defuses the lock-in objection up front. This is a real trust signal for the technical PM / serious builder ICP — they've all been burned by platform lock-in before, and putting "you can leave" on the pricing page is unusual enough to be memorable.

### Unlimited projects, unlimited deploys

> Unlimited projects, unlimited deploys. We don't count them because project count isn't what costs us money — your inference spend is what scales with usage, and that's pass-through at provider rates. Build whatever you want, deploy whatever you want, throw stuff away whenever you want. If something you build hits genuinely large scale, we'll talk to you about it; until then, the limit is your imagination, not a slot count.

The point: defuses the "is this really unlimited?" anxiety up front and makes the contrast with Webflow/Squarespace/Wix-era per-site pricing explicit without naming them. Reinforces the broader posture: we don't price for arbitrary limits on things we don't care about counting.

### v1 pricing — confident, not apologetic

> $99/month, or $79/month with annual billing (save $237/year). This is the first version of Remy's pricing. If we change it later — and we might — your annual rate is locked for the year. Monthly subs renew at whatever the price is at renewal time.

The point: separates **product stability** (the product is real, alpha users have shipped real apps) from **pricing stability** (the commercial model is v1 and may iterate). Saying "this is beta software" would undermine confidence in what we've built; saying "this is our first take on what Remy should cost" doesn't undermine anything — it's what a confident, honest company says about its commercial model. The annual lock-in is the natural hedge mechanism for users who want certainty.

**No "beta" badge or "alpha pricing" sticker on the page.** The pricing page is about the product as it exists. The fact that the product is in open alpha is communicated elsewhere (landing page, dashboard, FAQ). On the pricing page, it's just Remy.

---

## Trial mechanics

- **Length:** 7 days, full product, no feature limits, no model degradation.
- **No credit card required to start the trial.** The inference top-up *is* the friction filter — we don't need a CC gate on top of it.
- **Inference balance must be funded to use the product.** Real money the user owns; never expires.
- **Suggested minimum top-up communicated up front:** ~$100 to get going on a real build. Users can fund less to start exploring, but the messaging should set expectations.
- **Trial-end prompt timing:** TBD. Probably 24–48 hours of heads-up before day 7. More notice = more frustration-free conversions, but also more "let me think about it" lapse. Need to test.

### VIP / coupon mechanic

We can pre-top-up inference balances for VIPs via coupons or invites. Doesn't disrupt the public pricing model — the price is still $99/mo for everyone — but it removes the inference-top-up friction for specific people we want to give a frictionless experience (investors trying the product, press, key reference customers).

---

## What happens to apps when a user stops paying

### Trial lapses without converting

App stays deployed (hosting is pennies, and we want the apps in the wild to keep advertising Remy). User can no longer make changes via Remy until they subscribe. Their inference balance is theirs forever — they keep it, it never expires, they can return any time.

### Active subscriber cancels

Industry norm is freeze-after-grace-period, but we can differentiate by leaving apps running while the account is paused. The hosting cost is trivial, and a user with a deployed app running is more likely to come back than a user staring at a "your app is frozen" notice. Worth deciding deliberately rather than defaulting.

(Both of these need a definitive decision before launch — flagged in open questions below.)

---

## Existing MindStudio Starter ($20/mo) users — migration

Recommended approach: **clean upgrade CTA.** Existing MindStudio Starter subscribers who want Remy access see an in-dashboard banner that cancels their $20 sub and starts a new $99 Remy sub. One charge, clear delta, no grandfathering complexity.

Alternative considered but rejected: grandfathering existing users at $20 with limited Remy access. This breaks the pricing-clarity narrative — "$99 means $99" — and creates legacy support burden indefinitely.

Existing MindStudio Starter remains accessible for users who don't want Remy. It's the deprecated plan, not actively promoted, and over time will be sunset entirely.

---

## What we explicitly chose *not* to do (and why)

These are intentional absences. If someone proposes adding any of these later, this section is the case against doing it.

- **No credit packs / token bundles.** Opaque pricing UX that every comp's review articles complain about. Inference is pass-through dollars, displayed in real-time. Period.
- **No degraded models on lower tiers.** No "Pro gets GPT-4o-mini" tricks. All tiers — meaning the one tier we have — use frontier models. The model quality *is* the product.
- **No usage caps or throttling on the subscription.** Cursor's "3x usage" / "20x usage" tier ladder is a credit system in disguise. We don't play it.
- **No per-seat pricing.** ICP in alpha is solo builders. Per-seat signals we don't know our user.
- **No team tier card.** Same reason. Team becomes a real motion post-seed, with a real sales lead. Not before.
- **No prominent enterprise tier card.** Just a footer link. Enterprise gets handled bespoke when interest shows up; no theater.
- **No free tier (only free trial).** Inference cost itself is the qualifying filter. Casuals self-deselect before signup.
- **No "Pro plan includes $X of inference credit."** Tempting from a friendliness angle, but it's a credit-pack-in-disguise and breaks the pass-through narrative. Inference is always separate, always pass-through. Period.
- **No model picker exposed at subscription tier level.** Model selection is the agent's job. The user pays for what the agent uses, at provider rates.
- **No per-project / per-app pricing.** Webflow/Squarespace/Wix anchor doesn't apply to Remy — we're not selling hosting as the primary product, we're selling the agent. Project count isn't a cost driver worth metering. Unlimited projects and unlimited deploys.

---

## Market context (snapshot — June 2026)

Captured for reference. The category is moving fast; these numbers will shift.

### Direct comp pricing

| Product | Entry | Pro/Mid | Team/Business | Mechanic |
|---|---|---|---|---|
| Lovable | Free (5 daily credits) | $25/mo (100 credits) | $50/mo (Business, SSO) | Credits + separate hosting/AI |
| Bolt.new | Free (1M tokens/mo) | $25/mo (10M+ tokens) | $30/seat/mo (Teams) | Tokens, hosting included |
| Replit | Free | Core $20/mo ($25 credits) | Pro $100/mo (15 builders) | Checkpoint-based ($0.25/Agent, $0.05/Assistant) |
| v0 (Vercel) | Free ($5 credits) | Premium $20/mo | Team $30/user, Business $100/user | Token-based as of Feb 2026 |
| Cursor | Hobby free | Pro $20, Pro+ $60, Ultra $200 | Teams $40/user | Token-based; annual 20% off |
| Devin | Core $20/mo + $2.25/ACU | — | Team $500/mo (250 ACUs) | ACU = ~15 min AI work |

Remy at $99/mo is meaningfully above the entry cluster but below the team/business tiers most comps offer. That gap is the positioning gap — "more than a vibe-coder, not yet a team product."

### Growth math

| Subscription price | Users to $1M ARR |
|---|---|
| $20/mo | ~4,200 |
| $49/mo | ~1,700 |
| $99/mo | ~850 |
| $149/mo | ~560 |
| $199/mo | ~420 |
| $50k/yr enterprise | ~20 logos |

At $99/mo, the realistic path to $1M ARR is some combination of solid PLG (a few hundred Pro subs) plus a handful of enterprise pilots at $50k+. Faster path to $1M ARR than the unit math suggests — enterprise deals compress the timeline.

### Industry trajectory (per Bessemer, BCG, Sierra commentary)

- Hybrid pricing dominates among successful AI companies (~43% of SaaS firms, projected to grow).
- "Per-seat is dead" for AI replacing labor (vs. augmenting it).
- Bloomberg projects subscription share dropping from ~60% → 30%, outcome-based rising from ~10% → 60% over the decade.
- Enterprise buyers want hybrid: predictable base + variable layer they can govern.

For Remy, the practical translation: subscription anchor is the predictable base, inference pass-through is the variable layer. We already match the dominant model — we just keep the variable layer at cost rather than marking it up.

### Reference growth stories

- Cursor: $0 → $100M ARR in 12 months.
- Cognition (Devin): $1M → $73M ARR in 9 months (Sept 2024 → Jun 2025).
- Gamma: $100M ARR, $2.1B valuation as of Nov 2025.
- Pattern: AI-native startups reaching $100M ARR in <2 years with <20 employees.

---

## Open questions still to resolve before launch

1. **URL / entry point.** `goremy.ai/start`? `goremy.ai/get-started`? `mindstudio.ai/remy`? One domain end-to-end is the cleaner experience.
2. **Trial-end prompt timing.** 24h heads-up? 48h? Day-5 vs day-6 trigger?
3. **Trial-lapse app fate.** Stay deployed indefinitely vs. archive after N days?
4. **Cancellation-of-paid-sub app fate.** Stay running vs. freeze after grace period?
5. **Inference balance UX details.** Real-time per-conversation cost display? Low-balance warnings at what threshold? Optional auto-top-up? Minimum top-up amount?
6. **Pricing page placement of the feature display + seven explanatory paragraphs** (what Remy does / inference cost / inference billing mechanics / hosting / open source / portability / unlimited / v1 pricing). The feature display goes at the top (it's the breadth-of-capability lead element). Tier card likely sits above or beside it. The trust-buying paragraphs go below. Open question: exact layout, and whether the feature display is a table, a row of icons, or a card grid.
7. **Is BYO API keys shipped today, or near-term roadmap?** If the page promises it, the surface needs to exist — UI to add/manage provider keys, swap them in/out per project, audit usage by key. If not shipped at launch, the page copy needs to soften from "you can BYO keys" to "you can BYO keys (coming soon)" or hold the BYO-keys claim until it's real.
8. **The "I already have Vercel/Supabase/etc." objection.** The agent-first framing helps (users in that frame don't compare to infra providers), but some technical PMs will still hit the page and think "I already have this." Worth deciding whether to address it in an FAQ entry or just trust that the framing does the work. My instinct: trust the framing, don't add an FAQ entry that drags the comparison into the open.
7. **Marketing surface update.** goremy.ai landing page CTAs currently point to `mindstudio.ai/pricing`. Update to the new Remy-specific signup flow.
8. **How long do MindStudio Starter ($20) subs continue to be sold to new users?** Recommended: stop selling new Starter subs at the same moment Remy launches. Existing subs continue until users upgrade or sunset.

---

## Things to revisit at GA / Series A

- **Price raise.** $99 → $149 or $199 as a launch-moment with mature post-launch loop story.
- **Team tier.** Real one, with a sales motion behind it. Per-seat or per-org, with SSO/audit logs/shared workspaces. Built when there's a Head of Sales to actually sell it.
- **Enterprise tier.** Real card on the page, not a footer link. Custom SLA, on-prem option, dedicated CS.
- **Outcome-pricing experiments.** Once the post-launch loop is more mature, "Remy as Product Engineering" as an outcome-managed tier becomes a real conversation. Not now.
- **Hosting overage / scale pricing.** If apps hit genuine scale, we'll need a real pricing conversation for the long tail of high-traffic apps. Punt until it's a real problem.

---

## Sources consulted

- [Lovable Pricing](https://lovable.dev/pricing)
- [Bolt.new Pricing](https://bolt.new/pricing)
- [Replit Pricing](https://replit.com/pricing) and [Pro plan launch](https://replit.com/blog/pro-plan)
- [Cursor Pricing](https://cursor.com/pricing)
- [v0 by Vercel Pricing](https://v0.app/pricing)
- [Devin Pricing](https://devin.ai/pricing/)
- [Bessemer Venture Partners — The AI Pricing and Monetization Playbook](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook)
- [BCG — Rethinking B2B Software Pricing in the Agentic AI Era](https://www.bcg.com/publications/2025/rethinking-b2b-software-pricing-in-the-era-of-ai)
- [Sierra — Outcome-based pricing for AI Agents](https://sierra.ai/blog/outcome-based-pricing-for-ai-agents)
- [HighRadius — Outcome-Based Pricing for AI: Why Paying for "Seats" is Dead](https://www.highradius.com/resources/Blog/outcome-based-pricing-ai/)
