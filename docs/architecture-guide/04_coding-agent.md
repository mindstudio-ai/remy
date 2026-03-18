# Coding Agent (`remy`)

AI coding assistant powered by Claude. Runs a tool-use loop: receives a message, calls the LLM with tools, executes tool calls locally, sends results back, repeats until done.

In the three-layer hierarchy, the agent is the compiler — it reads the spec (`src/`) and produces the contract (`dist/`). This is the core of the "spec is the application" thesis. The agent's awareness of `mindstudio.json` and MSFM is what makes the hierarchy work in practice.

Works as a standalone CLI (interactive terminal UI) or in headless mode (JSON protocol over stdin/stdout, driven by the C&C server).

Source: `/Users/sean/Dropbox/Projects/youai/remy/src/`

---

## Agent Loop

The core algorithm (`runTurn`):

1. Add user message to conversation history
2. Stream LLM response via `POST /_internal/v2/agent/chat` (SSE)
3. Collect: assistant text, tool calls, stop reason
4. Emit events: `text`, `thinking`, `tool_start`
5. If `stopReason === 'tool_use'`:
   - Execute all tool calls **in parallel** (`Promise.all`)
   - Emit `tool_done` events
   - Append tool results to history
   - Loop back to step 2 (send updated conversation to LLM)
6. If `stopReason === 'end_turn'`:
   - Save session, emit `turn_done`, return

The full conversation history is sent to the LLM on every turn. Context accumulates across the session — the agent remembers what it's seen and done.

**Cancellation:** An AbortController is threaded through the stream and tool execution. On cancel, in-flight tool calls are abandoned and a `(cancelled)` marker is added to the conversation so the agent knows the turn was interrupted.

---

## Tools

| Tool | Description |
|------|------------|
| `readFile` | Read file content with line numbers, offset/maxLines support |
| `writeFile` | Overwrite entire file |
| `editFile` | Single string replacement (old_string must be unique) |
| `multiEdit` | Multiple replacements in one file |
| `bash` | Shell command execution, 30s timeout, 500 line output cap |
| `grep` | Pattern search via ripgrep (falls back to grep) |
| `glob` | Find files by pattern |
| `listDir` | List directory contents |
| `diagnostics` | TypeScript errors/warnings (via LSP sidecar) |
| `definition` | Go to definition (via LSP sidecar) |
| `references` | Find all references (via LSP sidecar) |
| `hover` | Get type info (via LSP sidecar) |
| `symbols` | Get file outline (via LSP sidecar) |

LSP tools are only available when `--lsp-url` is configured (always the case in the sandbox, where the C&C server runs the sidecar on port 4388).

**Why the same tools as Claude Code:** Familiar patterns, proven tool design, low learning curve for the model. The tools are simple (read, write, edit, search, run) — the intelligence is in how the LLM composes them.

---

## Standalone CLI

```bash
remy --api-key sk... --base-url https://api.mindstudio.ai
```

Interactive terminal UI (React Ink). The developer types messages, the agent responds with tool calls visible in the terminal. Session persists in `.remy-session.json` in the working directory.

**Config resolution** (priority order):
1. CLI flags (`--api-key`, `--base-url`)
2. Environment variables (`MINDSTUDIO_API_KEY`, `MINDSTUDIO_BASE_URL`)
3. Tunnel config file (`~/.mindstudio-local-tunnel/config.json`)

---

## Headless Mode

```bash
remy --headless --api-key sk... --base-url https://... --lsp-url http://localhost:4388
```

No TUI — stdout is reserved for JSON events, all logging goes to stderr. The C&C server spawns remy in this mode and communicates via stdin/stdout.

### Stdin Protocol (C&C → Agent)

```json
{ "action": "message", "text": "Add a contactPhone field to vendors" }
{ "action": "cancel" }
{ "action": "clear" }
{ "action": "get_history" }
```

### Stdout Protocol (Agent → C&C)

Newline-delimited JSON:

```json
{ "event": "ready" }
{ "event": "session_restored", "messageCount": 5 }
{ "event": "text", "text": "I'll add the field..." }
{ "event": "thinking", "text": "Let me check the table definition..." }
{ "event": "tool_start", "id": "call_1", "name": "readFile", "input": { "path": "dist/methods/src/tables/vendors.ts" } }
{ "event": "tool_done", "id": "call_1", "name": "readFile", "result": "...", "isError": false }
{ "event": "turn_done" }
{ "event": "error", "error": "..." }
{ "event": "history", "messages": [...] }
```

The C&C server maps these events to WebSocket broadcasts, so the browser sees agent activity in real-time (text streaming, tool calls appearing, cursor movements).

---

## System Prompt

Dynamically assembled from multiple sources:

1. **Base instructions** — identity ("You are Remy, a coding agent for MindStudio apps"), workflow (understand → change → verify → iterate), editing practices, search strategy
2. **LSP section** (if configured) — instructions to use LSP tools for type intelligence
3. **Agent instructions file** — first match of: `CLAUDE.md`, `.claude/instructions.md`, `AGENTS.md`, `REMY.md`, `.cursorrules`
4. **`mindstudio.json`** — full manifest JSON, giving the agent awareness of methods, tables, roles, interfaces, scenarios
5. **Project file listing** — top-level files and directories

The manifest inclusion is key — it means the agent knows the app's structure before it reads a single file. It can reason about which methods exist, what the data model looks like, and which interfaces are configured.

---

## Spec-Driven Development

The agent's awareness of MSFM specs and the `mindstudio.json` manifest enables a development workflow where:

1. A human (or the agent itself) writes or modifies a spec in `src/`
2. The agent reads the spec, understands the domain and requirements
3. The agent generates or updates the contract in `dist/` — methods, tables, interfaces — to match the spec
4. Changes are tested via the live preview and scenarios
5. The spec can be updated to reflect code changes, maintaining bidirectional consistency

This is the "spec is the application" thesis in action. The agent is the bridge between natural language intent and executable code.

---

## Session Persistence

Conversation history is saved to `.remy-session.json` in the working directory after every turn. On startup, the session is restored if the file exists.

In the sandbox, this file survives snapshots (it's part of the workspace filesystem). When a sandbox resumes, the agent has its full conversation history — it remembers what it was working on.

---

## Platform Integration

### LLM Access

All LLM calls go through `POST /_internal/v2/agent/chat` on the platform API. The agent authenticates with the org's API key. The platform handles model routing (org default or explicit model ID), billing, and provider translation.

**Why a platform endpoint instead of direct API calls:** The agent doesn't need provider SDKs, API keys, or billing logic. Switching models is a configuration change. The platform can also enforce rate limits, track usage per organization, and route to different providers without the agent knowing.

### LSP Access

In the sandbox, the C&C server runs a TypeScript language server and exposes it via an HTTP sidecar on port 4388. The agent uses this for type-aware operations — checking diagnostics before and after edits, finding definitions, navigating references.

**Why LSP multiplexing matters for the agent:** The same language server instance serves both Monaco (the editor) and remy. This means diagnostics computed for one are immediately available to the other. When the agent makes an edit, Monaco sees the diagnostics update instantly. When the human types, the agent can check the latest diagnostics.

---

## Design Rationale

**Why a separate process:** Crash isolation — if the agent crashes, the editor keeps working. Independent updates — remy can be upgraded without rebuilding the C&C server. Standalone value — the same binary works as a CLI tool outside the sandbox.

**Why spec-driven:** MSFM gives the agent business context that code alone doesn't capture. Code shows *what* the app does; the spec captures *why* — the domain rules, the user workflows, the edge cases. An agent that understands the spec can make changes that are semantically correct, not just syntactically valid.
