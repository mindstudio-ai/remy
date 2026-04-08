# Task Agents (`MindStudioAgent runTask`)

A user types the name of a restaurant into your app, or uploads a photo of a storefront. The API call returns early, and in the background, a task agent searches Google, finds the official website, scrapes the address, gets the official social media accounts, and generates a stylized watercolor postcard of the exterior from images it found online. The user gets back a rich, illustrated card with the canonical name, website, address, and a custom image. A few tool calls (some in parallel), fully autonomous.

`runTask()` makes this possible. It runs a multi-step, tool-use agent loop: give it a prompt, a set of SDK actions as tools, and an example of the structured output you want. The platform runs the loop (calling the model, executing tool calls, feeding results back) until the model produces JSON matching your output example. The model decides what to do next based on intermediate results — retrying searches with different terms, working around failed tools, batching independent calls in parallel.

This is one of the most powerful pieces of the MindStudio SDK and can make turn apps from amazing into truly magical. Use `askMindStudioSdk` to help construct the perfect agent for a task.

## When to Use

This is the tool to reach for whenever a feature would be dramatically more compelling if the app could autonomously research, enrich, or create on behalf of the user. Think about the difference between "user enters a restaurant name and it gets saved" vs. "user enters a restaurant name and gets back a fully researched, illustrated card." Task agents close that gap.

Run tasks in the background — depending on complexity they can take time to complete. Return an early partial result to the user and upsert later with the final result when the agent finishes.

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

  structuredOutputExample: {
    name: 'Tartine Bakery',
    url: 'https://tartinebakery.com',
    address: '600 Guerrero St, San Francisco, CA 94110',
    photoUrl: 'https://cdn.mindstudio.ai/...',
  },

  model: 'claude-4-6-sonnet',
  maxTurns: 15,
});

// Always validate before using output
if (!result.parsedSuccessfully) {
  console.error('Task failed to produce structured output:', result.outputRaw);
  throw new Error('Task agent failed');
}

console.log(result.output.name);    // 'Tartine Bakery'
console.log(result.output.photoUrl); // URL to the generated illustration
```

## Always Validate Output

`runTask()` can return successfully with garbage output — fields null, data echoed back, or raw text instead of JSON. The result includes `parsedSuccessfully` to make this explicit. Always check it before using the output:

```typescript
const result = await agent.runTask<MyType>({ ... });

if (!result.parsedSuccessfully) {
  console.error('Task output was not valid JSON:', result.outputRaw);
  throw new Error('Task agent failed to produce structured output');
}

// Now safe to use result.output
await Table.update(id, result.output);
```

## Tool Configuration

Tools are SDK action names. The model gets the full input schema for each tool so it knows what parameters to pass. Only include tools the task actually needs — the model may use extra tools unnecessarily.

Use tool defaults for model/config choices. Use the prompt for task-level instructions.

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

When the model calls a tool, the platform deep-merges the model's arguments with the developer's defaults. The model decides what to do (prompt, query, parameters), the developer controls which model/config to use. If the model needs to search and generate an image and those are independent, it will call both tools in the same turn (parallel execution server-side).

## Options

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | — | System prompt defining the agent's behavior |
| `input` | Yes | — | Structured input (passed as user message) |
| `tools` | Yes | — | SDK action names with optional defaults |
| `structuredOutputExample` | Yes | — | Object or JSON string showing expected output shape. Use realistic example values, not placeholders like `'string'` |
| `model` | Yes | — | Model ID (must support tool use) |
| `maxTurns` | No | 10 | Max loop iterations (capped at 25) |
| `onEvent` | No | — | SSE event callback for real-time streaming |

## Models

Use `askMindStudioSdk` for appropriate models given the task and its complexity.

## Return Value

```typescript
interface RunTaskResult<T> {
  output: T;                // Parsed structured output matching your example
  outputRaw: string;        // Raw model text before JSON parse
  parsedSuccessfully: boolean; // Whether output was valid JSON
  turns: number;            // Number of loop iterations used
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalBillingCost: number;
  };
  toolCalls: Array<{        // Execution log for debugging
    name: string;
    success: boolean;
    durationMs: number;
  }>;
}
```

When something goes wrong, `toolCalls` is the first thing to check. If it's empty, the model never used any tools (prompt probably isn't clear enough). If a tool failed, the model may have worked around it or produced garbage.

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

Event types: `text`, `thinking`, `thinking_complete`, `tool_use`, `tool_input_delta`, `tool_input_args`, `tool_call_start`, `tool_call_result`, `error`, `done`.

Without `onEvent`, the SDK uses async polling (returns silently when complete). In dev mode (via the dev tunnel), progress and results are automatically logged to console with no setup needed.

## Error Handling

- Model produces non-JSON output: retried automatically if turns remain
- Tool execution fails: error fed back to model, it can retry or work around it
- Max turns exceeded: one final forced output attempt with tools disabled
- If output still can't be parsed: `parsedSuccessfully` will be `false`, raw text available in `outputRaw`

```typescript
try {
  const result = await agent.runTask({ ... });
  if (!result.parsedSuccessfully) {
    // Task completed but output wasn't valid JSON
    console.error('Raw output:', result.outputRaw);
    console.error('Tool calls:', result.toolCalls);
  }
} catch (err) {
  if (err instanceof MindStudioError) {
    // err.code: 'task_execution_error' | 'poll_token_expired' | 'stream_error'
  }
}
```
