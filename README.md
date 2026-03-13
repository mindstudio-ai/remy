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

The agent core (`src/agent.ts`) is a pure async function with no UI dependencies. The TUI (`src/tui/`) is an Ink + React layer on top. This separation means the same agent logic can run inside the sandbox C&C server later — just swap the UI layer.

## Development

```bash
npm install
npm run build      # Build with tsup
npm run dev        # Watch mode
npm run typecheck  # Type check only
```

## Config

Remy shares the `~/.mindstudio/config.json` config file with `@mindstudio-ai/agent`. Running `mindstudio login` sets up credentials for both tools.

Resolution order for API key:
1. `--api-key` flag
2. `MINDSTUDIO_API_KEY` environment variable
3. `~/.mindstudio/config.json`
