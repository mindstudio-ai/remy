# Building MCP Interfaces

Guidance for exposing an app as an MCP server — a tool / resource / prompt surface for *external* AI agents (Claude Desktop, Cursor, anyone's agent). The contract (spec format, compiled output, `interface.json`) is in the Interfaces doc; this is how to author one well. Unlike the agent interface, there's no LLM, personality, or UI to design — the entire product is the descriptions and the shape of what you expose.

## The descriptions are the product

The calling agent is a stranger with no knowledge of your app. It decides what to invoke entirely from the names, descriptions, and annotations you ship. Follow the same principles as the agent interface's tool descriptions (see "Building Agent Interfaces" — when to use and when not, parameter guidance beyond the schema, what the tool returns) — but write them **self-contained**. An in-app agent tool can lean on the app's framing; an MCP tool can't, because the caller has no context. Spell out what an outsider wouldn't know.

## Curate — not every method is a tool

Expose what an outside agent would actually use. Skip internal helpers, admin-only methods, and batch operations. A focused set of well-described tools beats a large set of thin ones. Note role restrictions in the description — gated tools are listed but reject unauthorized calls at runtime, so set expectations rather than surfacing a raw error.

## Annotations

Annotations are machine-readable hints clients use to decide whether to auto-call a tool or ask the user first. Set them honestly:

- `readOnly` — the tool only reads, never mutates. The highest-value hint: clients auto-call reads without prompting, so set it on every pure read.
- `destructive` — the tool can delete or overwrite. Clients gate these behind confirmation.
- `idempotent` — calling twice with the same arguments has the same effect as calling once.
- `openWorld` — the tool reaches outside the app (external web/services) rather than operating only on app data.

## Tools vs. resources

A **tool** is an action the agent *invokes*; a **resource** is data the agent *reads into context*. A read-only method can be either — expose it as a tool if the agent will call it as a step, as a resource if it's reference data the agent should pull in, and as both when both fit.

Resources are method-backed: a read invokes the method. Use a static `uri` for a fixed collection (`app://vendors`) and a `uriTemplate` when the read takes parameters (`app://vendors/{id}`, where `{id}` maps to the method's input). Keep URIs stable and human-legible.

## Prompts

Prompts are reusable, parameterized templates the server offers to clients — e.g. a "draft a vendor email" starter. Author the template body with `{{arg}}` placeholders and declare its arguments. Offer a prompt when there's a recurring task worth packaging; skip it if a tool already covers the need.

## Server instructions

The spec's intro prose becomes the server `instructions` — toolset-level guidance returned to the calling agent at connect time (its "system prompt"). Put *cross-cutting* guidance here: how the tools fit together, ordering or prerequisites ("read a vendor before updating it"), and norms that apply across the whole toolset. Keep per-tool specifics in the tool descriptions; instructions are for the toolset as a whole.
