# Remy

A coding agent for MindStudio apps.

Remy runs locally in your terminal and helps you build, modify, and debug MindStudio projects. It has tools for reading/writing files, running shell commands, and searching code. LLM calls are routed through the MindStudio platform for billing and model routing.

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

## Tools

| Tool | Description |
|------|-------------|
| `readFile` | Read a file with line numbers |
| `writeFile` | Create or overwrite a file (creates parent dirs) |
| `editFile` | Targeted string replacement (must be unique match) |
| `bash` | Run a shell command (30s timeout) |
| `grep` | Search file contents (ripgrep with grep fallback) |
| `glob` | Find files by pattern |
| `listDir` | List directory contents |

## Architecture

```
User input
  → Agent loop (src/agent.ts)
    → POST /_internal/v2/agent/chat (SSE stream)
      ← text, thinking, tool_use events
    → Execute tools locally in parallel
    → Send tool results back
    → Loop until done
```

The agent core (`src/agent.ts`) is a pure async function with no UI dependencies. The TUI (`src/tui/`) is an Ink + React layer on top. Headless mode (`src/headless.ts`) provides the same agent over a stdin/stdout JSON protocol.

## Headless Mode

Run `remy --headless` for programmatic control via newline-delimited JSON. This is how the sandbox C&C server runs remy as a managed child process.

### Input (stdin)

Send JSON commands, one per line:

```json
{"action": "message", "text": "fix the bug in auth.ts"}
```

### Output (stdout)

Agent events are emitted as newline-delimited JSON:

```json
{"event": "ready"}
{"event": "thinking", "text": "Let me look at the auth module..."}
{"event": "text", "text": "I found the issue. "}
{"event": "tool_start", "id": "tc_1", "name": "readFile", "input": {"path": "src/auth.ts"}}
{"event": "tool_done", "id": "tc_1", "name": "readFile", "result": "...", "isError": false}
{"event": "text", "text": "Fixed the null check."}
{"event": "turn_done"}
```

| Event | Fields | Description |
|-------|--------|-------------|
| `ready` | | Headless mode initialized, ready for input |
| `text` | `text` | Streaming text chunk from the agent |
| `thinking` | `text` | Agent's thinking/reasoning |
| `tool_start` | `id`, `name`, `input` | Tool execution started |
| `tool_done` | `id`, `name`, `result`, `isError` | Tool execution completed |
| `turn_done` | | Agent finished responding to a message |
| `error` | `error` | Error message |
| `stopping` | | Shutdown initiated |
| `stopped` | | Shutdown complete |

### Programmatic API

You can also import the headless mode directly:

```typescript
import { startHeadless } from 'remy';

await startHeadless({
  apiKey: 'sk...',
  baseUrl: 'https://api.mindstudio.ai',
  model: 'my-model',
});
```

### Spawning from a parent process

```javascript
const remy = spawn('remy', ['--headless'], {
  cwd: '/path/to/project',
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Send a message
remy.stdin.write(JSON.stringify({ action: 'message', text: 'hello' }) + '\n');

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
