# Building Agent Interfaces

Guidance for designing conversational AI agents and their frontends. An agent interface pairs an LLM (with per-user-scoped/authenticated access to app methods as tools, handled by platform automatically) with a chat UI. The developer authors the agent's character in MSFM (`src/interfaces/agent.md`); you compile it into a system prompt and tool descriptions (`dist/interfaces/agent/`).

## Agent Design Principles

### System prompts define character, not procedures

A good system prompt establishes who the agent is — personality, tone, judgment style, the kind of person they sound like. It doesn't enumerate every possible interaction or restate what tools already describe.

Short and opinionated beats long and comprehensive. "Sounds like a sharp, organized friend — brief by default" gives the model more to work with than a page of behavioral rules. Define constraints through character, not checklists. Let the model's judgment work.

### Tool descriptions are the most important artifact

The system prompt says *who* the agent is. The tool descriptions say *what it can do*. A great tool description means the agent uses the tool correctly without explicit instruction. Do not be overly precise or micromanage. Your goal with tool descriptions is to provide context and faming- trust that the model is intelligent enough to fill in the gaps.. Each `tools/*.md` file should cover:

- **When to use** this tool (and when NOT to — e.g. "NOT for marking complete, use toggle-todo")
- **Parameter guidance** beyond the schema — what makes a good value, when to include optional fields, what to skip
- **Return value** and how to present results to the user

### Not every method should be a tool

Expose methods that serve the conversational flow. Internal helpers, admin-only methods, and batch operations often don't belong in the agent's toolset. A focused set of well-described tools performs better than many underdocumented ones.

Think about what the user would actually say in conversation. If a method only makes sense triggered by another system (cron, webhook) or through a form UI, it probably shouldn't be an agent tool.

### The MSFM spec body drives compilation

The spec (`src/interfaces/agent.md`) is the human-editable source. Write it for humans — voice, personality, capabilities, behavioral rules, edge cases. The body should read like a character brief, not a technical manual.

Model ID and config belong in the frontmatter, not the prose. The prose focuses on judgment calls: "When a user adds a task, consider whether it would benefit from a note. For vague or complex tasks, attach guidance. For simple tasks, skip it."

Use MSFM annotations for implementation-level notes that the compiler needs but the human reader doesn't — same pattern as app specs.

When defining tools for multi-user apps with access restrictions, be sure to note the roles that are allowed or disallowed from accessing the tool, as well as any other restrictions. The actual tool invocation will be rejected at runtime if the requesting user is not allowed to access the underlying method, but defining this early allows the model to gate permissions cleanly rather than vomiting an error when the user tries to do something they're not permissioned for. The user's name and current role(s), if any, will be automatically appended to the end of every system prompt at runtime like:

```
## Current User
Name: Jane Smith
Roles: editor
```

### Anti-patterns

- Avoid system prompts that restate tool schemas ("You have a tool called createTodo that takes a title and optional aiNotes...")
- Avoid generic personalities ("You are a helpful assistant") — every agent should have a distinct voice, this is often the most fun part for the user building the agent - lean in and help them enjoy bringing their agent to life!
- Avoid exposing all methods without considering conversational fit

## Compiling the Agent Spec

When building the `dist/interfaces/agent/` output:

**`system.md`** — compiled from the spec body. Should feel like a character brief: who the agent is, how they talk, what they care about, key behavioral rules. Not a manual.

**`tools/*.md`** — one file per exposed method. Rich markdown with when-to-use, examples, edge cases, return value guidance. These are what make the agent actually work well.

**`agent.json`** — ties it together. Model config from frontmatter, paths to system prompt and tool files, optional `webInterfacePath`.

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
```

**Sending messages (streaming):**

`sendMessage` streams the agent's response via SSE. Use named callbacks for common events:

```ts
const response = chat.sendMessage(threadId, content, {
  onText: (text) => setText(text),           // accumulated assistant text (replace, don't append)
  onThinking: (text) => setThinking(text),   // extended thinking
  onToolCallStart: (id, name) => { },        // tool execution started
  onToolCallResult: (id, output) => { },     // tool execution finished
  onError: (error) => console.error(error),  // stream error
});

// Resolves when stream completes
const { stopReason, usage } = await response;

// Cancel mid-stream
response.abort();
```

**Key points:**
- `onText` receives the full accumulated text each time (replace state, don't append)
- `sendMessage` returns an `AbortablePromise` — a Promise with `.abort()`. Also accepts `signal` in callbacks for `AbortController` support.
- Tool call events (`onToolCallStart`, `onToolCallResult`) are available for showing progress indicators, but most chat UIs should not display tool internals to users
- Thread title is auto-generated after the first exchange

### Layout

Full-screen conversational layout. Chat is the primary interaction — give it the whole viewport. No unnecessary sidebars or chrome competing for attention. The conversation IS the interface.

User messages visually distinct from assistant messages (right-aligned, different background, or both). Keep it clean — no avatars unless they add meaning. Generous vertical spacing between messages so the conversation breathes.

### Streaming

Display tokens as they arrive. No loading spinners that block the whole view — show partial text immediately. A subtle cursor or animation at the streaming edge signals "still generating." The user should be reading, not waiting.

### Tool calls: hide the plumbing

Users don't need to see "Calling createTodo..." unless the tool takes significant time (>2-3 seconds). Show the *result* naturally woven into the assistant's response, not the raw tool call. If a long-running tool needs an indicator, keep it subtle and inline — not a modal, toast, or blocking overlay.

Never show raw JSON tool results to the user.

### Input area

Fixed at the bottom. Auto-growing textarea, not a single-line input. Clear send affordance (button or Enter). Disabled while the agent is streaming, with a visible stop/cancel button. Placeholder text that reflects the agent's personality, not generic "Type a message..."

### Empty state

The first screen should invite conversation. A greeting from the agent, a few suggested prompts, or a concise description of what the agent can help with. Match the agent's voice — a casual todo assistant and a formal legal review agent should feel completely different from the first screen.

### Mobile

Chat is inherently mobile-friendly — lean into it. Full-width messages, thumb-friendly input area and send button, no hover-dependent interactions. Test on mobile viewports.

### Respect the brand

The chat UI uses the app's design system — colors, typography, voice from `@brand/`. A todo agent and a legal review agent should look and feel completely different. Apply the same design standards as any other page in the web interface.

### Anti-patterns

- Chat bubbles with thick borders, drop shadows, or rounded-rectangle decorations that look like a 2015 messaging app
- Robotic empty states ("Hello! I'm your AI assistant. How can I help you today?")
- Showing raw JSON or tool call internals to users
- Blocking the entire UI during tool execution
- Cramped input areas or tiny send buttons
- Generic styling that ignores the app's brand
