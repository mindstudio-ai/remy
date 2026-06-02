# Deal & Financials

Deal structure, financial model bones, comparables, sensitivity analysis, exit analysis. Most of this section is `[Private]` — available on request under NDA — with the substantive non-financial positioning notes (e.g., comparable peer-group framing) visible.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

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

The Wooster Labs cap table entering the Seed consists of founder common, an employee option pool, and a pre-seed SAFE held by prior GoMeta investors who rolled forward at spinout (see [Corporate Structure](./01_overview.md#corporate-structure)). Specific names and terms are redacted below.

> *[Private — pre-seed SAFE investor list and terms available on request]*

---

## Financial Model

Bones:

- Revenue model: subscription + inference pass-through (alpha pricing model detailed below) plus platform-licensing into SaaS incumbents (see [Go-to-Market](./07_strategy-and-gtm.md#go-to-market)).
- Baseline: pre-revenue. Remy is currently free to use during alpha (users pay only for inference at provider rates). The pricing model below is the planned alpha-to-GA pricing structure; it will go live in the near term and generate the willingness-to-pay data that informs post-Seed pricing.
- Forward projections: not modeled in this document.

> *[Private — specific projections and assumptions available]*

### Current pricing thinking (alpha PLG wedge)

The pricing structure planned for alpha is set for the product-enthusiast and AI-builder PLG segment — not the post-Seed ICP commercial motion. Deliberately simple, deliberately self-serve, deliberately priced to filter for serious users.

**The model:**

- **$99/month** (or **$79/month with annual billing** — 20% off, equivalent to two months free).
- **7-day free trial**, full product, no feature limits during trial.
- **Inference is pass-through at provider rates with no markup.** Users either fund an inference balance via auto-billing or connect their own provider API keys (Anthropic, OpenAI, Google).
- **One tier.** No per-seat. No team plan. No enterprise tier card on the page — a "for organizations, get in touch" footer link only.
- **Unlimited projects, unlimited deploys.** Hosting absorbed at any realistic alpha-customer scale.

**Why this shape today:**

- **Signals "more than a vibe-coder."** The AI app-builder comp cluster (Lovable, Bolt, Replit Core, v0, Cursor Pro) sits at $20–25 entry tiers. Remy does meaningfully more — full post-launch loop, six-specialist agent team, production-grade substrate — and $99 reflects that without being inaccessible to an individual buyer with a card.
- **Inference cost is the qualification filter.** A typical MVP costs ~$100 in inference; serious alpha builders are spending $1,000+/mo in inference. Anyone willing to fund an inference balance to even try the product is self-selecting as a serious user.
- **Pass-through inference is a trust-buying differentiator.** The comp set all wraps inference in opaque credits with markup baked in; Remy doesn't.
- **One-tier simplicity fits alpha PLG.** Team and per-seat complexity should come with a real sales motion to back it up — a post-Seed move, not an alpha move.

**Why this isn't the long-term commercial motion:**

The Phase 1 alpha buyer (technical PMs, product enthusiasts, AI-tooling-aware operators converting through organic self-serve) is a different segment from the Phase 2 destination ICP (ops, finance, HR, RevOps leaders at 100–1,000 employee orgs reached via AE-led motion — see [Go-to-Market](./07_strategy-and-gtm.md#go-to-market)). The pricing for Phase 2 will be different.

Post-Seed commercial structure will likely include: real team and enterprise tiers with a sales motion behind them, per-seat or per-org pricing for the team motion, custom SLAs and on-prem for enterprise, and platform-licensing arrangements for the SaaS-incumbent amplifier. Once the alpha pricing is live, it will generate the willingness-to-pay signals, feature-tier preferences, and churn shapes that inform that structure.

**Revenue arithmetic for reference:**

At $99/mo, $1M ARR ≈ 850 paying users. With team and enterprise tiers added post-Seed, per-customer ACV scales materially and the user-count needed for the same ARR drops.

> *[Private — specific projections, willingness-to-pay data from alpha, and post-Seed pricing scenarios available on request]*

---

## Comparables

Positioning note:

- **Peer group is internal tools and application platforms, not AI coding tools.** Remy's ICP is a non-technical business operator (see [Product Overview](./02_product-and-traction.md#product-overview) and [Competitive Landscape](./04_market-and-competition.md#competitive-landscape)). Cursor, Windsurf, and Cognition as comps would misframe the opportunity.

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

- Wide acquirer field (see [Strategic Context](./07_strategy-and-gtm.md#strategic-context) and [Downside Protection](./06_risks-and-downside.md#downside-protection)): horizontal SaaS, cloud and developer platforms, enterprise automation and low-code incumbents.
- Platform licensing as the floor case — produces enterprise-quality ARR attractive to strategic acquirers.
- The asset includes Remy plus the underlying platform substrate, valued in any acquisition independent of direct-GTM outcome.

> *[Private — return modeling and scenarios available]*
