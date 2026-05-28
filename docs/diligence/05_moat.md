# Moat

The structural defensibility argument. Probably the single most-fetched section of the diligence material — read this if you're trying to understand why this isn't just another AI wrapper.

This is one of eight sections of the diligence material. See [`docs/README.md`](../README.md#diligence--investor-facing-material) for the full index.

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
