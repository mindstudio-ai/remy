# Building Agent Interfaces

Guidance for designing conversational AI agents and their frontends. An agent interface pairs an LLM (with per-user-scoped/authenticated access to app methods as tools, handled by platform automatically) with a chat UI. The developer authors the agent's character in MSFM (`src/interfaces/agent.md`); you compile it into a system prompt and tool descriptions (`dist/interfaces/agent/`).

## Agent Design Principles

### System prompts define character, not procedures

A good system prompt establishes who the agent is — personality, tone, judgment style, the kind of person they sound like. It doesn't enumerate every possible interaction or restate what tools already describe.

Short and opinionated beats long and comprehensive. "Sounds like a sharp, organized friend — brief by default" gives the model more to work with than a page of behavioral rules. Define constraints through character, not checklists. Let the model's judgment work.

#### System Prompt Specifics
Always include a note like "## Tool Usage
- When multiple tool calls are independent, make them all in a single turn. Searching for three different products, or fetching two reference sites: batch them instead of doing one per turn." to help the model know it can run tools in parallel
- The user's name and current role(s) at the time of message, if any, will be automatically appended to the end of every system prompt at runtime like:

```
## Current User
Name: Jane Smith
Roles: editor
```
- Unless the user specifies otherwise, always include a note that the agent can use markdown in responses (since the chat UI renders it) and should avoid using em dashes and emojis in its responses.

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

Send images or documents alongside a message. Upload via `platform.uploadFile()` first, then pass CDN URLs as the 4th argument:

```ts
const url = await platform.uploadFile(file);

chat.sendMessage(threadId, "What's in this document?", {
  onText: (delta) => setText((prev) => prev + delta),
}, {
  attachments: [url],
});
```

Images (`i.mscdn.ai`) are sent as vision input. Documents (`f.mscdn.ai`) have text extracted server-side and included in context. Attachments are preserved in thread history.

**Key points:**
- `onText` and `onThinking` receive deltas (append to state, don't replace)
- `sendMessage` returns an `AbortablePromise` — a Promise with `.abort()`. Also accepts `signal` in callbacks for `AbortController` support
- Tool call events (`onToolCallStart`, `onToolCallResult`) are available for showing progress indicators
- Thread title is auto-generated after the first exchange

### Layout

Ask `visualDesignExpert` for ideas about how to design the chat UI in a way that is appropriate and unique to the app.

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

Show tool activity in the chat as a compact, inline status that appears when `onToolCallStart` fires and resolves when `onToolCallResult` arrives. Never show raw JSON, tool IDs, or internal details — just a human-readable description of what's happening.

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
