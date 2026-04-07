# Task Agents (`MindStudioAgent runTask`)

`runTask()` runs a multi-step, tool-use agent loop. Give it a prompt, a set of SDK actions as tools, and an example of the structured output you want. The platform runs a loop (calling the model, executing tool calls, feeding results back) until the model produces JSON matching your output example.

Use this for tasks where the model needs to autonomously decide what to do next based on intermediate results. Instead of manually chaining `searchGoogle` then `fetchUrl` then `generateImage` in code, describe the goal and let the model compose the actions. Use `askMindStudioSdk` to help you construct the perfect agent for a task.

## When to Use

Run this in the background - depending on the task it can take time to complete. Return an early partial result to the user and upsert later with the final result when the agent has finished executing its task.

- **Research and enrichment:** "Given this email, find the person's LinkedIn, role, company, and a headshot" — the model searches, scrapes, extracts, and assembles structured data.
- **Content creation pipelines:** "Write SEO copy for this product in 3 languages, generate a hero image, extract keywords" — the model calls text generation, image generation, and analysis actions as needed.
- **Data processing with judgment:** "Given this restaurant name, find the canonical name, website, address, and create a stylized illustration" — the model searches, verifies, generates, and returns clean structured output.
- **Any multi-step task with branching logic:** If the model might need to retry a search with different terms, try a different approach when one fails, or make decisions based on intermediate results.

## When NOT to Use

- **Simple linear pipelines (2-3 steps, no branching):** Just call the SDK actions directly in sequence. `runTask()` adds overhead from the model reasoning about what to do next.
- **Chat/conversation:** Use an Agent interface instead. Task agents are single-shot, no persistent conversation history.
- **One-off text generation:** Just use `generateText()` directly.

## Usage

```typescript
import { MindStudioAgent } from '@mindstudio-ai/agent';

const agent = new MindStudioAgent();

const result = await agent.runTask<{
  name: string;
  url: string;
  address: string;
  photoUrl: string;
}>({
  prompt: `You are a restaurant research assistant. Given a restaurant name,
    find its canonical name, website URL, full address, and create a stylized
    watercolor illustration of the restaurant exterior.`,

  input: { restaurantName: 'Tartine Bakery SF' },

  tools: [
    'searchGoogle',
    'fetchUrl',
    { method: 'generateImage', defaults: { imageModelOverride: { model: 'seedream-4.5' } } },
  ],

  structuredOutputExample: JSON.stringify({
    name: 'Tartine Bakery',
    url: 'https://tartinebakery.com',
    address: '600 Guerrero St, San Francisco, CA 94110',
    photoUrl: 'https://cdn.mindstudio.ai/...',
  }),

  model: 'claude-4-6-sonnet',
  maxTurns: 15,
});

console.log(result.output.name);    // 'Tartine Bakery'
console.log(result.output.photoUrl); // URL to the generated illustration
```

## Tool Configuration

Tools are SDK action names. The model gets the full input schema for each tool so it knows what parameters to pass.

```typescript
tools: [
  // Simple — just the action name
  'searchGoogle',
  'fetchUrl',
  'scrapeUrl',

  // With defaults — override specific input fields while letting the model control the rest
  { method: 'generateImage', defaults: { imageModelOverride: { model: 'seedream-4.5' } } },
  { method: 'analyzeImage', defaults: { visionModelOverride: { model: 'gemini-3-flash' } } },
]
```

When the model calls a tool, the platform deep-merges the model's arguments with the developer's defaults. The model decides what to do (prompt, query, parameters), the developer controls which model/config to use.

## Options

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | — | System prompt defining the agent's behavior |
| `input` | Yes | — | Structured input (passed as user message) |
| `tools` | Yes | — | SDK action names with optional defaults |
| `structuredOutputExample` | Yes | — | JSON string showing expected output shape |
| `model` | Yes | — | Model ID (must support tool use) |
| `maxTurns` | No | 10 | Max loop iterations (capped at 25) |
| `onEvent` | No | — | SSE event callback for real-time streaming |

## Models

Use `askMindStudioSdk` for appropriate models given the task and its complexity.

## Return Value

```typescript
interface RunTaskResult<T> {
  output: T;       // Parsed structured output matching your example
  turns: number;   // Number of loop iterations used
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalBillingCost: number;
  };
}
```

## Streaming

Pass an `onEvent` callback to get real-time events:

```typescript
const result = await agent.runTask({
  // ... same options ...
  onEvent: (event) => {
    if (event.type === 'text') console.log('Agent:', event.text);
    if (event.type === 'tool_call_start') console.log(`Calling ${event.name}...`);
    if (event.type === 'tool_call_result') console.log('Result:', event.output);
  },
});
```

Event types: `text`, `tool_call_start`, `tool_call_result`, `thinking`, `error`, `done`.

Without `onEvent`, the SDK uses async polling (returns silently when complete).

## Error Handling

- Model produces non-JSON output: retried automatically if turns remain
- Tool execution fails: error fed back to model, it can retry or work around it
- Max turns exceeded: one final forced output attempt with tools disabled
- If output still can't be parsed: raw text returned as output (not JSON)

```typescript
try {
  const result = await agent.runTask({ ... });
} catch (err) {
  if (err instanceof MindStudioError) {
    // err.code: 'task_execution_error' | 'poll_token_expired' | 'stream_error'
  }
}
```
