# Remy

A coding agent for MindStudio apps.

Remy helps you build, modify, and debug MindStudio projects. It runs locally in your terminal or as a headless subprocess in the MindStudio sandbox. It has tools for reading/writing files, running shell commands, searching code, editing MSFM specs, and (in the sandbox) TypeScript language server integration. LLM calls are routed through the MindStudio platform for billing and model routing.

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

Remy starts an interactive session. Type a message and press Enter. The agent reads your project, makes changes, and verifies them — all in a loop.

```
$ remy
Remy v0.1.0 — MindStudio coding agent

> Add a delete method for haikus with soft-delete

  ⟡ readFile src/tables/haikus.ts
    → 12 lines
  ⟡ readFile mindstudio.json
    → 28 lines
  ⟡ writeFile src/deleteHaiku.ts
    → Created (24 lines)
  ⟡ editFile mindstudio.json
    → Updated

  Done. Created deleteHaiku method with soft-delete via deleted_at timestamp.

>
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear conversation history and start a fresh session |
| `Escape` | Cancel the current turn (while agent is running) |

### Session Persistence

Remy saves conversation history to `.remy-session.json` in the working directory after each turn. On restart, it picks up where you left off. Use `/clear` to start fresh.

## Tools

Remy's tool set depends on the project state. The sandbox server tells remy whether the project has generated code in `dist/` via the `projectHasCode` field on messages.

### Spec Tools

Available in all sandbox sessions. Used for authoring and editing MSFM specs in `src/`.

| Tool | Description |
|------|-------------|
| `readSpec` | Read a spec file with line numbers (paths must start with `src/`) |
| `writeSpec` | Create or overwrite a spec file (creates parent dirs) |
| `editSpec` | Heading-addressed edits (replace, insert, delete by heading path) |
| `addAnnotation` | Add MSFM block or inline annotations to spec content |
| `listSpecFiles` | List all files in the `src/` directory tree |
| `compile` | Trigger first code generation from spec (stub — authoring only) |
| `recompile` | Re-generate code from spec, optionally scoped (stub — iterating only) |

`editSpec` addresses locations by heading path (e.g., `"Vendors > Approval Flow"`) rather than line numbers, making edits stable across changes. Operations: `replace`, `insert_after`, `insert_before`, `delete`.

`addAnnotation` supports block annotations (`~~~...~~~`) and inline annotations (`[text]{content}`). Long inline annotations automatically use the pointer form (`[text]{#id}` + `~~~#id` block).

### Code Tools

Available when the project has generated code (`projectHasCode: true`).

| Tool | Description | Default Limit |
|------|-------------|---------------|
| `readFile` | Read a file with line numbers | 500 lines |
| `writeFile` | Create or overwrite a file (creates parent dirs) | — |
| `editFile` | Targeted string replacement (must be unique match) | — |
| `bash` | Run a shell command (30s timeout) | 500 lines output |
| `grep` | Search file contents (ripgrep with grep fallback) | 50 matches |
| `glob` | Find files by pattern | 200 files |
| `listDir` | List directory contents | — |
| `editsFinished` | Signal that file edits are complete for live preview | — |

Tools with limits accept a `maxResults` or `maxLines` parameter to override the default. Set to `0` for unlimited. Truncated results include a message indicating how many results were omitted.

### LSP Tools (sandbox only)

Available when `--lsp-url` is passed. These call the sandbox's LSP HTTP sidecar for IDE-level TypeScript intelligence.

| Tool | Description |
|------|-------------|
| `diagnostics` | Type errors and warnings for a file |
| `definition` | Go to definition of a symbol at a position |
| `references` | Find all usages of a symbol |
| `hover` | Get type signature and documentation |
| `symbols` | File outline (functions, classes, types with line numbers) |

### Tool Availability by Phase

| Phase | Spec Tools | Code Tools | Compile/Recompile |
|-------|-----------|------------|-------------------|
| Authoring (`projectHasCode: false`) | All | — | `compile` |
| Iterating (`projectHasCode: true`) | All | All | `recompile` |

## Architecture

```
User input
  → Agent loop (src/agent.ts)
    → POST /_internal/v2/agent/chat (SSE stream)
      ← text, thinking, tool_use events
    → Execute tools locally in parallel
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
  api.ts                 SSE streaming to platform API
  prompt/
    index.ts             System prompt builder (phase-aware)
  session.ts             .remy-session.json persistence
  config.ts              API key/URL resolution
  logger.ts              Structured logging
  headless.ts            stdin/stdout JSON protocol
  tui/                   Interactive terminal UI (Ink + React)
    App.tsx
    InputPrompt.tsx
    MessageList.tsx
    ThinkingBlock.tsx
    ToolCall.tsx
  tools/
    index.ts             Tool registry: getTools(projectHasCode)
    _helpers/
      diff.ts            Unified diff generator
    spec/                Spec tools (MSFM editing)
      _helpers.ts        Heading resolution, path validation
      readSpec.ts
      writeSpec.ts
      editSpec.ts
      addAnnotation.ts
      listSpecFiles.ts
      compile.ts
      recompile.ts
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
      lsp.ts
```

### Project Instructions

Remy automatically detects and loads project-level agent instructions on startup. It checks for these files in order (first match wins):

`CLAUDE.md`, `.claude/instructions.md`, `AGENTS.md`, `.agents.md`, `COPILOT.md`, `.copilot-instructions.md`, `.github/copilot-instructions.md`, `REMY.md`, `.cursorrules`

## Headless Mode

Run `remy --headless` for programmatic control via newline-delimited JSON. This is how the sandbox C&C server runs remy as a managed child process.

### Input Actions (stdin)

Send JSON commands, one per line.

#### `message`

Send a user message to the agent. The agent processes it and streams events back.

```json
{"action": "message", "text": "fix the bug in auth.ts"}
```

Include `projectHasCode` to control the agent's tool set and prompt:

```json
{"action": "message", "text": "add a vendors section", "projectHasCode": false}
```

- `projectHasCode: false` — spec tools only (authoring phase, no code in `dist/` yet)
- `projectHasCode: true` — spec tools + code tools (iterating phase, code exists)
- Omitted — defaults to `true` (all tools available)

Optionally include file attachments:

```json
{
  "action": "message",
  "text": "here's the design spec",
  "projectHasCode": false,
  "attachments": [
    { "url": "https://files.example.com/spec.pdf", "extractedTextUrl": "https://files.example.com/spec.txt" }
  ]
}
```

Returns an error if the agent is already processing a message.

#### `get_history`

Return the full conversation history. This is the raw LLM-level message array — the same format persisted in `.remy-session.json`. Use this to hydrate a frontend on reconnect without tracking history separately.

```json
{"action": "get_history"}
```

Response:
```json
{"event": "history", "messages": [
  {"role": "user", "content": "add a created_at field"},
  {"role": "assistant", "content": "I'll update the table schema.", "toolCalls": [{"id": "tc_1", "name": "editFile", "input": {...}}]},
  {"role": "user", "content": "Updated dist/backend/src/tables/haikus.ts", "toolCallId": "tc_1"}
]}
```

Messages include `toolCalls` on assistant messages and `toolCallId`/`isToolError` on tool result messages. Safe to call while a turn is running — returns the history accumulated so far.

#### `cancel`

Cancel the current turn. Aborts the SSE stream and skips pending tool execution. Any partial assistant response is saved to the session with a `(cancelled)` marker.

```json
{"action": "cancel"}
```

Emits `{"event": "turn_cancelled"}` when the turn is stopped. Silently ignored if no turn is running.

#### `clear`

Clear conversation history and delete the session file. Starts a fresh session.

```json
{"action": "clear"}
```

Emits `{"event": "session_cleared"}` on success.

### Output Events (stdout)

Events are emitted as newline-delimited JSON.

#### Lifecycle Events

| Event | Fields | Description |
|-------|--------|-------------|
| `ready` | | Headless mode initialized, ready for input |
| `session_restored` | `messageCount` | Previous session loaded from `.remy-session.json` |
| `session_cleared` | | Session history cleared |
| `turn_cancelled` | | Current turn was cancelled |
| `stopping` | | Shutdown initiated (stdin closed or signal received) |
| `stopped` | | Shutdown complete |

#### Agent Events (streamed during message processing)

| Event | Fields | Description |
|-------|--------|-------------|
| `text` | `text` | Streaming text chunk from the agent |
| `thinking` | `text` | Agent's internal reasoning (streaming chunks) |
| `tool_start` | `id`, `name`, `input` | Tool execution started |
| `tool_done` | `id`, `name`, `result`, `isError` | Tool execution completed |
| `turn_done` | | Agent finished responding to a message |
| `error` | `error` | Error message |

### Example Session

```json
← {"event": "ready"}
← {"event": "session_restored", "messageCount": 12}
→ {"action": "message", "text": "add a vendors section to the spec", "projectHasCode": false}
← {"event": "thinking", "text": "Let me read the current spec..."}
← {"event": "tool_start", "id": "tc_1", "name": "readSpec", "input": {"path": "src/app.md"}}
← {"event": "tool_done", "id": "tc_1", "name": "readSpec", "result": "...", "isError": false}
← {"event": "tool_start", "id": "tc_2", "name": "editSpec", "input": {"path": "src/app.md", "edits": [{"heading": "Invoices", "operation": "insert_after", "content": "## Vendors\n\n..."}]}}
← {"event": "tool_done", "id": "tc_2", "name": "editSpec", "result": "--- src/app.md\n+++ src/app.md\n...", "isError": false}
← {"event": "text", "text": "Added a Vendors section after Invoices with onboarding workflow and approval flow."}
← {"event": "turn_done"}
→ {"action": "clear"}
← {"event": "session_cleared"}
```

`→` = stdin (parent → remy), `←` = stdout (remy → parent)

### Logging

In headless mode, structured logs are written to **stderr** at `info` level by default. Stdout is reserved for the JSON protocol. The parent process can capture stderr for debugging:

```javascript
const remy = spawn('remy', ['--headless', '--log-level', 'debug'], {
  cwd: '/path/to/project',
  stdio: ['pipe', 'pipe', 'pipe'],
});

// JSON events from stdout
remy.stdout.on('data', handleEvents);

// Logs from stderr
remy.stderr.on('data', (chunk) => {
  console.error('[remy]', chunk.toString().trimEnd());
});
```

Log levels: `error`, `warn`, `info`, `debug`. At `info` you get request/response timing, token usage, config resolution, and tool execution counts. At `debug` you get individual tool timings, LSP requests, and config file details.

In interactive mode, logs go to `.remy-debug.log` in the working directory (default level: `error`). Override with `--log-level`:

```bash
remy --log-level debug   # writes verbose logs to .remy-debug.log
```

### Programmatic API

Import the headless mode directly as a library:

```typescript
import { startHeadless } from 'remy';

await startHeadless({
  apiKey: 'sk...',
  baseUrl: 'https://api.mindstudio.ai',
  model: 'my-model',
  lspUrl: 'http://localhost:4388',
});
```

### Spawning from a Parent Process

```javascript
const remy = spawn('remy', ['--headless'], {
  cwd: '/path/to/project',
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Send a message with project phase
remy.stdin.write(JSON.stringify({
  action: 'message',
  text: 'add a vendors section',
  projectHasCode: false,
}) + '\n');

// Clear session
remy.stdin.write(JSON.stringify({ action: 'clear' }) + '\n');

// Read events
let buffer = '';
remy.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const event = JSON.parse(buffer.slice(0, idx));
    buffer = buffer.slice(idx + 1);
    console.log(event);
  }
});
```

## Development

```bash
npm install
npm run build         # Build with tsup
npm run dev           # Watch mode
npm run typecheck     # Type check only
npm run local-update  # Build + npm link for local testing
```

## Config

Remy reads credentials from `~/.mindstudio-local-tunnel/config.json`, using the active environment's `apiKey` and `apiBaseUrl`.

Resolution order for API key:
1. `--api-key` flag
2. `MINDSTUDIO_API_KEY` environment variable
3. `~/.mindstudio-local-tunnel/config.json` (active environment)
