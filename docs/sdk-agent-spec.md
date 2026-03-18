# SDK Agent — Spec

## What this is

A built-in agent in the `@mindstudio-ai/agent` CLI that answers questions about the MindStudio SDK, available actions, models, connectors, and integrations. Invoked via `mindstudio ask "..."`.

External tools like Remy shell out to it and get back a concrete, actionable answer — method signatures, usage examples, connector details, model recommendations. No sub-agent lifecycle to manage, no streaming coordination. Just a CLI call that returns text.

## Why build it here

The `mindstudio-agent` package already has:
- All 140+ action definitions (via `list-actions`, `info`)
- 850+ connector registry (via `list-connectors`)
- 200+ model catalog (via `list-models`)
- Auth already wired up (CLI config, env vars, sandbox tokens)
- The `MindStudioAgent` client class for live API calls

Building the agent here means it has native access to all of this without external dependencies. And it ships as part of the CLI, so any tool that can run `mindstudio ask` gets SDK expertise for free — Remy, Claude Code via MCP, other agents, or a human in a terminal.

## Usage

```bash
# Natural language query
mindstudio ask "how do I send an email with an attachment?"

# Pipe context in
echo "I need to connect to HubSpot and create a contact when a vendor is approved" | mindstudio ask

# With flags
mindstudio ask --json "what models support vision?"
```

Returns a markdown-formatted answer with:
- The relevant method/action name
- Full parameter signature
- A usage code snippet
- Any caveats (OAuth required, model limitations, etc.)

## How it works internally

### System prompt

A focused prompt that explains:
- What the MindStudio SDK is and how it works (`new MindStudioAgent()`, `agent.<action>(...)`)
- That actions return flat results with `$`-prefixed metadata
- How connectors work (OAuth, `runFromConnectorRegistry`)
- How model overrides work
- That it has CLI tools to look up live data

### Tools available to the agent

The agent gets a small, focused tool set:

| Tool | What it does |
|------|-------------|
| `list-actions` | List all available SDK actions (names + descriptions) |
| `action-info` | Get full details for a specific action (params, outputs, examples) |
| `list-models` | List available models, optionally filtered by type |
| `list-connectors` | Browse connector services, drill into specific actions |
| `list-connections` | Check which OAuth services the user has connected |

These are thin wrappers around the existing `MindStudioAgent` client methods — `listModelsSummary()`, `getConnectorAction()`, etc. They format the results as readable text for the agent.

### Agent loop

Same pattern as any tool-calling agent:
1. Receive the user's question
2. System prompt provides SDK knowledge
3. Agent uses tools to look up specifics (action params, model capabilities, connector details)
4. Agent synthesizes an answer with concrete code examples
5. Return the answer as text

The loop uses the same MindStudio chat API that Remy uses — the `MindStudioAgent` client can call `generateText` with tool definitions. Or, to keep it simpler, it could use the Anthropic SDK directly for the agent loop and reserve the MindStudio client for the discovery tools only.

### Implementation approach

**Option A: Use MindStudio's own `generateText` for the agent loop**
- Pro: no additional dependencies, uses the same billing/routing
- Pro: the package already has the HTTP client wired up
- Con: `generateText` doesn't natively support tool calling (it's a simple text generation action). Would need to use the raw chat API endpoint or add tool-calling support to the client.

**Option B: Use the Anthropic SDK directly for the agent loop**
- Pro: native tool calling support, well-documented
- Con: adds a dependency (`@anthropic-ai/sdk`)
- Con: needs a separate API key or routing through MindStudio

**Option C: Use MindStudio's internal chat endpoint directly**
- Pro: same endpoint Remy uses (`/_internal/v2/agent/chat`), supports tools natively
- Pro: no new dependencies, uses existing auth
- Con: the client doesn't currently expose this endpoint, would need to add it

**Recommendation: Option C.** The `/_internal/v2/agent/chat` endpoint already supports tool calling and SSE streaming. Add a thin `chat()` method to the `MindStudioAgent` client that calls this endpoint. The SDK agent uses it for its loop. This also benefits other consumers who want to build agents on the platform.

### File structure (proposed)

```
src/
  ask/
    index.ts          — entry point: parseArgs, run agent loop, print result
    prompt.ts         — system prompt for the SDK agent
    tools.ts          — tool definitions + execute functions (wrapping client methods)
```

The CLI registers `ask` as a new command in `cli.ts`:
```typescript
case 'ask':
  return cmdAsk(args, options);
```

### Response format

Default: markdown-formatted text to stdout (readable by humans and agents alike)

With `--json`: structured JSON with fields like `{ answer, actions, models, connectors }` for programmatic consumption.

## How Remy uses it

Remy's main agent gets a note in its system prompt or tool descriptions:

> To look up SDK actions, models, connectors, or integrations, run `mindstudio ask "your question"` via bash. It returns detailed answers with method signatures and code examples.

No special tool needed — the agent already has `bash`. The `mindstudio ask` command handles all the research internally and returns a self-contained answer.

Alternatively, if we want a dedicated tool with a nicer description:

```typescript
{
  name: 'querySDK',
  description: 'Ask a question about the MindStudio SDK — available actions, models, connectors, integrations, and how to use them. Returns method signatures, code examples, and implementation guidance.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language question about the SDK' }
    },
    required: ['query']
  },
  async execute(input) {
    // shell out to: mindstudio ask "..."
  }
}
```
