---
name: Agent Interfaces
what: Conversational AI as a first-class interface to the app — an LLM with authenticated, per-user access to the app's methods as tools, paired with a streaming chat UI. The platform handles auth, tool dispatch, threads, and streaming, so the work is authorship: who the agent is, which methods it can reach, and how each one is described to it. Any app whose methods do something interesting can be projected into a conversation this way, often as its most compelling surface. This reference covers the whole feature — writing the agent spec, compiling it, and building the chat frontend.
when: Before authoring `src/interfaces/agent.md`, compiling `dist/interfaces/agent/`, or building an agent's chat UI.
---

# Building Agent Interfaces

Guidance for designing conversational AI agents and their frontends. An agent interface pairs an LLM (with per-user-scoped/authenticated access to app methods as tools, handled by platform automatically) with a chat UI. The developer authors the agent's character in MSFM (`src/interfaces/agent.md`); you compile it into a system prompt and tool descriptions (`dist/interfaces/agent/`).

## Agent Design Principles

### System prompts define character, not procedures

A good system prompt establishes who the agent is — personality, tone, judgment style, the kind of person they sound like. It doesn't enumerate every possible interaction or restate what tools already describe.

Short and opinionated beats long and comprehensive. "Sounds like a sharp, organized friend — brief by default" gives the model more to work with than a page of behavioral rules. Define constraints through character, not checklists. Let the model's judgment work. Start minimal and add rules only for behaviors that actually misfire once the user has tested it — the thread log is the feedback loop, and `remy-admin agent threads get` reads a conversation verbatim (see "The agent CLI" below).

Three things every compiled system prompt should carry, on top of the character:

**Parallel tool use.** The model won't batch independent calls unless told it can. Include a section like:

```markdown
## Tool Usage

When multiple tool calls are independent, make them all in a single turn.
Searching for three different products, or fetching two reference sites:
batch them instead of doing one per turn.
```

**Markdown and house style.** Unless the user says otherwise, tell the agent it can use markdown (the chat UI renders it) and to avoid em dashes and emojis.

**The current user is appended for you.** At runtime the platform appends the user's name and roles to the end of every system prompt, so don't write your own placeholder for it:

```markdown
## Current User

Name: Jane Smith
Roles: editor
```

### Tool descriptions are the most important artifact

The system prompt says *who* the agent is. The tool descriptions say *what it can do*. A great tool description means the agent uses the tool correctly without explicit instruction. Do not be overly precise or micromanage. Your goal with tool descriptions is to provide context and framing — trust that the model is intelligent enough to fill in the gaps. Each `tools/*.md` file should cover:

- **When to use** this tool (and when NOT to — e.g. "NOT for marking complete, use toggle-todo")
- **Parameter guidance** beyond the schema — what makes a good value, when to include optional fields, what to skip
- **Return value** and how to present results to the user

Note: Task agents (`runTask`) can also expose app methods as tools, but their descriptions are written **inline at the call site**, not compiled here. The two are deliberately different: an agent interface is one long-lived persona whose tools are a stable capability surface, so each method earns one carefully-written description in `tools/*.md`. A task agent is narrow and single-purpose, and the same method gets framed differently depending on the job — so its description belongs with the task, not the method.

### Not every method should be a tool

Expose methods that serve the conversational flow. Internal helpers, admin-only methods, and batch operations often don't belong in the agent's toolset. A focused set of well-described tools performs better than many underdocumented ones.

Think about what the user would actually say in conversation. If a method only makes sense triggered by another system (cron, webhook) or through a form UI, it probably shouldn't be an agent tool.

### The MSFM spec body drives compilation

The spec (`src/interfaces/agent.md`) is the human-editable source. Write it for humans — voice, personality, capabilities, behavioral rules, edge cases. The body should read like a character brief, not a technical manual.

Model ID and config belong in the frontmatter, not the prose. The prose focuses on judgment calls: "When a user adds a task, consider whether it would benefit from a note. For vague or complex tasks, attach guidance. For simple tasks, skip it."

Use MSFM annotations for implementation-level notes that the compiler needs but the human reader doesn't — same pattern as app specs.

When defining tools for multi-user apps with access restrictions, be sure to note the roles that are allowed or disallowed from accessing the tool, as well as any other restrictions. The actual tool invocation will be rejected at runtime if the requesting user is not allowed to access the underlying method, but defining this early allows the model to gate permissions cleanly rather than vomiting an error when the user tries to do something they're not permissioned for.

### Anti-patterns

- Avoid system prompts that restate tool schemas ("You have a tool called createTodo that takes a title and optional aiNotes...")
- Avoid generic personalities ("You are a helpful assistant") — every agent should have a distinct voice, this is often the most fun part for the user building the agent - lean in and help them enjoy bringing their agent to life!
- Avoid exposing all methods without considering conversational fit

## Compiling the Agent Spec

When building the `dist/interfaces/agent/`, consider the agent spec, as well as the larger context of the app and especially any `@brand/` guidelines. The agent should feel as though cut from the same cloth as the rest of the app - it is simply the same backend application projected into a different modality. Take care to make it consistent with the user's app, and then output:

**`system.md`** — compiled from the spec body. Should feel like a character brief: who the agent is, how they talk, what they care about, key behavioral rules.

**`tools/*.md`** — one file per exposed method. Rich markdown with when-to-use, examples, edge cases, return value guidance. These are what make the agent actually work well.

**`agent.json`** — ties it together. Model config from frontmatter, paths to system prompt and tool files, optional `webInterfacePath`.

The exact shape of all three, and of the spec frontmatter they compile from, is in "The wiring" at the end of this document.

## Chat UI Design

When the agent has a web frontend (via `webInterfacePath`), the chat UI is a page within the web interface.

### Frontend SDK: `createAgentChatClient()`

The `@mindstudio-ai/interface` package provides `createAgentChatClient()` for thread management and streaming chat. All agent chat UIs should use this — don't build raw fetch/SSE handling.

**Thread management:**

```ts
import { createAgentChatClient } from '@mindstudio-ai/interface';

const chat = createAgentChatClient();

const thread = await chat.createThread();
const { threads, nextCursor } = await chat.listThreads();
const full = await chat.getThread(thread.id);
await chat.updateThread(thread.id, 'New title');
await chat.deleteThread(thread.id);

// Progressive auth: threads started anonymously become unreachable after the
// user signs in (login replaces the session and its visitor identity). Claim
// them right after your verification/login succeeds so the conversation
// survives — the client remembers each thread's pre-login token automatically
// for threads touched this page session.
await chat.claimThread(thread.id);
```

**Client tools** — a tool whose effect happens in the browser (open a sheet, pick a file, confirm an action) is declared with `target: "client"` and a `name` + inline `inputSchema` instead of a `method` (names must not collide with method ids; the schema is authored — there's no method contract to derive it from). Register a handler and its **return value becomes the tool result**, so the agent learns what happened rather than assuming it did:

```js
chat.registerClientTool('pickFile', async ({ prompt }) => {
  const file = await openFilePicker(prompt);
  return file ? { path: file.path } : { cancelled: true };
});

// Holding the turn on a person: the handler resolves when they decide.
chat.registerClientTool(
  'confirmDeploy',
  ({ summary }) =>
    new Promise((resolve) => {
      showApprovalDialog(summary, {
        onApprove: (note) => resolve({ approved: true, note }),
        onReject: (reason) => resolve({ approved: false, reason }),
      });
    }),
);
```

The agent waits while the handler runs, up to 15 minutes — which is what makes confirm-before-acting a client tool rather than something you build a queue for. The SDK always answers, so the agent is never stuck: the return value, `{ error }` if the handler threw, `result_too_large` past ~32KB serialized, and `unhandled_client_tool` immediately when nothing is registered for that name; the platform supplies `client_timeout` if the window passes and `client_disconnected` if the page closes. Handlers live for the client's lifetime rather than one message. `onClientToolCall` on `sendMessage` behaves the same way for a one-off — whatever it returns is the result — and is consulted only when no handler is registered.

**Sending messages (streaming):**

`sendMessage` streams the agent's response via SSE. Use named callbacks for common events:

```ts
const response = chat.sendMessage(threadId, content, {
  // Text deltas — append, don't replace
  onText: (delta) => setText((prev) => prev + delta),

  // Extended thinking (also deltas)
  onThinking: (delta) => setThinking((prev) => prev + delta),
  onThinkingComplete: (thinking, signature) => setThinking(''),

  // Tool execution
  onToolCallStart: (id, name) => { },
  onToolCallResult: (id, output) => { },

  // Errors
  onError: (error) => console.error(error),
});

// Resolves when stream completes
const { stopReason, usage } = await response;

// Cancel mid-stream
response.abort();
```

**Attachments:**

Send images or documents alongside a message. Upload to the app's file store first (see Files & Storage), then pass the returned URLs as the 4th argument:

```ts
// backend method mints a token; the browser uploads straight to storage
const token = await api.getUploadSlot({ filename: file.name, contentType: file.type });
const { url } = await platform.upload(token, file);

chat.sendMessage(threadId, "What's in this document?", {
  onText: (delta) => setText((prev) => prev + delta),
}, {
  attachments: [url],
});
```

Images are sent as vision input; documents have their text extracted server-side and included in context. Attachments are preserved in thread history.

**Key points:**
- `onText` and `onThinking` receive deltas (append to state, don't replace)
- `sendMessage` returns an `AbortablePromise` — a Promise with `.abort()`. Also accepts `signal` in callbacks for `AbortController` support
- Tool call events (`onToolCallStart`, `onToolCallResult`) are available for showing progress indicators
- Thread title is auto-generated after the first exchange

### Layout

The chat UI is a first-class design deliverable, not a bolted-on widget. Bring in `visualDesignExpert` for the chat experience as a whole — message design, streaming behavior, tool-activity presentation, the composer, and the empty state, composed as one surface (it has a dedicated craft reference for exactly this) — and implement what it prescribes. The rules below are the floor, not the direction.

User messages visually distinct from assistant messages (right-aligned, different background, or both). Keep it clean — no avatars unless they add meaning. Generous vertical spacing between messages so the conversation breathes. Use clean, beautiful animation where it is additive.

### Streaming & Markdown

Display tokens as they arrive. No loading spinners that block the whole view — show partial text immediately. A subtle cursor or animation at the streaming edge signals "still generating." The user should be reading, not waiting.

Use `streamdown` for rendering markdown from streaming text. It handles unterminated blocks gracefully (the core problem with react-markdown during mid-stream rendering), includes Shiki syntax highlighting for code blocks, and supports KaTeX math and Mermaid diagrams. Install the base package and tree-shake plugins as needed (`@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`).

Pay attention to streaming text animation — fast token delivery can look jarring, and slow delivery can look laggy. Throttling renders to ~50-100ms batches smooths things out.

It is critical to never introduce layout shift or jarring transitions when dealing with responses. Messages should cleanly and smoothly transition between thinking, streaming, and completed states. Tool use should fit beautifully within the conversation and should never cause abrupt layout shift.

### Scrolling

Use `use-stick-to-bottom` (`github.com/stackblitz-labs/use-stick-to-bottom`) for auto-scroll behavior. It handles the standard chat scroll contract: stick to bottom as new content streams in, but stop following if the user scrolls up. Don't hand-roll this — the edge cases (momentum scrolling, resize, streaming while scrolled up) are fiddly.

### Optimistic messages

When the user sends a message, add it to the conversation immediately — don't wait for the server to acknowledge. Show a thinking/typing indicator in the assistant's response area right away so the UI feels instant. The indicator should appear the moment the user hits send, not when the first token arrives.

### Tool calls

Show tool activity in the chat as a compact, inline status that appears when `onToolCallStart` fires and resolves when `onToolCallResult` arrives. Never show raw JSON, tool IDs, or internal details — just a human-readable description of what's happening. Tool calls should be interleaved into the conversation so they flow naturally as part of the agent's response.

### Input area

Fixed at the bottom. Auto-growing textarea using `react-textarea-autosize`, not a single-line input. Clear send affordance (button or Enter). Disabled while the agent is streaming, with a visible stop/cancel button. Placeholder text that reflects the agent's personality, not generic "Type a message..."

### Empty state

The first screen should invite conversation. A greeting from the agent, a few suggested prompts, or a concise description of what the agent can help with can go a long way. Always make sure they are optional though - the user needs to be able to chat directly if they want. Match the agent's voice — a casual todo assistant and a formal legal review agent should feel completely different from the first screen.

### Mobile

Chat is inherently mobile-friendly — lean into it. Pay attention to viewport sizing on mobile as the virtual keyboard changes the available height.

### Respect the brand

The chat UI uses the app's design system — colors, typography, voice from `@brand/`. Apply the same design standards as any other page in the web interface.

### Anti-patterns

- Avoid designs that look like dated messaging apps from 2015
- Avoid robotic empty states ("Hello! I'm your AI assistant. How can I help you today?")

## The agent CLI

The `remy-admin agent` family is the conversation log — every thread the deployed agent has had, and each one's full transcript:

```bash
remy-admin agent threads list --limit 10   # newest activity first
remy-admin agent threads get <threadId>    # full transcript: messages + tool calls
```

Transcripts are how you iterate on an agent: after the user tests it, read `agent threads get` for what was actually said and which tools ran with which arguments — a tool the agent never reached for, one it called with the wrong shape, a reply that ignored the result — and fix the system prompt and tool descriptions from that evidence rather than guesses.

In the list, `toolErrorCount` and `hasTurnError` point at the conversations worth opening (a failed tool call; a turn that broke on a model error, rate limit, or credits instead of replying). `devSession` is true for your own test conversations through the dev tunnel, so you can tell them from real traffic.

In a transcript, each message keeps the stored conversation's own shape: `user` for a person's message and also for a tool result (which carries `toolCallId`), `assistant` for the agent (carrying `toolCalls` when it asked for tools). Every method tool call also carries a `requestId` — `remy-admin requests get <requestId>` opens that call's input, output, `console.log` output and error, which is how you get from "the agent said something wrong" to the method that gave it bad data. Client tools run in the browser, so they have no requestId.

---

# The wiring

## Spec: `src/interfaces/agent.md`

The human-readable spec. Frontmatter contains structured fields; the prose body is the behavioral spec — voice, personality, capabilities, rules — written in MSFM.

```yaml
---
name: Todo Assistant
model: {"model": "claude-4-5-haiku", "temperature": 0.5, "maxResponseTokens": 16000}
description: Conversational agent that helps users manage their to-do list.
---
```

Frontmatter fields:

- `name` — agent display name
- `model` — JSON string with `model` (MindStudio model ID), `temperature`, `maxResponseTokens`, and optional `config` (model-specific settings like `reasoning`, `tools`, etc.). Ask `askMindStudioSdk` for available model IDs and their config options — MindStudio's ids don't match vendor ids, so treat any id in this document's examples as illustrative rather than current. The user's UI has a visual picker for changing it later, so only validate the model when you're setting it; if the value changes afterwards, assume it's correct.
- `description` — one-liner for agent card/listing

The prose body contains sections like Voice & Personality, Capabilities, Behavior — whatever structure serves the agent's character. This is compiled into the system prompt and tool descriptions.

## Compiled Output: `dist/interfaces/agent/`

```
dist/interfaces/agent/
├── agent.json          ← config the platform reads
├── system.md           ← compiled system prompt
└── tools/
    ├── createTodo.md   ← rich tool description per method
    ├── listTodos.md
    └── ...
```

## Config (`agent.json`)

```json
{
  "agent": {
    "model": "claude-4-5-haiku",
    "temperature": 0.5,
    "maxTokens": 16000,
    "systemPrompt": "system.md",
    "auth": { "requireUser": true },
    "tools": [
      { "method": "create-todo", "description": "tools/createTodo.md" },
      { "method": "list-todos", "description": "tools/listTodos.md" }
    ],
    "webInterfacePath": "/chat"
  }
}
```

**The token-limit field is renamed during compilation.** The spec frontmatter calls it `maxResponseTokens`; the compiled `agent.json` calls it `maxTokens`. Same value, two names — carry it across rather than copying the key.

| Field | Description |
|-------|-------------|
| `model` | MindStudio model ID. Comes from the spec frontmatter; look it up with `askMindStudioSdk` rather than guessing |
| `temperature` | Model temperature |
| `maxTokens` | Max response tokens (the spec's `maxResponseTokens`) |
| `systemPrompt` | Relative path to the compiled system prompt markdown file |
| `auth` | **Required.** Who may open the lobby: `{ "requireUser": boolean, "requireRole"?: string[] }`. See the Auth section below |
| `tools` | Array of tool entries — `method` references a method `id` from the manifest, `description` is a relative path to a markdown file with rich tool docs (when to use, examples, edge cases, parameter guidance) |
| `webInterfacePath` | Optional. If the app has a web interface with a chat page, this path tells the IDE where to show the preview. Otherwise the agent is accessed via API. |

Declare it in `mindstudio.json`:

```json
{ "type": "agent", "path": "dist/interfaces/agent/agent.json" }
```

## Auth

**Every agent config declares an `auth` block.** Agent chat spends the owner's money on every message without necessarily touching a backend method, so the platform gates the lobby itself — enforced at thread creation and message send:

```json
"auth": { "requireUser": true, "requireRole": ["support-agent", "admin"] }
```

- `requireUser: true` — only authenticated app users may chat; `false` — anyone, including anonymous visitors. Most apps want `true`; choose `false` deliberately (a public concierge).
- `requireRole` (optional) — the user must hold **at least one** of the listed manifest role ids (OR semantics, same as the backend `auth.requireRole(...)`). Omit or leave empty for no role gate. Requires `requireUser: true`. Unknown role ids fail the build.
- Denials surface to the frontend SDK as `MindStudioInterfaceError` with code `auth_required` (401) or `role_required` (403).
- Dev preview is exempt — the builder is never locked out while testing.
- Older compiled apps without the block fall back to the manifest's `auth.enabled` (auth-enabled → users only; no auth → public). New configs always declare it explicitly.

Once inside, agent chat runs as the **authenticated user**, not as a system role — tool calls carry that user's roles, so a method gated with `auth.requireRole` behaves exactly as it would if the user had called it from the web frontend. That's what makes exposing real methods safe; it's also why role restrictions belong in the tool descriptions, so the agent can decline gracefully instead of surfacing a rejection. Anonymous visitors (when allowed) are scoped by a per-browser visitor identity: their threads are private to their browser, and gated methods still reject.

