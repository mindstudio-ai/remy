# Remy Alpha: How We Talk About It

## What Remy Is

Remy is the next step in how software gets made. Programming has always moved up in abstraction. Punch cards to assembly to C to TypeScript. Each step let you express more intent in less code. Remy takes the next step: the source language is annotated prose.

You describe your application in a spec, which is a markdown document with two layers. The readable prose says what the app does. The annotations carry the precision: data types, edge cases, rules, code hints. Remy compiles this into a full-stack app: backend, database, frontend, auth, tests, deployment. The spec is the program. The code is compiled output.

This isn't "AI writes code for you." It's a shift in what programming looks like. Nobody hand-writes assembly anymore, but it's still running underneath. Same idea here. The next generation of software won't start from TypeScript. It'll start from a spec that both humans and agents can read, write, and reason about.

## Remy and MindStudio

Remy is made by MindStudio.

We built MindStudio as a platform for AI-powered applications: 200+ AI models, 1000+ integrations, managed databases, auth, deployment, years of production infrastructure. Along the way, we realized the right abstraction wasn't better tooling for writing code. It was a new source format that both humans and AI could work with. Remy came out of that realization. It runs on the infrastructure we've spent years building, but the approach is entirely new. It's where we're putting our focus going forward.

**When to mention MindStudio:** When the question is about infrastructure, security, or why the platform capabilities are so broad. "This runs on infrastructure we've been building and running for years" is credibility. It explains why there are 200+ models and 1000+ integrations available out of the box. We didn't bolt those on last month.

**When to just say Remy:** Almost everywhere else. The product is Remy. The idea is spec-driven development. MindStudio is the foundation, not the headline.

## How to Talk About It

### The right framing

- **A new way to program, not a way to avoid programming.** Remy isn't no-code. It isn't a shortcut for people who can't code. It's a higher-level language, one that happens to look like English with annotations instead of syntax with semicolons.
- **The spec is the app.** Code is a compiled artifact. This is the single most important idea. When people get this, everything else clicks.
- **Full-stack means full-stack.** Remy apps have real backends, real SQL databases, real auth, real git-backed deployment. Not a prototype. Not a static site with a form.
- **The environment is integrated.** Editor, live preview, terminal, AI agent, deployment, all in the browser. You don't stitch together five tools. You open a tab and build.

### Words and phrases that work

- "Compiles annotated markdown into full-stack apps"
- "The spec is the source of truth, the code is derived"
- "A new kind of programming language"
- "Full-stack: backend, database, auth, deployment, everything"
- "Browser-based: open a tab and build"
- "Spec-driven development"

### What to avoid

- **"No-code" or "low-code."** Remy generates real TypeScript. The spec format has real precision. This isn't drag-and-drop.
- **"Vibe coding."** Vibe coding means throwing prompts at an AI and hoping the output works. Remy's spec format is structured, precise, and stays in sync with the code. If someone else uses the term, don't die on the hill. "Yeah, kind of, but more structured" is fine.
- **"AI writes code so you don't have to."** This frames code as the point and AI as a labor shortcut. The point is that the *source of truth* has changed. Code still exists, it's just not where you work.
- **"No backend needed" or "serverless."** There IS a backend. That's the whole point. The backend is the application contract.

### On speed

Remy builds fast. That's real and worth showing. But don't lead with speed. Every AI tool claims to be fast. Lead with what it built, then let the speed be the surprise. "Look at this app... and yeah, this took 15 minutes" lands better than "Build apps in minutes!"

### On comparisons

Don't proactively compare to other tools. It puts you in their frame. If it comes up, see the Common Reactions section. But the best response is usually just to show what Remy built and let people draw their own conclusions.

## Demo Guidance

Demos are the main thing. There are several angles that work, and you don't need all of them every time.

### The output speaks for itself

Some of the apps Remy has built are genuinely stunning. To the point where people won't believe AI built them. That's an asset. A polished, deployed app with real auth flows, real data, beautiful design, and AI features is a powerful demo on its own. You don't always need to show the spec or explain the philosophy. Sometimes "Remy built this" is the whole post.

### The spec reveal

When you want to show the architecture: show the output first (the impressive app), then reveal the source (a readable markdown document). Let the gap between those two things do the talking. The viewer should feel the distance between "a document I could read" and "a working product with a database and auth."

### The build process

The experience of building with Remy is itself compelling. Remy asking smart questions during intake, engaging with the user about design decisions, consulting its specialist agents (design expert picking fonts and generating images, QA agent driving a real browser to test flows), iterating on the spec, then compiling it all into a working app. This is visibly different from typing prompts into a chat box and getting code back. Screen recordings of the build process show that.

### What to show

- Apps that are clearly not toys: auth, roles, multiple screens, real user flows
- Apps with AI built in: image generation, content processing, autonomous task agents
- Apps with multiple interfaces: web + API, web + conversational agent
- The spec itself, when it helps: short enough to fit on screen, readable, obviously not code
- The build conversation: Remy asking questions, making design decisions, testing its own work

### What to avoid in demos

- Todo apps or trivial examples (doesn't showcase the full stack)
- Focusing on speed as the headline ("built in 3 minutes!"). Let it be the surprise, not the lead
- Over-explaining the spec format in a social post. Show it, don't lecture about it

## Common Reactions

**"So it's like Cursor or Claude Code?"**
Those are code-level tools. They help you write and edit code faster within your existing codebase. Remy works at a higher level. You describe the application in a spec, and the code is compiled from that. You're not editing TypeScript line by line. You're defining what the app does and the code follows. Different starting point entirely.

**"So it's like Bolt / Lovable / Replit Agent?"**
Closer, but different in important ways. Those tools generate frontends from prompts. Often impressive-looking, but typically no real backend, no persistent database, no auth system. Remy builds the full stack: backend methods, typed SQL database, auth with real verification codes and sessions. And it's all backed by a spec that stays in sync as the project evolves. The spec is what makes iteration reliable. It's not a chat log of prompts. It's a structured document that both you and the agent can reason about.

**"Is this no-code?"**
No. There's real code underneath: TypeScript, any framework, any npm package. You can read it, edit it, extend it. The difference is the source of truth is a spec document, not the code itself. Think of it as a higher-level programming language.

**"So it's vibe coding?"**
More structured than that. The spec format has annotations that carry real precision: data types, validation rules, edge cases. It's not "throw a prompt and hope." The spec stays in sync with the code and grows with the project.

**"Can it build [specific thing]?"**
If it's a full-stack web app with a backend, probably yes. Native mobile apps and real-time multiplayer with persistent connections aren't supported yet. Be honest about the boundaries.

**"What happens when AI writes bad code?"**
The spec is the source of truth, not the code. If the generated code has issues, you fix it, or you fix the spec and recompile. As models get better, the compiled output gets better automatically. You don't rewrite the app. You recompile it.

**"Why wouldn't I just use [framework/tool] directly?"**
You can, and many people should. Remy is for when you want a complete, deployed, full-stack application and you'd rather describe what it does than wire up all the infrastructure yourself. It's not replacing your favorite editor. It's a different level of abstraction.
