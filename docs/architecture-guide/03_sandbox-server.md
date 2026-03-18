# Sandbox C&C Server (`mindstudio-sandbox`)

Runs inside each sandbox container on a single port (4387). Orchestrates the entire hosted editor experience: file system access, process management, WebSocket protocol for the browser editor, reverse proxy for live preview, AI agent integration, TypeScript language server, and state persistence across hibernation.

The browser connects directly to the C&C server's WebSocket; the platform API is not in the editor's data path. This gives the editor the same responsiveness as a local development environment.

Source: `/Users/sean/Dropbox/Projects/youai/mindstudio-sandbox/src/`

---

## Bootstrap Sequence

Sequential, instrumented with progress broadcasts to connected clients. Each step is logged with elapsed time.

1. **Load config** — parse environment variables (`GIT_REPO_URL`, `MINDSTUDIO_API_KEY`, `USER_ID`, `API_BASE_URL`, `PORT`, `SANDBOX_TOKEN`)
2. **Create infrastructure** — BroadcastBatcher, ProcessRegistry, EditorStateManager, register system pseudo-process
3. **Start HTTP/WS server** — listen on port 4387, health endpoint returns `{ status: 'bootstrapping' }`
4. **Install tunnel & agent** — clone and build `mindstudio-local` and `remy` from GitHub, npm link globally
5. **Install LSP** — `npm install -g typescript-language-server typescript`
6. **Write tunnel config** — `~/.mindstudio-local-tunnel/config.json` with API key, user ID, environment
7. **Clone app repo** — `git clone --depth 1` into workspace dir (skips if `mindstudio.json` already exists, i.e., resuming from snapshot)
8. **Read app config** — parse `mindstudio.json`, extract methods, tables, interfaces
9. **Read web config** — find web interface, extract `devPort` (default 5173) and `devCommand` (default `npm run dev`)
10. **Install dependencies** — `npm install` in `dist/methods/` and `dist/interfaces/web/` if `package.json` exists
11. **Start processes** (concurrently):
    - Dev server (Vite or custom command)
    - Tunnel (`mindstudio-local --headless`)
    - Agent (`remy --headless`)
    - File watcher (chokidar)
    - LSP server + HTTP sidecar
12. **Mark ready** — set status to `ready`, broadcast progress

If any step fails, status is set to `error` (does not exit; clients can retry or inspect the error).

---

## Single-Port Architecture

Everything goes through port 4387. The server routes by URL path:

| Path | Protocol | Destination |
|------|----------|-------------|
| `/health` | HTTP | Direct response: `{ status, proxyTarget }` |
| `/ws` | WebSocket | C&C control channel (editor) |
| `/lsp` | WebSocket | TypeScript language server (Monaco) |
| `/*` | HTTP | Reverse proxy → tunnel proxy → dev server |
| `/*` | WebSocket | Reverse proxy → tunnel proxy (HMR) |

**Why single port:** No CORS issues, no multi-port Vercel config, simpler networking. The reverse proxy handles routing transparently; the browser doesn't know (or care) that preview traffic goes through a proxy chain.

**Proxy target discovery:** The tunnel emits a `session-started` JSON event on stdout with a `proxyPort` field. The C&C server reads this and creates the reverse proxy (`http-proxy`) targeting `http://127.0.0.1:{proxyPort}`. Until the tunnel is ready, non-C&C HTTP requests return 503 "Preview starting...".

---

## WebSocket Protocol

### Connection

WebSocket upgrade to `/ws` with `?token={SANDBOX_TOKEN}` for auth. On connection, the server sends an init frame with the full editor state:

```json
{
  "event": "init",
  "status": "ready",
  "previewAvailable": true,
  "app": { "appId", "name", "methods", "tables", "interfaces" },
  "fileTree": [ /* recursive 3-level tree */ ],
  "chatHistory": [ /* persisted agent conversation */ ],
  "processes": [ /* process snapshots */ ],
  "outputLog": [ /* last 5000 lines */ ],
  "editorState": { "tabs", "activeTab", "expandedDirs" }
}
```

### Request/Response

Client sends a request, server responds with the same `requestId`:

```json
// Client → Server
{ "requestId": "req-1", "action": "readFile", "params": { "path": "src/app.ts" } }

// Server → Client
{ "requestId": "req-1", "success": true, "data": { "content": "...", "encoding": "utf-8" } }
```

### Actions

**Filesystem:**
- `listDir(path)` → directory entries with type, size, modified
- `readFile(path)` → content (utf-8 or base64 for binary)
- `writeFile(path, content)` → write to disk (suppresses watcher)
- `deleteFile(path)` → delete (suppresses watcher)
- `renameFile(oldPath, newPath)` → rename (suppresses watcher)
- `search(query, path?, glob?, caseSensitive?, maxResults?)` → ripgrep results

**Shell:**
- `shell(command, cwd?, timeout?)` → `{ exitCode, stdout, stderr }` (30s default)

**Processes:**
- `getProcesses()` → process snapshots (state, pid, duration, restarts)
- `getProcessLog(name)` → per-process log buffer

**Editor state:**
- `openFile(path, preview?)` → open/activate tab
- `closeFile(path)` → close tab
- `setActiveTab(path)` → switch active
- `reorderTabs(paths)` → reorder
- `expandDir(path)` / `collapseDir(path)` / `toggleDir(path)`

**Agent:**
- `agentMessage(text)` → send message to remy
- `agentCancel()` → cancel current agent turn
- `agentClear()` → clear agent session

**Tunnel:**
- `tunnelRunScenario(scenarioId)` → execute scenario seed
- `tunnelSyncSchema()` → sync table definitions
- `tunnelListScenarios()` → list available scenarios
- `tunnelImpersonate(roles)` → set role override
- `tunnelClearImpersonation()` → clear override
- `tunnelListRoles()` → list app roles

### Pushed Events (broadcast to all clients)

- `fileChanged { path, changeType }` — file system change
- `processOutput { process, stream, line, ts }` — stdout/stderr line
- `processStateChanged { name, state, ... }` — process lifecycle
- `tunnelEvent { ... }` — parsed JSON from tunnel stdout
- `bootstrapProgress { step, message }` — startup status
- `editorStateChanged { tabs, activeTab, expandedDirs }` — tab/tree changes
- `agentReady` / `agentText` / `agentThinking` / `agentToolStart` / `agentToolDone` / `agentTurnDone` / `agentError` — agent streaming

**Broadcast batching:** High-frequency events (processOutput, processStateChanged) are batched into arrays and flushed every 100ms. Reduces WebSocket frame overhead 10-20x for process output.

---

## Process Management

The `ProcessManager` spawns and supervises child processes. Each process has configurable restart behavior.

| Process | Restart on crash | Max restarts | Critical |
|---------|-----------------|--------------|----------|
| Dev server | yes | 5 | no |
| Tunnel | yes | 5 | yes (exit on max) |
| Agent (remy) | no | 0 | no |

**Restart backoff:** exponential, `min(1000 * 2^n, 30000)` ms.

**Critical processes:** If a critical process exhausts its restart budget, the C&C server exits with code 1. This triggers Vercel to mark the sandbox as failed.

### Agent Integration

Remy runs as a separate process with JSON-over-stdin/stdout:

**C&C → Agent (stdin):**
```json
{ "action": "message", "text": "Add a contactPhone field" }
{ "action": "cancel" }
{ "action": "clear" }
{ "action": "get_history" }
```

**Agent → C&C (stdout, NDJSON):**
```json
{ "event": "ready" }
{ "event": "text", "text": "I'll add the field..." }
{ "event": "thinking", "text": "Let me check..." }
{ "event": "tool_start", "id": "call_1", "name": "editFile", "input": {...} }
{ "event": "tool_done", "id": "call_1", "name": "editFile", "result": "..." }
{ "event": "turn_done" }
```

Events are mapped to WebSocket broadcasts so the browser sees agent activity in real-time.

**Why a separate process (not a library):** Crash isolation: if the agent crashes, the editor keeps working. Independent upgrades: update remy without rebuilding the C&C server. And remy works standalone too, so keeping it as a process maintains that independence.

### Tunnel Integration

The tunnel runs in headless mode and communicates via stdin/stdout JSON. The C&C server sends control messages (run scenario, sync schema, impersonate) and receives status events (session started, method execution, errors).

The key event is `session-started` with `proxyPort`. This is how the C&C server discovers where to point the reverse proxy.

---

## File Watcher

Chokidar watches the workspace directory recursively.

**Configuration:**
- Ignores: `node_modules`, `.git`, `.vite`
- `awaitWriteFinish`: 100ms stability threshold (debounces rapid edits)
- `ignoreInitial`: true

**Write suppression:** When the C&C server writes a file (via the `writeFile` action), it suppresses the path for 2 seconds to prevent the watcher from broadcasting a `fileChanged` event for its own write. Without this, every editor save would trigger a redundant file change notification.

File changes also notify the LSP sidecar (for diagnostics updates) and the editor state manager (to close tabs for deleted files).

---

## LSP Integration

A single TypeScript language server serves both Monaco (WebSocket) and remy (HTTP sidecar).

**LspClient** — JSON-RPC multiplexer:
- Spawns `typescript-language-server --stdio`
- Tracks open files, versions, pending requests
- Full LSP protocol: completion, hover, definition, references, diagnostics, code actions, rename

**LspSidecar** — HTTP API on port 4388 for remy:
- `POST /diagnostics { file }` → type errors and warnings
- `POST /definition { file, line, column }` → go to definition
- `POST /references { file, line, column }` → find all references
- `POST /hover { file, line, column }` → hover info
- `POST /symbols { file }` → document outline

**Why LSP multiplexing:** Running two language server instances (one for Monaco, one for remy) would double memory usage and create stale state. A shared instance means both see the same file state, and diagnostics computed for one are available to the other.

---

## State Management

### In-Memory State

- **Process registry:** per-process log buffers (1000 lines each), state (starting/running/crashed/stopped), restart history
- **Editor state:** open tabs, active tab, expanded directories
- **Merged output log:** all process output combined, ring buffer (5000 lines max)

### Persistence

State is saved to `{workspace}/.sandbox-state.json`:
- Written on SIGTERM (graceful shutdown)
- Auto-saved every 5 seconds (debounced, triggered by state changes)
- Read on boot via `restoreState()` (chat history, output log, editor state, process snapshots)

On restore, running/starting processes are marked as stopped (they don't survive the VM boundary).

### Snapshot and Resume

Vercel's snapshot captures the entire filesystem. When a sandbox resumes:
1. C&C server boots, runs bootstrap sequence
2. `restoreState()` reads `.sandbox-state.json`
3. Chat history and output log are restored to the UI
4. Git clone is skipped (files already exist from snapshot)
5. npm install may be skipped (node_modules in snapshot)
6. New tunnel session establishes (gets new proxy port)
7. Agent loads its session from `.remy-session.json`

**What survives:** All files (workspace, node_modules, git state), `.sandbox-state.json` (chat, output, editor state), `.remy-session.json` (agent conversation)

**What doesn't:** Running processes, WebSocket connections, tunnel session ID, proxy port assignment

**Why state persists only on SIGTERM (+ auto-save):** The snapshot captures the filesystem atomically. As long as state is on disk at snapshot time, it survives. Auto-save ensures recent state is always flushed. SIGTERM gives us a final opportunity to capture the latest.

---

## Graceful Shutdown

Triggered by SIGTERM, SIGINT, or uncaught exceptions:

1. Set `shuttingDown` flag (prevent re-entry)
2. Save state to `.sandbox-state.json`
3. Stop file watcher
4. Stop LSP server
5. Stop all processes (5s SIGTERM → SIGKILL)
6. Close all WebSocket clients (code 1001)
7. Close HTTP server

---

## Editor State Manager

Tracks the UI state that the frontend relies on:

- **Tabs:** ordered list of open files (path + preview flag)
- **Active tab:** which file is currently focused
- **Expanded directories:** which folders are open in the file tree

Single preview tab: opening a file in preview mode replaces the previous preview (like VS Code's italic-tab behavior).

State changes are broadcast to all connected clients and persisted to `.sandbox-state.json`.

---

## Design Rationale

**Why the C&C server exists at all:** The alternative is running the tunnel and dev server directly, without orchestration. But the hosted editor needs more: file system access over WebSocket, process supervision with restart policies, agent integration, LSP multiplexing, state persistence, reverse proxy for live preview, and editor state management. The C&C server is the orchestrator that composes all of these into a coherent editing experience.

**Why agent runs in-process (same container):** If the agent ran outside the sandbox, every tool call (read file, write file, run command) would be a network round-trip. For a typical coding loop (read 5 files, make edits, run a command, check output), that's 10+ round-trips. Running in-process means file operations are `fs.readFile` (microseconds) and bash commands are `child_process.exec` (local). The agent sees the same filesystem, PATH, and node_modules as the dev server.
