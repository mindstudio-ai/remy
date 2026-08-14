---
name: MCP Interfaces
what: Ships the app as an MCP server, so external AI agents — Claude Desktop, Cursor, anyone's agent — can drive it as a tool surface. The platform hosts the server, handles auth, and derives every tool's input schema from the method contract, so there is no protocol code to write: the work is choosing which methods an outsider should see and describing them well enough for a stranger to use correctly. Cheap to add to an app that already has methods, and it puts the app inside the tools its users already work in.
when: Before authoring `src/interfaces/mcp.md` or deciding which of the app's methods an external agent gets to see.
---

# Building MCP Interfaces

Guidance for exposing an app as an MCP server — a tool / resource / prompt surface for *external* AI agents (Claude Desktop, Cursor, anyone's agent). The contract (spec format, compiled output, `interface.json`) is in the `<interfaces>` platform doc in your system prompt; this is how to author one well. Unlike the agent interface, there's no LLM, personality, or UI to design — the entire product is the descriptions and the shape of what you expose.

## The descriptions are the product

The calling agent is a stranger with no knowledge of your app. It decides what to invoke entirely from the names, descriptions, and annotations you ship. Follow the same principles as the agent interface's tool descriptions (load the `agentInterfaces` skill for those — when to use and when not, parameter guidance beyond the schema, what the tool returns) — but write them **self-contained**. An in-app agent tool can lean on the app's framing; an MCP tool can't, because the caller has no context. Spell out what an outsider wouldn't know.

What that looks like in practice — the same method, described twice:

```markdown
<!-- Weak: restates the schema, assumes the caller knows the app -->
Updates a vendor. Takes a vendorId and the fields to change.
```

```markdown
<!-- Strong: says when to call it, what an outsider can't infer, what comes back -->
Update an existing vendor's details. Call `listVendors` or `getVendor` first —
vendorId is the app's internal id, not a name, and there is no lookup by name.
Only the fields you pass are changed; omitted fields are left alone. Returns the
full updated vendor. Editors and admins only; other roles are rejected. For a
vendor that doesn't exist yet, use `createVendor`.
```

The weak one is what a schema already tells the caller. The strong one carries the three things a schema can't: the prerequisite, the partial-update semantics, and the alternative when this isn't the right tool.

## Curate — not every method is a tool

Expose what an outside agent would actually use. Skip internal helpers, admin-only methods, and batch operations. A focused set of well-described tools beats a large set of thin ones. Note role restrictions in the description — gated tools are listed but reject unauthorized calls at runtime, so set expectations rather than surfacing a raw error.

## Annotations

Annotations are machine-readable hints clients use to decide whether to auto-call a tool or ask the user first. Set them honestly:

- `readOnly` — the tool only reads, never mutates. The highest-value hint: clients auto-call reads without prompting, so set it on every pure read.
- `destructive` — the tool can delete or overwrite. Clients gate these behind confirmation.
- `idempotent` — calling twice with the same arguments has the same effect as calling once.
- `openWorld` — the tool reaches outside the app (external web/services) rather than operating only on app data.

The judgement is per tool, and getting `readOnly` right is what makes a toolset feel responsive rather than nagging:

```jsonc
"getVendor":            { "readOnly": true, "idempotent": true }
"searchVendors":        { "readOnly": true, "idempotent": true }
"updateVendor":         { "idempotent": true }   // repeatable, but it writes
"deleteVendor":         { "destructive": true, "idempotent": true }
"enrichVendorFromWeb":  { "openWorld": true }    // calls out to the internet
```

Set them honestly rather than defensively. Marking a read `destructive` to be safe means the caller's user gets a confirmation prompt for looking something up, and they will stop reading the prompts.

## Tools vs. resources

A **tool** is an action the agent *invokes*; a **resource** is data the agent *reads into context*. A read-only method can be either — expose it as a tool if the agent will call it as a step, as a resource if it's reference data the agent should pull in, and as both when both fit.

Resources are method-backed: a read invokes the method. Use a static `uri` for a fixed collection (`app://vendors`) and a `uriTemplate` when the read takes parameters (`app://vendors/{id}`, where `{id}` maps to the method's input). Keep URIs stable and human-legible.

## Prompts

Prompts are reusable, parameterized templates the server offers to clients — e.g. a "draft a vendor email" starter. Author the template body with `{{arg}}` placeholders and declare its arguments. Offer a prompt when there's a recurring task worth packaging; skip it if a tool already covers the need.

## Server instructions

The spec's intro prose becomes the server `instructions` — toolset-level guidance returned to the calling agent at connect time (its "system prompt"). Put *cross-cutting* guidance here: how the tools fit together, ordering or prerequisites ("read a vendor before updating it"), and norms that apply across the whole toolset. Keep per-tool specifics in the tool descriptions; instructions are for the toolset as a whole.

```markdown
This server exposes a procurement app. Vendors are the central record and
purchase orders reference them, so a vendor generally has to exist before
anything else is useful. Ids are internal — resolve a name to an id with a
search tool before calling anything that takes one. Search results are capped
at 50; page with the returned cursor rather than broadening the query.
```

That's four sentences doing what no individual tool description could: it explains the shape of the domain, so the calling agent's first move is a reasonable one.
