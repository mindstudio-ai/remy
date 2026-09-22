# Dev Tunnel (`remy-tunnel`)

The process that makes an app's code runnable without deploying it. Polls the platform for method
execution requests, transpiles TypeScript, executes methods in a warm worker, syncs table schemas,
and runs the proxy that injects `window.__MINDSTUDIO__` into HTML so the frontend SDK works with no
configuration. It also supervises the box's headless Chrome, which is how browser automation and
QA replay recording work.

It is **the second bin of `@madewithremy/sandbox`** — the same package as the C&C server, in the same
repo, spawned by the C&C as a child process in the same container. Not a dependency, a sibling.

Source: `mindstudio-sandbox/src/devTunnel/`. Its own reference is
`mindstudio-sandbox/src/devTunnel/README.md`; the wire protocol is `src/devTunnel/protocol.ts`.

## It used to be a standalone CLI

Until September 2026 this was `@mindstudio-ai/local-model-tunnel`, binary `mindstudio-local`,
published separately and installed into the dev box at boot. It had an interactive TUI, a device-auth
login flow that opened a browser, a `--headless` flag for the sandbox, and a config file at
`~/.mindstudio-local-tunnel/config.json` that the C&C server wrote by hand.

All of that is gone, and the reasoning is worth keeping because it generalises:

- **Nothing but a dev box ever ran it.** Laptop development was retired as a supported shape. The
  device-auth flow could not work in a container anyway — it called `open()`, which fails there,
  then polled for 60 seconds and gave up.
- **The C&C server was its only consumer**, and the devbox image its only install site. Two
  published packages, two version pins, two dev-branch knobs, and a workflow that resolved both to
  latest-of-each in the same second — so the independent versioning was never actually used.
- **The split was paid for in a hand-written mirror.** The C&C kept its own copy of the tunnel's
  event union, and it had drifted: three fields declared that were never sent, a handler for an
  event that was never emitted. Both halves now import one typed module.

The full argument is in `youai-api/.working-docs/devbox-runtime-consolidation.md`.

## How it starts

The C&C spawns it as `node dist/devTunnel/cli.js`, resolving that path relative to its **own**
module rather than looking up `remy-tunnel` on PATH. That matters: a C&C built from a branch runs
from `/tmp`, while the baked binary is still the released one, so a PATH lookup would pair a branch
C&C with a released tunnel and quietly test a combination nobody asked about.

Credentials arrive on the child's environment (`MINDSTUDIO_API_KEY`, `MINDSTUDIO_BASE_URL`,
`USER_ID`), never on argv — the C&C logs every command line it spawns and serves the process list to
the editor.

Then:

1. Read `mindstudio.json`, validate it and the `appId`. Emit `session-starting`.
2. `POST …/dev/manage/start` — register methods and data sources, receive the session token, the
   release id and the client context.
3. Sync table schemas if any tables are declared.
4. Start the proxy if a dev port resolved; optionally launch the sandbox browser.
5. Emit `session-started` with the proxy URL and the app's roles and scenarios.
6. Begin the poll loop, and watch the manifest, the interface configs and the table sources.

A boot with no usable `mindstudio.json` retries with backoff, then emits `degraded-state` and keeps
retrying on a timer — a box whose config has not landed yet stays up and recovers rather than dying.

## Poll loop

`GET /_internal/v2/apps/{appId}/dev/poll` long-polls for up to 30 seconds. On a request it receives
`{ requestId, methodId, methodExport, input, authorizationToken, roleOverride?, streamId? }`,
executes it, and posts to `…/dev/result/{requestId}`.

Methods execute concurrently — the poll loop keeps running while they do. Connection errors back off
exponentially. A 404 means the platform ended the session, which is terminal.

Each poll also records a heartbeat, which is what makes the dashboard show a session as connected.

**Why poll-based:** it works through any NAT or firewall with no inbound connections. That mattered
most when the tunnel ran on a developer's laptop; it still matters for a container whose egress is
locked down, and it keeps the platform side stateless.

## Method execution

1. **Transpile** with esbuild — ESM, platform node, bundled so the worker has one entry point, with
   `@mindstudio-ai/agent` marked external. Output goes to `node_modules/.cache/mindstudio-dev/` in
   the app's own tree.
2. **Execute** in a **warm worker process**, forked once and reused. `runWithContext()` and
   `AsyncLocalStorage` scope auth per request, so concurrent executions do not see each other's
   identity; `mindstudio.waitUntil()` registrations are tracked so work interrupted by teardown is
   annotated rather than lost. Per-request secrets are injected into `process.env` and cleaned up
   after. Requires SDK >= 0.1.46; older SDKs fail loudly at spawn.
3. **Collect and post** `{ success, output?, error?, stdout?, stats? }`.

**Why the SDK stays external:** it reads `CALLBACK_TOKEN` and its context at runtime. A bundled copy
would not see them. Marking it external means it resolves from the *app's* installed version — which
is why the worker is copied into the app's tree before being forked, and why it has to be a single
self-contained file. A build-time assertion enforces that.

**Why a warm worker rather than a process per request:** cold start was 1–2s of Node and SDK load on
every invocation.

## The proxy

Sits in front of the dev server. HTML is buffered and gets `window.__MINDSTUDIO__` injected before
`</head>`; everything else, including WebSocket upgrades for HMR, is forwarded untouched. CORS and
Private Network Access headers make it work inside the editor's iframe.

The injected object — token, release id, user, and the method-name-to-id map — is the same shape the
CDN injects in production. That is the zero-divergence property in practice: interface code runs
unmodified in a dev box and in production, and the SDK calls same-origin `/_/` paths in both.

The proxy also hosts `/__mindstudio_dev__/ws` for the browser agent and `/__mindstudio_dev__/render`
for replay video export.

## Schema sync

Reads the table sources named in `mindstudio.json`, posts the raw TypeScript to
`…/dev/manage/sync-schema`, and the platform parses it, diffs against the dev database and applies
DDL. Additive only — new tables and new columns. Drops and type changes are migrations, on deploy.

Triggered at session start and whenever a declared table source changes, with no session restart.

## Talking to the C&C

Newline-delimited JSON: commands in on stdin, events and correlated responses out on stdout, logs on
stderr. Seventeen commands (run a method, run a scenario, drive the browser, screenshot, render HTML,
query the database, export a replay, …) and seventeen system events.

**The names, params and result shapes are types**, in `src/devTunnel/protocol.ts`, imported by both
sides. Do not keep a second copy anywhere — the last one drifted.

One behaviour worth knowing here: `session-expired` is followed by **exit 0**, not a non-zero exit.
The C&C supervises the tunnel with `restartOnCrash` and `critical`, and a rejected credential is not
something a restart can fix — the key comes from the environment, so a crash-shaped exit would burn
the process's five lifetime restarts in half a minute and then take the box down with it.
