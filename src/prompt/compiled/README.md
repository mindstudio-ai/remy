# Compiled Prompt Fragments

This directory contains distilled prompt fragments generated from the source
docs in `../sources/`. These are loaded by `../index.ts` and injected into
Remy's system prompt at runtime.

## How to compile

The compilation is done manually in a session with an LLM (Claude Code or
similar). Run the sync script first to get fresh sources, then work through
the compilation thoughtfully.

### Step 1: Sync fetched sources

```bash
./src/prompt/sync-sources.sh
```

This pulls remote/external sources into `sources/fetched/`. Manual sources
in `sources/manual/` are maintained by hand and don't need syncing.

### Step 2: Compile with an LLM

Open a session and ask it to work through the compilation. Give it these
instructions:

---

**You will compile source docs into prompt fragments for Remy, a coding agent
that builds MindStudio apps. The compiled fragments go in `src/prompt/compiled/`
and are loaded into the agent's system prompt at runtime.**

**Work through this one source file at a time, sequentially.** For each one:
1. Read the source doc thoroughly
2. Decide whether it should become its own fragment, be merged with a related
   source, or be skipped entirely
3. Present your draft of the compiled fragment
4. Wait for review and feedback before moving to the next one

Do not parallelize this work. Do not generate multiple fragments at once. Each
fragment deserves careful attention — these are the instructions a coding agent
will follow to build real products, and mistakes here propagate into every app
it builds.

Source files are in `src/prompt/sources/fetched/` (synced from external docs)
and `src/prompt/sources/manual/` (hand-maintained).

## How to think about compilation

**Your audience is an LLM acting as a coding agent.** It needs to produce
correct code, not learn concepts. Everything you write should be optimized
for an agent that is actively building a MindStudio app and needs to get
the details right.

### What to keep

- **API signatures, parameter types, return types, and code examples.**
  These must be exactly right. The agent will copy these patterns directly
  into the code it writes. A wrong type or a missing parameter means broken
  code in production.
- **Concrete examples, specific error cases, explicit constraints, enumerated
  edge cases.** These are the highest-value content. A source doc that says
  "ensure data integrity, including checking for duplicate keys, null foreign
  references, and orphaned records" — the specific checks ARE the value.
  Collapsing that to "ensure data integrity" loses the actionable detail.
- **Tables and structured reference data.** Manifest fields, db predicates,
  interface config schemas, role API methods — these are lookup references
  the agent will consult while writing code. Keep them complete.
- **Rules and constraints that affect correctness.** "Only packages declared
  in package.json are available at runtime" is the kind of detail that
  prevents hard-to-debug errors.

### What to strip

- **Setup instructions, installation steps, CLI commands.** The agent isn't
  setting up a dev environment — it's writing code inside one.
- **Platform internals and deployment pipeline details.** How the platform
  builds and deploys is not the agent's concern.
- **Conceptual explanations and philosophy.** "Why" something was designed
  a certain way is rarely useful mid-task. Keep the "what" and "how."
- **Marketing language, feature pitches, comparative positioning.**
- **Cross-references to other docs** ("see Section X for details"). The
  fragment should be self-contained.

### How to handle manual sources

Sources in `sources/manual/` (like frontend design notes, CDN reference)
are already written in a prompt-ready style with the agent audience in mind.
They may only need light editing or can be included nearly as-is. Don't
over-distill them.

### Fragment format

```markdown
# Fragment Title

Brief one-line context.

## Section
...content...
```

No YAML frontmatter. No meta-commentary. Just the reference content the
agent needs. Each fragment should make sense on its own — the agent may
not see all fragments in every session.

---

### Step 3: Review

Read through the compiled fragments and verify code examples are accurate.
The LLM may hallucinate API details — cross-check against the source docs.

### Step 4: Commit

The compiled fragments are committed to git. They're the snapshot the agent
uses at runtime.
