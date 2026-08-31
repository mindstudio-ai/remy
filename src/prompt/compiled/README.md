# Compiled Prompt Fragments

This directory contains distilled prompt fragments generated from the source docs in `docs/developer-guide/` (project root). These are loaded by `../index.ts` and injected into Remy's system prompt at runtime.

## How to compile

The compilation is done manually in a session with an LLM (Claude Code or similar). Work through the source docs and compile them into prompt-ready fragments.

### Step 1: Compile with an LLM

Open a session and ask it to work through the compilation. Give it these instructions:

---

**You will compile source docs into prompt fragments for Remy, a coding agent that builds apps. The compiled fragments go in `src/prompt/compiled/` and are loaded into the agent's system prompt at runtime.**

**Work through this one source file at a time, sequentially.** For each one:
1. Read the source doc thoroughly
2. Decide whether it should become its own fragment, be merged with a related source, or be skipped entirely
3. Present your draft of the compiled fragment
4. Wait for review and feedback before moving to the next one

Do not parallelize this work. Do not generate multiple fragments at once. Each fragment deserves careful attention — these are the instructions a coding agent will follow to build real products, and mistakes here propagate into every app it builds.

Source files are in `docs/developer-guide/` at the project root.

## How to think about compilation

**Your audience is an LLM acting as a coding agent.** It needs to produce correct code, not learn concepts. Everything you write should be optimized for an agent that is actively building an app and needs to get the details right.

### What to keep

- **API signatures, parameter types, return types, and code examples.** These must be exactly right. The agent will copy these patterns directly into the code it writes. A wrong type or a missing parameter means broken code in production.
- **Concrete examples, specific error cases, explicit constraints, enumerated edge cases.** These are the highest-value content. A source doc that says "ensure data integrity, including checking for duplicate keys, null foreign references, and orphaned records" — the specific checks ARE the value. Collapsing that to "ensure data integrity" loses the actionable detail.
- **Tables and structured reference data.** Manifest fields, db predicates, interface config schemas, role API methods — these are lookup references the agent will consult while writing code. Keep them complete.
- **Rules and constraints that affect correctness.** "Only packages declared in package.json are available at runtime" is the kind of detail that prevents hard-to-debug errors.

### What to strip

- **Setup instructions, installation steps, CLI commands.** The agent isn't setting up a dev environment — it's writing code inside one.
- **Platform internals and deployment pipeline details.** How the platform builds and deploys is not the agent's concern.
- **Conceptual explanations and philosophy.** "Why" something was designed a certain way is rarely useful mid-task. Keep the "what" and "how."
- **Marketing language, feature pitches, comparative positioning.**
- **Cross-references to other docs** ("see Section X for details"). The fragment should be self-contained.

### Fragment format

```markdown
# Fragment Title

Brief one-line context.

## Section
...content...
```

No YAML frontmatter. No meta-commentary. Just the reference content the agent needs. Each fragment should make sense on its own — the agent may not see all fragments in every session.

### Fragments vs. skills

Not every fragment is resident. Docs for capabilities most apps never use live in `src/prompt/skills/` instead, and the agent loads one with the `loadSkill` tool when it needs it. Only a name and a trigger line stay in the prompt (see `src/prompt/skills/_catalog.ts`).

**What decides it is the kind of content, not the size.** Two categories behave completely differently in a resident prompt:

- **Detail** — field names, config keys, input shapes, route params, cron syntax. Expensive for the agent to hold and useless until it's writing that exact code.
- **A proposition** — "the app can receive email, here's when that matters." One idea, nearly free.

A skill is a good trade whenever it swaps detail for a proposition, whatever the byte count. `scheduledJobs` is the case to reason from: its body is smaller than its own catalog entry, so it *costs* tokens to defer — and it's still right to defer, because a cron config schema in front of the agent during a checkout build is noise either way.

The one thing size does govern is **entry count**. A long catalog recreates the problem in miniature: a list to scan instead of a schema to skim. The catalog currently holds 15 entries, which is already past the point where adding one is free — prefer folding new material into an existing skill over adding another.

**A skill can be a section of a source doc, not just a whole one.** Originally one source doc produced one fragment. `docs/developer-guide/07_interfaces.md` now fans out into a resident fragment plus seven skills, and its sections map 1:1 onto them (Web / API / Cron / Webhook / Email / MCP / Agent / Voice / manifest), so a recompile has a clear target per skill. When you split a doc this way, watch for anything defined once and used by several sections — a URL template, a shared auth rule, a manifest snippet. Those need copying into each skill, because a skill arrives alone.

A skill is authored the same way, with two differences:

- **It carries frontmatter** — `name` (human-readable label), `what` (what the capability is and how far it reaches), and `when` (the *trigger* to load it, not a summary of the contents). Keep each value on one line; the parser splits on the first `:` per line.

  Both `what` and `when` are needed, because they do different jobs. `when` is a gate: it tells the agent it may load something, but a gate can't make the agent *want* to. `what` is the argument for the capability — the thing that used to be read on every turn, back when these docs were resident. Any constraint that would change a *decision* belongs in the frontmatter rather than the body, since the body isn't read until after the decision.

  Where a capability is easy to over-reach for, keep the gate stronger than the description. `dataSources` is the case to study: its `what` is genuinely impressive about retrieval quality while its `when` stays narrow, because most apps should not use one. `taskAgents` is the inverse — its failure mode is Remy never reaching for it, so its `what` is written to persuade.
- **It has room.** The stripping rules above exist partly because a resident fragment is paying rent on every turn. A skill isn't, so it can keep detail a fragment would have to lose. When recompiling one, err toward completeness.

Self-containment matters more for a skill than for a fragment. It arrives alone, mid-task, with no guarantee the agent has read anything else. Where a skill needs another one, name it (`` load the `agentInterfaces` skill ``) rather than referring to "the X doc".

If you move a doc into `skills/`, sweep the resident fragments for what it left behind. A mention that stays should *point* ("load the `taskAgents` skill before writing one"), never *demonstrate* — a copyable example in a resident fragment is an invitation to skip the load, and the result is confidently wrong code rather than an error.

### Source → artifact map

Which source doc feeds which artifact. Recompiling an artifact means re-reading the doc in this row.

| Source doc (`docs/developer-guide/`) | Resident fragment | Skills |
|---|---|---|
| `00_overview` + `01_project-structure` | `platform.md` | — |
| `02_spec-and-msfm` | `msfm.md` | — |
| `03_manifest-reference` | `manifest.md` | — |
| `04_tables-and-database` | `tables.md` | — |
| `05_methods` | `methods.md` | — |
| `06_roles-and-auth` | `auth.md` | `auth` |
| `07_interfaces` | `interfaces.md` | `restApi`, `scheduledJobs`, `webhooks`, `inboundEmail`, `mcpInterfaces`, `agentInterfaces`, `voiceInterfaces` |
| `08_files-and-storage` | — | `files` |
| `09_data-sources` | — | `dataSources` |
| `10_secrets` | — | `secrets` |
| `11_sdk-actions` | `sdk-actions.md` | — |
| `12_task-agents` | — | `taskAgents` |
| `13_jewels` | `jewels.md` (pointer only) | `jewels` |
| `14_analytics` | folded into `interfaces.md` (web section) | — |
| `15_scenarios` | — | `scenarios` |
| `16_development-and-deployment` | `dev-and-deploy.md` | — |

**Two artifacts are intentionally source-less.** `design.md` and the `publishing` skill describe Remy's own behavior — a frontend quality bar and a release workflow — rather than platform primitives a developer building directly on the platform would need. They are maintained here, not in the developer guide. Don't read their absence from the table above as a gap to fill.

---

### Step 2: Review

Read through the compiled fragments and verify code examples are accurate. The LLM may hallucinate API details — cross-check against the source docs.

### Step 3: Commit

The compiled fragments are committed to git. They're the snapshot the agent uses at runtime.
