# Execution Service (`youai-custom-function-execution-service`)

Stateless provisioner that wraps the Vercel Sandbox SDK. Two responsibilities: manage sandbox containers for the hosted editor, and execute user functions in isolated containers.

Deliberately stateless. Vercel is the source of truth for sandbox state. The execution service is a thin translation layer between the platform API's lifecycle decisions and Vercel's container primitives. The API decides policy (when to start, when to stop, when to snapshot); this service provides mechanism.

---

## Sandbox Manager

Provisions and manages C&C sandbox containers for the hosted editor. Located at `src/common/SandboxManager/`.

### API

```
POST /sandbox/start          — create or resume a sandbox
POST /sandbox/stop           — snapshot + suspend (default) or discard
POST /sandbox/verify         — check if a sandbox is alive
POST /sandbox/build-snapshot — build the pre-baked base image
```

### Start

```
POST /sandbox/start
Body: { gitRepoUrl, apiKey, userId, snapshotId? }
Returns: { sandboxId, sandboxToken, cncDomain, timeoutTimestampMs }
```

1. Generate a `sandboxToken` (random UUID) for WebSocket auth
2. Create a Vercel sandbox:
   - Runtime: Node 24, 4 vCPUs / 8GB RAM
   - Source: snapshot (if `snapshotId` provided) or scaffold git repo
   - Timeout: 1 hour (dev) / 5 hours (prod)
   - Exposed port: 4387
3. If fresh (no snapshot): install system packages (git, rsync, ripgrep), npm install, npm run build
4. If from snapshot: skip setup (everything is baked in)
5. Start the C&C server as a detached process with environment:
   - `GIT_REPO_URL` — app git repo with embedded clone token
   - `MINDSTUDIO_API_KEY` — org API key for tunnel + agent auth
   - `USER_ID` — developer's user ID
   - `API_BASE_URL` — platform API URL
   - `PORT` — 4387
   - `SANDBOX_TOKEN` — for WebSocket auth
6. Poll health endpoint until ready (2s interval, 120s timeout)
7. Return connection info

**Health polling behavior:**
- Polls `https://{cncDomain}/health` every 2 seconds
- On `{ status: 'ready' }`: success, return
- On `{ status: 'error' }`: fail fast with bootstrap error message
- On connection failure: track consecutive failures
- After 5 consecutive failures (~10s): assume process is dead
- After 120s total: timeout

### Stop

```
POST /sandbox/stop
Body: { sandboxId, skipSnapshot?: boolean }
Returns: { snapshotId? }
```

By default, snapshots the sandbox before stopping. The Vercel snapshot operation suspends the container; after a snapshot, the sandbox is no longer running. This is the intended behavior: snapshot = save + suspend.

With `skipSnapshot: true`, calls `sandbox.stop()` directly (kills without preserving state). Used by the API's reset operation.

Silently handles already-stopped sandboxes (the container may have expired or been stopped by Vercel's timeout).

**Why a single stop endpoint with snapshot-by-default:** Protects user work as the default behavior. The API never needs to remember to snapshot before stopping; it just calls stop and gets a snapshot back. The `skipSnapshot` option exists only for intentional discards (reset). This eliminates an entire class of bugs where a code path forgets to snapshot.

### Verify

```
POST /sandbox/verify
Body: { cncDomain }
Returns: { alive: boolean, status: string }
```

Quick health probe to check if a sandbox is actually alive. Hits the C&C server's `/health` endpoint up to 3 times (1s apart). Returns on first successful response. Only retries on connection failures.

| status | alive | meaning |
|--------|-------|---------|
| `ready` | true | C&C is up and operational |
| `bootstrapping` | true | C&C is up but still initializing |
| `error` | false | C&C responded but reported a failure |
| `unreachable` | false | No response after 3 attempts (~3s) |

Always returns 200. The `alive` field indicates sandbox state, not an error in the execution service.

Used by the API to detect stale sessions: if the DB says "running" but verify returns `alive: false`, the API marks the session stopped and starts a new one.

### Build Snapshot

```
POST /sandbox/build-snapshot
Body: {}
Returns: { snapshotId, expiresAt }
```

Builds the pre-baked base image that all new sandboxes start from. Called once (or when the C&C server is updated) to avoid the 60s+ cold-start setup on every sandbox creation.

**What gets baked in:**
1. Clone the scaffold repo (`mindstudio-sandbox` from GitHub)
2. Install system packages (git, rsync, ripgrep)
3. `npm install` (ws, chokidar, http-proxy, etc.)
4. `npm run build` (compile TypeScript → dist/)
5. Snapshot with `expiration: 0` (never expires)

With a base snapshot, `POST /sandbox/start` skips all of this and goes straight to starting the C&C server process (~5s vs ~90s).

**Why base snapshots:** Cold-starting a sandbox from git requires cloning, installing system packages, npm install, and TypeScript compilation. This takes 60-90 seconds. Pre-baking all of this into a snapshot reduces sandbox creation to just starting the C&C server process. The tradeoff is managing a snapshot artifact, but it only needs to be rebuilt when the C&C server code changes.

---

## Function Execution

Executes user methods in isolated Vercel sandbox containers. Three executor types for different runtimes.

### Compiled Script Executor

The primary executor for production method invocation. Receives pre-compiled JavaScript (bundled during the release build), installs only the required npm packages, and runs the handler.

**Flow:**
1. Check warm pool for a ready sandbox
2. If pool miss: create sandbox from snapshot, install packages
3. Write handler code + bootstrap index
4. Run `node index.js`
5. Read `result.json`

**Bootstrap index** sets up the execution environment:
```javascript
global.ai = { auth, databases };
const { handlerName } = await import('./handler.js');
const returnValue = await handlerName(params);
writeResult({ type: 'success', result: { returnValue } });
```

### Warm Pool

Pre-creates sandbox containers from a snapshot with common packages (including `@mindstudio-ai/agent`) already installed. Reduces cold-start latency for method execution.

- Target size: 1 (dev) / 5 (prod)
- Max idle: 4 hours per sandbox
- Single-use: each execution gets a fresh sandbox from the pool
- Background replenishment: pool refills automatically when drained

**Why a warm pool:** Cold-starting a sandbox for every method invocation adds 5-15 seconds of latency. The warm pool eliminates this for the common case. The tradeoff is cost (idle sandboxes consume resources), but the pool is small and auto-drains stale entries.

### JS/TS Sandbox Executor

Runs raw JavaScript or TypeScript code (used by legacy workflow steps, not typically by MindStudio Apps). Handles transpilation, package extraction, and execution in a single flow.

### Python Sandbox Executor

Runs Python code in a Python 3.13 sandbox. Similar flow to JS but with pip for package management.

---

## Design Rationale

**Why stateless:** The execution service has no database, no Redis, no internal state tracking. Vercel is the source of truth for sandbox state. If the execution service restarts, nothing is lost. The API still knows which sandboxes exist (from its own DB) and can verify them. This makes the execution service trivially scalable and eliminates state synchronization bugs.

**Why Vercel:** Managed containers with a clean SDK, built-in snapshot API, per-port domain routing, no infrastructure to maintain. The alternative (running our own container orchestration) would require significant operational investment for the same capabilities.

---

## Configuration

| Setting | Dev | Prod |
|---------|-----|------|
| Sandbox timeout (editor) | 1 hour | 5 hours |
| Sandbox timeout (execution) | 30 minutes | 30 minutes |
| Sandbox vCPUs (editor) | 4 | 4 |
| Warm pool size | 1 | 5 |
| Health poll interval | 2s | 2s |
| Health poll timeout | 120s | 120s |
| Base snapshot expiration | never | never |
