# Cloud 2.0 Narrative

A roughly four-minute explainer narration that contextualizes Remy in its long-arc thesis — what it is, why now, what it becomes if it works. Written as source material for creators making explainer content and as a teaching tool for team members who need to internalize the broader framing.

Written in plain prose, not as a polished video script — no stage directions or visual cues. A creator can pace and voice it however suits their channel.

For the diligence framing of the same thesis, see [Thesis #3 in the diligence material](../diligence/03_thesis.md#3-thesis-remy-is-building-the-cloud-the-agent-era-needs). For the short version, see [the executive summary's "bigger story" section](../diligence/executive-summary.md#the-bigger-story-behind-the-wedge).

---

## Narration

Something has shifted in how software gets made. For most of computing history, building a real app required engineers — people who write code, set up infrastructure, manage the toolchain. In the past year, that's no longer true. Anyone with an idea can work with an AI agent and end up with something real — not a prototype, but an actual working app, live on a real URL.

And those apps are increasingly running real work. Finance teams are building their own approval workflows. Ops people are building inventory trackers and dashboards. HR is building onboarding portals. Sales operations is building lightweight CRMs. None of these are demos — they're tools the company depends on, built by the people who need them, with AI doing the engineering work. It's a real shift in how organizations get capability they couldn't access before.

The more interesting question is what happens next.

As the app starts being used in earnest, new needs emerge — not as failures, but as the kind of growth milestones any real product hits.

People sign in regularly, and some forget their passwords. The app needs a real authentication system — sessions, password resets, security. Setting that up means something like Auth0 or Clerk, typically $25-100/month.

Users want to upload things — profile pictures, documents, sometimes video. This matters more than it looks. User-uploaded content can't live on the app's main domain, because of how browsers treat content served from the same origin — anything uploaded becomes a potential security risk to the app itself. So uploads need an isolated domain of their own. Images then need to be resized for different views — thumbnails, mobile, full-size — usually through a service that does it on demand by passing parameters in the URL. Cloudflare Images or Imgix, $5-100/month. Video is even more involved: every upload needs to be transcoded into formats that play on every device, often watermarked, given a poster image, sometimes captioned. That's services like Mux or Cloudflare Stream, often $50-300/month at meaningful volume.

The team wants to know how many people are actually using it. That means adding analytics — Plausible or PostHog, around $9-30/month.

The app starts sending real emails — password resets, notifications, receipts. Making sure those messages actually arrive is its own discipline. Gmail and Outlook are aggressive about spam, so the sending domain needs proper authentication records (SPF, DKIM, DMARC) and a reputation that's built up over time. Bounces have to be handled, unsubscribes tracked. That's a service like Resend, Postmark, or SendGrid, around $15-90/month.

A user reports something broken — they say a button didn't work, or the page froze, or they got a confusing error. The builder tries it themselves and everything works fine. The bug happened in that user's browser, on their device, with their session and their data — there's no way to see what actually went wrong without instrumentation. That's frontend error reporting — something like Sentry, around $26/month, that captures the stack trace and the state of the page from the user's browser the moment something breaks.

Then someone says the dashboard takes ten seconds to load. On the builder's machine it's instant. Why is it slow for that user? Could be a slow database query, an external API timing out, the user's network, a render bottleneck somewhere — the only way to know is to instrument the app to record where time actually gets spent on every request. That's application performance monitoring, or APM — services like New Relic or Datadog, around $30-100/month.

Then one day, someone starts sending thousands of SMS password reset requests from a random country. The builder doesn't know why — could be a bot, could be someone probing for weaknesses, could be entirely incidental — but it doesn't matter. Each SMS costs real money, and without rate limiting, the bill grows by the minute. The app needs abuse protection — rate limits on sensitive endpoints, IP-level throttling, anomaly detection. That's its own layer of infrastructure — Cloudflare or Upstash, $20-100/month at the entry level, more at scale.

Eventually legal notices. They ask who has access to what data — meaning audit logs and access controls, often hundreds of dollars a month for compliance-grade tooling.

Other teams want the app to connect to the CRM, Slack, the accounting system. Each integration is its own service to set up — Zapier or similar, $20-100+/month plus per-task fees.

These are all good signs. They show up because what was built is working — being used, mattering, becoming part of how the business runs. But each one is solved by signing up for a different company's product. Authentication is one company. Media handling is another. Email delivery is another. Analytics is another. Error reporting is another. Performance monitoring is another. Abuse protection is another. Custom domains, SSL certificates, content delivery networks, search, backups, in-app notifications, subscription billing, A/B testing, fraud detection, localization — every one is its own service, its own vendor, its own bill. All of them have to be wired together and kept wired together every time something changes.

This entire stack was built over the last twenty years, designed for human developers working in teams at human speed. Everything about it reflects those assumptions. Pricing is per-seat for tools, per-instance for compute — calibrated to what a human team uses in a given month. The control surfaces are dashboards, sprawling consoles meant for a person to look at and configure by hand. Provisioning takes minutes — fine when a developer is setting things up once, awkward when an agent is generating new apps in real time. Permissions are organized around human teams: engineering can deploy, ops can read logs, finance can see billing. The entire mental model assumes a person at every key step, reviewing, approving, hand-wiring things together.

That world is ending. About half the code committed to GitHub today is written with AI assistance. Soon, every employee at every company will be building their own software this way. The infrastructure underneath wasn't built for that. If you were starting fresh today, knowing what you know now, you'd build it differently.

Remy is what that looks like — a cloud platform designed from the start for how software actually gets made now. One agent, one platform, one bill, in place of the dozen separate services someone would otherwise wire together themselves. The same kind of shift AWS represented two decades ago — now applied to a world where agents do the building.
