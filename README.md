# Remy

A spec-building and coding agent for MindStudio apps.

Remy helps users design, spec, build, and iterate on MindStudio projects. It runs locally in a terminal or as a headless subprocess in the MindStudio sandbox. It has tools for reading/writing specs and code, running shell commands, searching code, prompting users with structured forms, and (in the sandbox) TypeScript language server integration. LLM calls are routed through the MindStudio platform for billing and model routing.

## Quick Start

```bash
# Make sure you're logged in (shares credentials with @mindstudio-ai/agent)
mindstudio login

# Navigate to your project
cd my-mindstudio-app

# Run remy
npx remy
```

## Usage

```
$ remy [options]

Options:
  --api-key <key>    API key (overrides env/config)
  --base-url <url>   Platform API base URL
  --model <id>       Model ID (defaults to org's default model)
  --headless         Run in headless mode (stdin/stdout JSON protocol)
  --lsp-url <url>    LSP sidecar URL (enables LSP tools when set)
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear conversation history and start a fresh session |
| `Escape` | Cancel the current turn (while agent is running) |

### Session Persistence

Remy saves conversation history to `.remy-session.json` in the working directory after each turn and before blocking on external tools. On restart, it picks up where you left off. Use `/clear` to start fresh.

## Tools

Remy's tool set depends on the project state. The sandbox tells remy whether the project has generated code in `dist/` via the `projectHasCode` field on messages.

### Always Available

| Tool | Description |
|------|-------------|
| `setViewMode` | Switch the IDE view (intake, preview, spec, code, databases, scenarios, logs) |
| `promptUser` | Ask the user structured questions (form or inline display) |
| `clearSyncStatus` | Clear sync flags after syncing spec and code |

### Spec Tools

Available in all sessions. Used for authoring and editing MSFM specs in `src/`.

| Tool | Description |
|------|-------------|
| `readSpec` | Read a spec file with line numbers (paths must start with `src/`) |
| `writeSpec` | Create or overwrite a spec file (creates parent dirs) |
| `editSpec` | Heading-addressed edits (replace, insert, delete by heading path) |
| `listSpecFiles` | List all files in the `src/` directory tree |

### Code Tools

Available when the project has generated code (`projectHasCode: true`).

| Tool | Description |
|------|-------------|
| `readFile` | Read a file with line numbers |
| `writeFile` | Create or overwrite a file (creates parent dirs) |
| `editFile` | Targeted string replacement (must be unique match) |
| `bash` | Run a shell command |
| `grep` | Search file contents |
| `glob` | Find files by pattern |
| `listDir` | List directory contents |
| `editsFinished` | Signal that file edits are complete for live preview |

### LSP Tools (sandbox only)

Available when `--lsp-url` is passed.

| Tool | Description |
|------|-------------|
| `lspDiagnostics` | Type errors and warnings for a file, with suggested quick fixes |
| `restartProcess` | Restart a managed sandbox process (e.g., dev server after npm install) |

### Sync Tools (sync turns only)

Available when the sandbox sends a `runCommand: "sync"` message.

| Tool | Description |
|------|-------------|
| `presentSyncPlan` | Present a markdown sync plan to the user for approval (streams content) |

### Tool Streaming

Tools can opt into streaming via a `streaming` config on the tool definition:

- **Content streaming** (writeSpec, writeFile, presentSyncPlan): Streams `tool_input_delta` events with progressive content as the LLM generates tool arguments. Tools can provide a `transform` function to customize the streamed output (e.g., writeSpec/writeFile compute a progressive diff).
- **Input streaming** (promptUser): Streams progressive `tool_start` events with `partial: true` as structured input (like a questions array) builds up.
- **No streaming** (all other tools): `tool_start` fires once when the complete tool arguments are available.

Streaming is driven by `tool_input_delta` (Anthropic) or `tool_input_args` (Gemini) SSE events from the platform.

## Architecture

```
User input
  → Agent loop (src/agent.ts)
    → POST /_internal/v2/agent/chat (SSE stream)
      ← text, thinking, tool_input_delta, tool_input_args, tool_use events
    → Execute tools locally in parallel
      → External tools (promptUser, setViewMode, etc.) wait for sandbox response
    → Send tool results back
    → Loop until done
    → Save session to .remy-session.json
```

The agent core (`src/agent.ts`) is a pure async function with no UI dependencies. The TUI (`src/tui/`) is an Ink + React layer on top. Headless mode (`src/headless.ts`) provides the same agent over a stdin/stdout JSON protocol for the sandbox.

### Project Structure

```
src/
  index.tsx              CLI entry point
  agent.ts               Core tool-call loop (pure async, no UI)
  api.ts                 SSE streaming client for platform API
  parsePartialJson.ts    Partial JSON parser for streaming tool input
  session.ts             .remy-session.json persistence
  config.ts              API key/URL resolution
  logger.ts              Structured logging
  headless.ts            stdin/stdout JSON protocol for sandbox

  prompt/
    index.ts             System prompt builder (mode-aware)
    actions/             Built-in prompts for runCommand actions
      sync.md
    static/              Behavioral instruction fragments
      identity.md
      intake.md
      authoring.md
      instructions.md
      lsp.md
      projectContext.ts  Reads manifest, spec metadata, file listing at runtime
    compiled/            Platform docs distilled for agent consumption
    sources/             Raw source docs (fetched + manual)

  tools/
    index.ts             Tool registry with streaming config interface
    _helpers/
      diff.ts            Unified diff generator
      lsp.ts             LSP sidecar HTTP client
    spec/                Spec and external tools
      readSpec.ts
      writeSpec.ts
      editSpec.ts
      listSpecFiles.ts
      setViewMode.ts
      promptUser.ts
      clearSyncStatus.ts
      presentSyncPlan.ts
      _helpers.ts        Heading resolution, path validation
    code/                Code tools (file editing, shell, search)
      readFile.ts
      writeFile.ts
      editFile/
        index.ts
        _helpers.ts
      bash.ts
      grep.ts
      glob.ts
      listDir.ts
      editsFinished.ts
      lspDiagnostics.ts
      restartProcess.ts

  tui/                   Interactive terminal UI (Ink + React)
    App.tsx
    InputPrompt.tsx
    MessageList.tsx
    ThinkingBlock.tsx
    ToolCall.tsx
```

### External Tools

Some tools are resolved by the sandbox rather than executed locally. Remy emits `tool_start`, then waits for the sandbox to send back a `tool_result` via stdin. This is used for tools that require sandbox/user interaction:

- `promptUser` — renders a form or inline prompt, blocks until user responds
- `setViewMode` — switches the IDE view mode
- `clearSyncStatus` — clears sync dirty flags and updates git sync ref
- `presentSyncPlan` — renders a full-screen markdown plan for user approval

### Project Instructions

Remy automatically loads project-level agent instructions on startup. It checks for these files in order (first match wins):

`CLAUDE.md`, `claude.md`, `.claude/instructions.md`, `AGENTS.md`, `agents.md`, `.agents.md`, `COPILOT.md`, `copilot.md`, `.copilot-instructions.md`, `.github/copilot-instructions.md`, `REMY.md`, `remy.md`, `.cursorrules`, `.cursorules`

## Headless Mode

Run `remy --headless` for programmatic control via newline-delimited JSON. This is how the sandbox C&C server runs remy as a managed child process.

### Input Actions (stdin)

Send JSON commands, one per line.

#### `message`

Send a user message to the agent.

```json
{"action": "message", "text": "fix the bug in auth.ts", "projectHasCode": true}
```

Fields:
- `text` — the user message (required unless `runCommand` is set)
- `projectHasCode` — controls tool availability (default: `true`)
- `viewContext` — `{ mode, openFiles?, activeFile? }` for prompt context
- `attachments` — array of `{ url, extractedTextUrl? }` for file attachments
- `runCommand` — triggers a built-in action prompt (e.g., `"sync"`)

When `runCommand` is set, the message text is replaced with a built-in prompt and the user message is marked as `hidden` in conversation history (sent to the LLM but not shown in the UI).

#### `tool_result`

Send the result of an external tool back to the agent.

```json
{"action": "tool_result", "id": "toolu_abc123", "result": "ok"}
```

#### `get_history`

Return the full conversation history.

```json
{"action": "get_history"}
```

Messages with `hidden: true` were generated by `runCommand` actions and should not be displayed in the UI.

#### `cancel`

Cancel the current turn.

```json
{"action": "cancel"}
```

#### `clear`

Clear conversation history and delete the session file.

```json
{"action": "clear"}
```

### Output Events (stdout)

Events are emitted as newline-delimited JSON.

#### Lifecycle Events

| Event | Fields | Description |
|-------|--------|-------------|
| `ready` | | Headless mode initialized, ready for input |
| `session_restored` | `messageCount` | Previous session loaded |
| `session_cleared` | | Session history cleared |
| `stopping` | | Shutdown initiated |
| `stopped` | | Shutdown complete |

#### Agent Events (streamed during message processing)

| Event | Fields | Description |
|-------|--------|-------------|
| `turn_started` | | Agent began processing a message |
| `text` | `text` | Streaming text chunk |
| `thinking` | `text` | Agent's internal reasoning |
| `tool_start` | `id`, `name`, `input`, `partial?` | Tool execution started. `partial: true` means more `tool_start` events will follow for this id (progressive input streaming). |
| `tool_input_delta` | `id`, `name`, `result` | Progressive tool content (streaming tools only) |
| `tool_done` | `id`, `name`, `result`, `isError` | Tool execution completed |
| `turn_done` | | Agent finished responding |
| `turn_cancelled` | | Turn was cancelled |
| `error` | `error` | Error message |
| `history` | `messages` | Response to `get_history` |

### Logging

In headless mode, structured logs go to **stderr**. Stdout is reserved for the JSON protocol. Log levels: `error`, `warn`, `info`, `debug`.

In interactive mode, logs go to `.remy-debug.log` in the working directory (default level: `error`). Override with `--log-level`.

## Development

```bash
npm install
npm run build         # Build with tsup
npm run dev           # Watch mode
npm run typecheck     # Type check only
```

## Config

Remy reads credentials from `~/.mindstudio-local-tunnel/config.json`, using the active environment's `apiKey` and `apiBaseUrl`.

Resolution order for API key:
1. `--api-key` flag
2. `MINDSTUDIO_API_KEY` environment variable
3. `~/.mindstudio-local-tunnel/config.json` (active environment)
