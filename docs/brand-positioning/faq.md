# Remy Alpha: Frequently Asked Questions

## Do I need a paid account?

Yes. Remy is **$99/month**, or **$79/month with annual billing** (about two months free). There's a **7-day free trial** — full product, no feature limits during the trial — so you can build something real before deciding.

For specific promos (like the Show HN launch), we can issue codes that activate the trial without a card. For VIPs we sometimes provide direct invite links with pre-loaded inference credits so they don't need to top up before getting started.

## How do I report bugs or give feedback?

Use the "Send Feedback" button in the UI, or email sean@mindstudio.ai directly. We can't provide customer support during the alpha. It's alpha for a reason. Things will break. We want to hear about it, but we can't promise a quick turnaround on fixes.

## Who owns the code and output?

You do. 100%. Your code lives in a git repo. Your database is yours. We're infrastructure, same as GitHub or Vercel or AWS. We host and run your app. You own everything in it.

## Is Remy open source?

Yes. Here are the repos:

- **[remy](https://github.com/mindstudio-ai/remy)** — the agent itself
- **[mindstudio-local-model-tunnel](https://github.com/mindstudio-ai/mindstudio-local-model-tunnel)** — the local dev environment CLI
- **[mindstudio-agent](https://github.com/mindstudio-ai/mindstudio-agent)** — backend SDK (`@mindstudio-ai/agent`)
- **[mindstudio-interface](https://github.com/mindstudio-ai/mindstudio-interface)** — frontend SDK (`@mindstudio-ai/interface`)
- **[mindstudio-browser-agent](https://github.com/mindstudio-ai/mindstudio-browser-agent)** — browser automation agent

Go poke around.

## What models does Remy use?

Remy is model-agnostic and uses the best models available for each job. Today that mostly means Claude Opus for the core agent, Sonnet for specialist tasks, Seedream for image generation, and Gemini for image analysis. This will change as models evolve. The spec-as-source-of-truth architecture means better models produce better compiled output without changing your app.

## How many projects can I make?

Unlimited during the alpha.

## Can I deploy and launch apps?

Yes. Apps deploy on push to the main branch and are live on a real URL. You can set up custom subdomains via the CLI. Use at your own risk for production workloads.

## What does it cost?

$99/month, or $79/month with annual billing.

Inference (the raw AI model usage Remy runs on your behalf) is **pass-through at provider rates with no markup**. You either fund an inference balance via auto-billing, or connect your own provider API keys (Anthropic, OpenAI, Google). A typical MVP costs around $100 in inference to build; power users building seriously spend $1,000+/month.

One tier during alpha. No per-seat pricing. No team plan. For organizations with SSO, SAML, on-prem, audit log, or other enterprise requirements, get in touch — sean@mindstudio.ai.

## Are custom domains supported?

Coming soon. Along with a lot of other things.

## What are the technical constraints?

- Backends are TypeScript (runs in a Node environment, any npm package)
- Frontends just need to be able to run a build command (Vite + React is the default, but any framework works)
- No native mobile apps (mobile-responsive web apps are fine)
- No real-time multiplayer with persistent WebSocket connections (turn-based and async multiplayer work) great

## I have a feature request / I wish it had X.

We're building fast. Email sean@mindstudio.ai or use the feedback tool in the UI. No promises on timelines, but we're listening.
