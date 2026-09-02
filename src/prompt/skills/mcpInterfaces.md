---
name: MCP Interfaces
what: Ships the app as an MCP server, so external AI agents — Claude Desktop, Cursor, anyone's agent — can drive it as a tool surface. The platform hosts the server, handles auth, and derives every tool's input schema from the method contract, so there is no protocol code to write: the work is choosing which methods an outsider should see and describing them well enough for a stranger to use correctly. Cheap to add to an app that already has methods, and it puts the app inside the tools its users already work in.
when: The moment the plan wants the app reachable from Claude, Cursor, ChatGPT, or a user's own agents — load it before proposing how. Also before authoring `src/interfaces/mcp.md`, deciding which of the app's methods an external agent gets to see, or writing the MCP interface config.
---

# MCP Interfaces

Exposing an app as an MCP server — a tool / resource / prompt surface for *external* AI agents (Claude Desktop, Cursor, anyone's agent). Unlike the agent interface, which *is* an agent with its own LLM, personality and chat UI, MCP has no model of its own: it's the app projected as a server for an outside AI to drive.

It supports the full MCP surface:

- **Tools** — methods the agent can call (rich descriptions + machine-readable annotations).
- **Resources** — read-only app data the agent can pull into context, addressable by URI.
- **Prompts** — reusable, parameterized prompt templates the server offers.
- **Instructions** — server-level guidance shown to the calling agent (the toolset's "system prompt").

The platform hosts the server, handles auth, and derives every tool's input schema from the method contract. So there's no protocol code to write, and the whole job is authorship plus a config file. Authorship first, since that's what decides whether the toolset actually works.

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

The judgement is per tool, and getting `readOnly` right is what makes a toolset feel responsive rather than nagging. Abbreviated to just the annotations (a real entry also carries `name`, `title` and `description` — the Config section has the full shape):

```jsonc
"tools": [
  { "method": "get-vendor",    "annotations": { "readOnly": true, "idempotent": true } },
  { "method": "search-vendors", "annotations": { "readOnly": true, "idempotent": true } },
  { "method": "update-vendor",  "annotations": { "idempotent": true } },                      // repeatable, but it writes
  { "method": "delete-vendor",  "annotations": { "destructive": true, "idempotent": true } },
  { "method": "enrich-vendor",  "annotations": { "openWorld": true } }                        // calls out to the internet
]
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

---

# The wiring

## Spec: `src/interfaces/mcp.md`

Frontmatter declares the server. In the body, the intro prose becomes the server `instructions`, and `## Tools`, `## Resources` and `## Prompts` headings declare the rest.

```yaml
---
name: Vendor Management
description: Tools and data for managing vendors and purchase orders.
type: interface/mcp
---
```

```markdown
This server manages vendors and purchase orders. Read a vendor before updating it; submitted
requests go through approval before they become active.

## Tools

### Submit a vendor request
method: submit-vendor-request
~~~
Submit a new vendor for approval. Use when the caller wants to add a vendor.
Do NOT use to modify an existing vendor — that's update-vendor.
- name: the vendor's legal name
- contactEmail: billing contact; required for approval routing
Returns the created vendor's id and its initial "pending" status.
~~~

### List vendors
method: list-vendors
annotations: readOnly
~~~
List all vendors, newest first. Read-only.
~~~

## Resources

- list-vendors → app://vendors — "Vendors" — all vendors (application/json)
- get-vendor → app://vendors/{id} — "Vendor" — a single vendor by id (application/json)

## Prompts

### draft_vendor_email
description: Draft an outreach email to a vendor.
arguments: vendorId (required) — the vendor to contact
~~~
Write a warm outreach email to vendor {{vendorId}} introducing our procurement process.
~~~
```

Don't hand-author input schemas — the platform derives them.

## Compiled Output: `dist/interfaces/mcp/`

```
dist/interfaces/mcp/
├── interface.json      ← config the platform reads
├── instructions.md     ← server-level guidance (returned in `initialize`)
├── tools/
│   ├── submitVendorRequest.md   ← rich description, one per tool
│   └── listVendors.md
└── prompts/
    └── draftVendorEmail.md      ← prompt template body, one per prompt
```

Resources carry inline metadata only — no per-resource file.

## Config (`interface.json`)

The top-level key must match the interface type (`mcp`):

```json
{
  "mcp": {
    "name": "Vendor Management",
    "description": "Tools and data for managing vendors and purchase orders.",
    "instructions": "instructions.md",
    "tools": [
      {
        "method": "submit-vendor-request",
        "name": "submit_vendor_request",
        "title": "Submit Vendor Request",
        "description": "tools/submitVendorRequest.md",
        "annotations": { "readOnly": false, "destructive": false, "idempotent": false, "openWorld": false }
      },
      {
        "method": "list-vendors",
        "title": "List Vendors",
        "description": "tools/listVendors.md",
        "annotations": { "readOnly": true }
      }
    ],
    "resources": [
      { "method": "list-vendors", "uri": "app://vendors", "name": "Vendors", "description": "All vendors.", "mimeType": "application/json" },
      { "method": "get-vendor", "uriTemplate": "app://vendors/{id}", "name": "Vendor", "description": "A single vendor by id.", "mimeType": "application/json" }
    ],
    "prompts": [
      {
        "name": "draft_vendor_email",
        "title": "Draft vendor email",
        "description": "Draft an outreach email to a vendor.",
        "arguments": [ { "name": "vendorId", "description": "The vendor to contact", "required": true } ],
        "template": "prompts/draftVendorEmail.md"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `name`, `description` | Server display name + registry metadata (not shown to the calling agent) |
| `instructions` | Relative path to the server-level guidance returned in `initialize` |
| `tools[].method` | Method `id` from the manifest (kebab-case) |
| `tools[].name` | Tool name exposed to clients. Optional — defaults to the method `id`. Must match `[a-zA-Z0-9_-]` and be unique within the server |
| `tools[].title` | Optional human-friendly display name |
| `tools[].description` | Relative path to the tool's markdown description |
| `tools[].annotations` | The client hints from the Annotations section: `readOnly`, `destructive`, `idempotent`, `openWorld` — they map to MCP's `readOnlyHint` etc. |
| `resources[].method` | The read method invoked when the resource is read |
| `resources[].uri` / `uriTemplate` | A static URI, or a template whose `{param}` maps to the method's input |
| `resources[].name`, `description`, `mimeType` | Resource metadata |
| `prompts[].name`, `title`, `description` | Prompt identity + metadata |
| `prompts[].arguments` | `[{ name, description?, required? }]` |
| `prompts[].template` | Relative path to the template body (`{{arg}}` placeholders) |

There is no `inputSchema` field — the platform derives each tool's schema from the method's input contract.

Declare it in `mindstudio.json`:

```json
{ "type": "mcp", "path": "dist/interfaces/mcp/interface.json" }
```

## Platform Behavior

- The platform hosts the MCP server and exposes it to external clients. Clients connect at `POST https://{app-host}/_/mcp`, where `{app-host}` is any host the app is served on: its `custom_subdomain` host (e.g. `myapp.madewithremy.com`), a custom domain if configured, or the UUID host (`<appId>.madewithremy.com` / `.msagent.ai`).
- **Auth is optional.** A `Bearer` key resolves to a user with full RBAC, so the method's own `auth.requireRole(...)`/`hasRole(...)` checks apply as they would for that user. With no key, calls run anonymously — no user, no roles. The method is the boundary: gate sensitive tools, and understand that a public (keyless) server effectively exposes only the un-gated ones.
- Input schemas are derived automatically from each method's input contract.
- `tools/list` is static; access is enforced per-method at call time (a gated tool is listed but rejects an unauthorized call).
- A resource read invokes the backing method (template `{param}`s come from the URI) and returns its output as the resource contents.
- `prompts/get` fills the template with the provided arguments.
- `instructions` is returned in the `initialize` response.
