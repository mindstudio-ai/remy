# Remy Alpha: Frequently Asked Questions

## Do I need a paid account?

Yes, during the alpha you need a MindStudio account on the Starter plan ($20/mo). This is mainly to prevent abuse while we're in early access. For specific promos (like the Show HN launch), we can issue codes that activate alpha access on free accounts. For VIPs we can also give them direct invite links with pre-loaded inference credits so they don't need to go through the hassle of topping up.

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

During the alpha, there are no platform fees. You pay for inference costs (the raw AI model usage - no markup). Eventually Remy will have real pricing, but for now we want people building, not worrying about bills.

## Are custom domains supported?

Coming soon. Along with a lot of other things.

## What are the technical constraints?

- Backends are TypeScript (runs in a Node environment, any npm package)
- Frontends just need to be able to run a build command (Vite + React is the default, but any framework works)
- No native mobile apps (mobile-responsive web apps are fine)
- No real-time multiplayer with persistent WebSocket connections (turn-based and async multiplayer work) great
- Databases are SQLite (WAL/journalled, with automatic schema migrations on deploy)

## I have a feature request / I wish it had X.

We're building fast. Email sean@mindstudio.ai or use the feedback tool in the UI. No promises on timelines, but we're listening.
