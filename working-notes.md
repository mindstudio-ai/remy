# Remy — Working Notes

## Spec-Driven Development Lifecycle

MindStudio apps follow a spec ↔ code feedback loop:

```
Write Specs (src/)
  → AI Compiles to Code (dist/)
  → git push
  → Platform Builds & Deploys
  → Iterate: edit specs or code directly
  → Capture decisions back into specs
```

The source of truth shifts depending on the mode. Remy needs to understand this loop and behave accordingly.

## Three Modes of Work

### Spec Mode
- User is working in `src/`, discussing features, writing MSFM markdown.
- Agent should think in terms of requirements, annotations, and ambiguity resolution.
- Agent should NOT jump to writing code.
- Key behavior: resolve ambiguity proactively. When a user writes "three approval stages", the agent should ask or decide: sequential or parallel? who gets notified? what happens on rejection? Then capture those decisions as MSFM annotations.

### Build Mode
- Specs exist in `src/`, code needs to be generated/updated in `dist/`.
- Agent is making concrete implementation decisions (field names, types, enum values, edge case handling).
- Non-obvious decisions should be captured as annotations back in the spec.
- Same spec + annotations = same code every build (deterministic compilation).

### Code Mode
- User is tweaking `dist/` directly — fixing bugs, adjusting UI, performance.
- Agent should note when a code change implies a spec drift and suggest updating the spec to match.
- After fixing a bug, check if the bug reveals a gap in the spec.

Mode detection is based on context, not explicit user selection. Look at what files the user is asking about and what they're trying to do. Don't enforce modes — users should freely jump between spec editing and code editing.

## Bidirectional Spec-Code Awareness

- When editing code in `dist/`, check if there's a corresponding spec in `src/` and consider whether it needs updating.
- When editing a spec, understand what code will be affected.
- After making a non-trivial code change, proactively suggest updating the spec.
- Read `mindstudio.json` on startup to understand the project structure.

## MSFM Format

MindStudio-Flavored Markdown — the spec format. Key syntax:

- **Block annotations** (`~~~...~~~`) — attach context/decisions to paragraphs
- **Inline annotations** (`[text]{content}`) — clarify specific words inline
- **Pointers** (`[text]{#id}` → `~~~#id`) — reference shared concepts

Annotations are prose, not typed or structured. They resolve ambiguity so specs compile deterministically. As LLMs improve, fewer annotations will be needed.

## Decision Capture

The most important feedback loop: implementation decisions should flow back into specs.

- First compile picks concrete names, types, values.
- These should be written back into specs (as annotations or updated prose).
- Future compiles reproduce the same code.
- The agent should suggest annotation updates — not auto-modify specs without user awareness.

## Project Structure

```
my-app/
  mindstudio.json          — manifest (roles, tables, methods, interfaces)
  src/                     — SPECS (natural language MSFM, no code)
    app.md                 — backend contract
    references/            — source material (PDFs, notes)
    interfaces/
      @brand/              — voice, visual identity, assets
      web.md               — web UI spec
      cron.md              — scheduled job specs
  dist/                    — COMPILED OUTPUT (TypeScript + configs)
    backend/
      src/
        tables/            — one file per table
        common/            — shared helpers
        *.ts               — method handlers
      package.json
    interfaces/
      web/                 — React SPA (Vite)
      cron.json            — cron config
      *.json               — other interface configs
```

When creating new methods or tables, also update `mindstudio.json` to register them.

## System Prompt Structure (Planned)

```
1. Base agent instructions (general coding best practices — done)
2. MindStudio platform knowledge
   - Project structure (src/ vs dist/, mindstudio.json)
   - MSFM format spec
   - SDK reference (db, auth, interface)
   - Build pipeline awareness
3. Mode detection guidance
4. Decision capture rules
```

## Tool Ideas

- **readSpec** — given a method or table name, find and return the relevant section of the MSFM spec. Saves grepping through src/app.md.
- Manifest-aware file creation — when creating a new method or table, auto-update mindstudio.json.

## Key Principles

- Don't use separate agents per mode — modern LLMs handle this with good prompting.
- Don't auto-generate specs from code — too error-prone. Suggest updates, let user approve.
- Don't enforce modes — detect them from context and adjust behavior.
- The difference between a good coding agent and an exceptional one is lifecycle awareness.
