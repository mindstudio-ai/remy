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

Tool availability depends on the project's onboarding state, sent by the sandbox on each message.

### Common Tools (all onboarding states)

| Tool | Description |
|------|-------------|
| `setProjectOnboardingState` | Advance the onboarding flow (intake → initialSpecReview → initialCodegen → onboardingFinished) |
| `setProjectName` | Set the project name |
| `promptUser` | Ask the user structured questions (form or inline display) |
| `confirmDestructiveAction` | Confirm a destructive or irreversible action with the user |
| `askMindStudioSdk` | MindStudio SDK expert — answers questions about actions, models, connectors, and configuration (sub-agent) |
| `fetchUrl` | Fetch a URL and return its contents |
| `searchGoogle` | Search Google and return results |
| `visualDesignExpert` | Visual design expert for fonts, colors, palettes, gradients, layouts, imagery, and icons (sub-agent) |
| `productVision` | Owns the product roadmap — creates/updates/deletes roadmap items in `src/roadmap/` (sub-agent) |
| `codeSanityCheck` | Quick readonly sanity check on architecture and package choices before building (sub-agent) |

### Spec Tools

Available in all onboarding states. Used for authoring and editing MSFM specs in `src/`.

| Tool | Description |
|------|-------------|
| `readSpec` | Read a spec file with line numbers (paths must start with `src/`) |
| `writeSpec` | Create or overwrite a spec file (creates parent dirs) |
| `editSpec` | Heading-addressed edits (replace, insert, delete by heading path) |
| `listSpecFiles` | List all files in the `src/` directory tree |

### Code Tools

Available from `initialCodegen` onward.

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
| `runScenario` | Run a scenario to seed the dev database with test data |
| `runMethod` | Run a method in the dev environment and return the result |
| `screenshot` | Capture a screenshot of the app preview and get a description of what's on screen |
| `runAutomatedBrowserTest` | Run an automated browser test against the live preview with DOM snapshots and interaction execution (sub-agent) |

### LSP Tools (sandbox only)

Available when `--lsp-url` is passed.

| Tool | Description |
|------|-------------|
| `lspDiagnostics` | Type errors and warnings for a file, with suggested quick fixes |
| `restartProcess` | Restart a managed sandbox process (e.g., dev server after npm install) |

### Post-Onboarding Tools

Available only when `onboardingState` is `onboardingFinished`.

| Tool | Description |
|------|-------------|
| `clearSyncStatus` | Clear sync flags after syncing spec and code |
| `presentSyncPlan` | Present a markdown sync plan to the user for approval (streams content) |
| `presentPublishPlan` | Present a publish changelog for user approval (streams content) |
| `presentPlan` | Present an implementation plan for user approval (streams content) |

### Tool Streaming

Tools can opt into streaming via a `streaming` config on the tool definition:

- **Content streaming** (writeSpec, writeFile, presentSyncPlan, presentPublishPlan, presentPlan): Streams `tool_input_delta` events with progressive content as the LLM generates tool arguments. Tools can provide a `transform` function to customize the streamed output (e.g., writeSpec/writeFile compute a progressive diff).
- **Input streaming** (promptUser): Streams progressive `tool_start` events with `partial: true` as structured input (like a questions array) builds up.
- **No streaming** (all other tools): `tool_start` fires once when the complete tool arguments are available.

Streaming is driven by `tool_input_delta` (Anthropic) or `tool_input_args` (Gemini) SSE events from the platform.

## Architecture

```
User input
  → Agent loop (src/agent.ts)
    → POST /_internal/v2/agent/remy/chat (SSE stream)
      ← text, thinking, tool_input_delta, tool_input_args, tool_use events
    → Execute tools locally in parallel
      → External tools wait for sandbox response
      → Sub-agent tools run their own nested LLM loops
    → Send tool results back
    → Loop until done
    → Save session to .remy-session.json
```

The agent core (`src/agent.ts`) is a pure async function with no UI dependencies. The TUI (`src/tui/`) is an Ink + React layer on top. Headless mode (`src/headless.ts`) provides the same agent over a stdin/stdout JSON protocol for the sandbox.

### Sub-Agents

Some tools are backed by sub-agents — they run their own nested LLM loops with specialized system prompts and tool subsets. Sub-agent events are tagged with `parentToolId` so the caller can associate them with the parent tool call.

| Sub-Agent | Tool Name | Location |
|-----------|-----------|----------|
| SDK Consultant | `askMindStudioSdk` | `src/subagents/sdkConsultant/` |
| Design Expert | `visualDesignExpert` | `src/subagents/designExpert/` |
| Product Vision | `productVision` | `src/subagents/productVision/` |
| Code Sanity Check | `codeSanityCheck` | `src/subagents/codeSanityCheck/` |
| Browser Automation | `runAutomatedBrowserTest` | `src/subagents/browserAutomation/` |

### External Tools

Some tools are resolved by the sandbox rather than executed locally. Remy emits `tool_start`, then waits for the sandbox to send back a `tool_result` via stdin:

- `promptUser` — renders a form or inline prompt, blocks until user responds
- `setProjectOnboardingState` — advances the onboarding flow
- `setProjectName` — sets the project name
- `confirmDestructiveAction` — renders a confirmation dialog
- `clearSyncStatus` — clears sync dirty flags and updates git sync ref
- `presentSyncPlan` — renders a full-screen markdown plan for user approval
- `presentPublishPlan` — renders a full-screen changelog for user approval
- `presentPlan` — renders a full-screen implementation plan for user approval

### Project Structure

```
src/
  index.tsx              CLI entry point
  agent.ts               Core tool-call loop (pure async, no UI)
  api.ts                 SSE streaming client for platform API
  types.ts               Shared types (AgentEvent, StdinCommand, etc.)
  headless.ts            stdin/stdout JSON protocol for sandbox
  session.ts             .remy-session.json persistence
  config.ts              API key/URL resolution
  errors.ts              Friendly error message mapping
  statusWatcher.ts       Background status label polling
  parsePartialJson.ts    Partial JSON parser for streaming tool input
  logger.ts              Structured logging

  prompt/
    index.ts             System prompt builder (onboarding-state-aware)
    actions/             Built-in prompts for runCommand actions
      sync.md
      publish.md
      buildFromInitialSpec.md
    static/              Behavioral instruction fragments
      identity.md
      intake.md
      authoring.md
      coding.md
      instructions.md
      team.md
      lsp.md
      projectContext.ts  Reads manifest, spec metadata, file listing at runtime
    compiled/            Platform docs distilled for agent consumption
    sources/             Prompt source material (hand-maintained)

  tools/
    index.ts             Tool registry with streaming config interface
    _helpers/
      diff.ts            Unified diff generator
      lsp.ts             LSP sidecar HTTP client
    common/              Always-available tools
      promptUser.ts
      confirmDestructiveAction.ts
      setProjectOnboardingState.ts
      setProjectName.ts
      fetchUrl.ts
      searchGoogle.ts
    spec/                Spec tools
      readSpec.ts
      writeSpec.ts
      editSpec.ts
      listSpecFiles.ts
      clearSyncStatus.ts
      presentSyncPlan.ts
      presentPublishPlan.ts
      presentPlan.ts
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
      runScenario.ts
      runMethod.ts
      screenshot.ts
      lspDiagnostics.ts
      restartProcess.ts

  subagents/
    runner.ts            Sub-agent LLM loop runner
    sdkConsultant/       MindStudio SDK expert
    designExpert/        Visual design expert
    productVision/       Product roadmap manager
    codeSanityCheck/     Architecture sanity checker
    browserAutomation/   Automated browser testing

  tui/                   Interactive terminal UI (Ink + React)
    App.tsx
    InputPrompt.tsx
    MessageList.tsx
    ThinkingBlock.tsx
    ToolCall.tsx
```

### Project Instructions

Remy automatically loads project-level agent instructions on startup. It checks for these files in order (first match wins):

`CLAUDE.md`, `claude.md`, `.claude/instructions.md`, `AGENTS.md`, `agents.md`, `.agents.md`, `COPILOT.md`, `copilot.md`, `.copilot-instructions.md`, `.github/copilot-instructions.md`, `REMY.md`, `remy.md`, `.cursorrules`, `.cursorules`

## Headless Mode

Run `remy --headless` for programmatic control via newline-delimited JSON. This is how the sandbox C&C server runs remy as a managed child process.

### Protocol Overview

The headless IPC protocol uses request correlation and a unified response pattern:

- Every stdin command includes a caller-provided `requestId`
- Every stdout response to a command includes the same `requestId`
- System events (lifecycle, shutdown) never have a `requestId`
- Every command ends with exactly one `completed` event: `{event:"completed", requestId, success, error?}`
- The caller distinguishes command responses from system events with a single check: `if (msg.requestId)`

This enables a simple promise-based RPC layer: send a command with a unique ID, store a pending promise keyed by that ID, resolve it when you see `completed` with the matching ID.

### Input Actions (stdin)

Send JSON commands, one per line. Every command should include a `requestId`.

#### `message`

Send a user message to the agent.

```json
{"action": "message", "requestId": "r1", "text": "fix the bug in auth.ts", "onboardingState": "onboardingFinished"}
```

Fields:
- `requestId` — caller-provided correlation ID (echoed on all response events)
- `text` — the user message (required unless `runCommand` is set)
- `onboardingState` — controls tool availability and prompt context. One of: `intake`, `initialSpecAuthoring`, `initialCodegen`, `onboardingFinished` (default: `onboardingFinished`)
- `viewContext` — `{ mode, openFiles?, activeFile? }` for prompt context
- `attachments` — array of `{ url, extractedTextUrl? }` for file attachments
- `runCommand` — triggers a built-in action prompt (`"sync"`, `"publish"`, `"buildFromInitialSpec"`)

When `runCommand` is set, the message text is replaced with a built-in prompt and the user message is marked as `hidden` in conversation history (sent to the LLM but not shown in the UI).

#### `tool_result`

Send the result of an external tool back to the agent. Fire-and-forget — no `completed` event is emitted.

```json
{"action": "tool_result", "id": "toolu_abc123", "result": "ok"}
```

#### `get_history`

Return the full conversation history.

```json
{"action": "get_history", "requestId": "r2"}
```

Messages with `hidden: true` were generated by `runCommand` actions and should not be displayed in the UI.

#### `cancel`

Cancel the current turn. The cancel command gets `completed(success:true)`. The in-flight message command (if any) gets its own `completed(success:false, error:"cancelled")`.

```json
{"action": "cancel", "requestId": "r3"}
```

#### `clear`

Clear conversation history and delete the session file.

```json
{"action": "clear", "requestId": "r4"}
```

### Output Events (stdout)

Events are emitted as newline-delimited JSON. Command responses include `requestId`; system events do not.

#### System Events

| Event | Fields | Description |
|-------|--------|-------------|
| `ready` | | Headless mode initialized, ready for input |
| `session_restored` | `messageCount` | Previous session loaded |
| `stopping` | | Shutdown initiated |
| `stopped` | | Shutdown complete |

#### Command Responses

All command responses include the `requestId` from the originating command.

| Event | Fields | Description |
|-------|--------|-------------|
| `text` | `text`, `parentToolId?` | Streaming text chunk |
| `thinking` | `text`, `parentToolId?` | Agent's internal reasoning |
| `tool_start` | `id`, `name`, `input`, `partial?`, `parentToolId?` | Tool execution started. `partial: true` means more `tool_start` events will follow for this id (progressive input streaming). |
| `tool_input_delta` | `id`, `name`, `result`, `parentToolId?` | Progressive tool content (streaming tools only) |
| `tool_done` | `id`, `name`, `result`, `isError`, `parentToolId?` | Tool execution completed |
| `status` | `message` | Contextual status label (e.g., "Writing files...") |
| `error` | `error` | Error message (may precede `completed`) |
| `history` | `messages` | Response to `get_history` |
| `session_cleared` | | Response to `clear` |
| `completed` | `success`, `error?` | Terminal event — exactly one per command |

#### Example Session

```jsonl
← {"event":"ready"}
← {"event":"session_restored","messageCount":5}
→ {"action":"message","requestId":"r1","text":"fix the login bug"}
← {"event":"thinking","requestId":"r1","text":"Let me look at the auth code..."}
← {"event":"text","requestId":"r1","text":"I'll fix the login validation."}
← {"event":"tool_start","requestId":"r1","id":"tc_1","name":"editFile","input":{"path":"auth.ts","old":"...","new":"..."}}
← {"event":"tool_done","requestId":"r1","id":"tc_1","name":"editFile","result":"OK","isError":false}
← {"event":"completed","requestId":"r1","success":true}
→ {"action":"get_history","requestId":"r2"}
← {"event":"history","requestId":"r2","messages":[...]}
← {"event":"completed","requestId":"r2","success":true}
→ {"action":"cancel","requestId":"r3"}
← {"event":"completed","requestId":"r3","success":true}
```

### Logging

In headless mode, structured logs go to **stderr**. Stdout is reserved for the JSON protocol. Log levels: `error`, `warn`, `info`, `debug`.

In interactive mode, logs go to `.remy-debug.log` in the working directory (default level: `error`). Override with `--log-level`.

## Design Data Dev Tool

A lightweight local tool for browsing and managing the design expert's font catalog and inspiration image library.

```bash
node src/subagents/designExpert/data/dev/serve.mjs
# Opens http://localhost:3333
```

Three tabs:
- **Fonts** — browse all fonts rendered in their actual typefaces, search/filter by category and source, delete
- **Pairings** — heading + body font pairings rendered live, delete
- **Inspiration** — filmstrip browser for curated design reference screenshots with analyses, add new images with auto-analyze

### Data compilation scripts

```bash
# Regenerate inspiration analyses from raw image URLs
bash src/subagents/designExpert/data/compile-inspiration.sh

# Generate typographic descriptions for all fonts from specimen images
bash src/subagents/designExpert/data/compile-font-descriptions.sh
```

### Specimen pages

For generating font specimen images (used by the font description pipeline):

- `http://localhost:3333/specimens/fonts?page=1` — paginated font specimens (40 per page)
- `http://localhost:3333/specimens/pairings?page=1` — paginated pairing specimens (33 per page)

Screenshot these as full-page PNGs, then slice into individual images with the Python script in the session history. Specimen images live in `src/subagents/designExpert/data/specimens/` and are hosted at `https://i.mscdn.ai/remy-font-specimens/`.

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
