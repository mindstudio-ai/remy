---
name: Task Agents
what: A full autonomous agent loop callable from any method. Give it a prompt, a set of tools, and an example of the output shape; the platform runs the model until it produces that shape — searching, scraping, generating images, retrying approaches that failed, and calling your app's own methods to read and write data as it goes. Tools can be any of the 1000+ SDK actions and your own methods in any combination, which is what makes it part of the app rather than a detached research bot. This is the difference between a feature that saves what the user typed and one that researches, enriches, and creates on their behalf, and it is one of the most powerful things the platform can do. Consider it whenever a feature would be dramatically more compelling if the app could do real work autonomously.
when: Before writing any `mindstudio.runTask()` call — background enrichment, research-and-generate, anything where the model decides its own next step.
---

# Task Agents (`mindstudio.runTask`)

A user types the name of a restaurant into your app, or uploads a photo of a storefront. The API call returns early, and in the background, a task agent searches Google, finds the official website, scrapes the address, gets the official social media accounts, and generates a stylized watercolor postcard of the exterior from images it found online. The user gets back a rich, illustrated card with the canonical name, website, address, and a custom image. A few tool calls (some in parallel), fully autonomous.

`runTask()` makes this possible. It runs a multi-step, tool-use agent loop: give it a prompt, a set of tools, and an example of the structured output you want. The platform runs the loop (calling the model, executing tool calls, feeding results back) until the model produces JSON matching your output example. The model decides what to do next based on intermediate results — retrying searches with different terms, working around failed tools, batching independent calls in parallel.

Tools are **SDK actions** (`searchGoogle`, `generateImage`, …) and **your own app's methods** (`{ appMethod: 'saveVendor' }`), in any combination. That second half is what makes a task agent part of your app rather than a detached research bot: it can read your tables to decide what to do next, and write results back itself instead of handing them to you to persist.

This is one of the most powerful pieces of the MindStudio SDK, and it can turn an app from amazing into truly magical. Use `askMindStudioSdk` to help construct the right agent for a task — including which model to give it.

## When to Use

This is the tool to reach for whenever a feature would be dramatically more compelling if the app could autonomously research, enrich, or create on behalf of the user. Think about the difference between "user enters a restaurant name and it gets saved" vs. "user enters a restaurant name and gets back a fully researched, illustrated card." Task agents close that gap.

Run tasks in the background — depending on complexity they can take time to complete. Return an early partial result to the user and upsert later with the final result when the agent finishes.

- **Research and enrichment:** "Given this email, find the person's LinkedIn, role, company, and a headshot" — the model searches, scrapes, extracts, and assembles structured data.
- **Content creation pipelines:** "Write SEO copy for this product in 3 languages, generate a hero image, extract keywords" — the model calls text generation, image generation, and analysis actions as needed.
- **Data processing with judgment:** "Given this restaurant name, find the canonical name, website, address, and create a stylized illustration" — the model searches, verifies, generates, and returns clean structured output.
- **Any multi-step task with branching logic:** If the model might need to retry a search with different terms, try a different approach when one fails, or make decisions based on intermediate results.
- **Work that depends on app state:** "Check which vendors are missing contact details, research those, and update them" — the agent reads your data with one method, decides what needs doing, and writes back with another.

## When NOT to Use

- **Simple linear pipelines (2-3 steps, no branching):** Just call the SDK actions or your methods directly in sequence. `runTask()` adds overhead from the model reasoning about what to do next.
- **Anything with a deterministic answer:** If you know exactly which methods to call and in what order, call them. Handing a fixed sequence to a model buys nothing and can go wrong.
- **Chat/conversation:** Use an Agent interface instead. Task agents are single-shot, no persistent conversation history.
- **One-off text generation:** Just use `generateText()` directly.

## Usage

```typescript
import { mindstudio } from '@mindstudio-ai/agent';

const result = await mindstudio.runTask<{
  name: string;
  url: string;
  address: string;
  photoUrl: string;
}>({
  prompt: `You are a restaurant research assistant. Given a restaurant name,
    find its canonical name, website URL, full address, and create a stylized
    watercolor illustration of the restaurant exterior. Save the result before
    you finish.`,

  input: { restaurantName: 'Tartine Bakery SF' },

  tools: [
    'searchGoogle',
    'fetchUrl',
    { method: 'generateImage', defaults: { imageModelOverride: { model: 'seedream-4.5' } } },
    {
      appMethod: 'saveRestaurant',
      description: 'Persist a researched restaurant. Call once, at the end, when you have the canonical name, address and illustration.',
    },
  ],

  structuredOutputExample: {
    name: 'Tartine Bakery',
    url: 'https://tartinebakery.com',
    address: '600 Guerrero St, San Francisco, CA 94110',
    photoUrl: 'https://cdn.mindstudio.ai/...',
  },

  model: 'claude-5-sonnet',   // ask askMindStudioSdk — don't copy this one blind
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
const result = await mindstudio.runTask<MyType>({ ... });

if (!result.parsedSuccessfully) {
  console.error('Task output was not valid JSON:', result.outputRaw);
  throw new Error('Task agent failed to produce structured output');
}

// Now safe to use result.output
await Table.update(id, result.output);
```

## Tool Configuration

The model gets the full input schema for each tool so it knows what parameters to pass. Only include tools the task actually needs — the model may use extra tools unnecessarily.

Use tool defaults for model/config choices. Use the prompt for task-level instructions.

```typescript
tools: [
  // SDK action — just the action name
  'searchGoogle',
  'fetchUrl',
  'scrapeUrl',

  // SDK action with defaults — override specific input fields while letting the model control the rest
  { method: 'generateImage', defaults: { imageModelOverride: { model: 'seedream-4.5' } } },
  { method: 'analyzeImage', defaults: { visionModelOverride: { model: 'gemini-3-flash' } } },

  // One of your app's own methods — note `appMethod`, not `method`
  { appMethod: 'listVendorsMissingContacts', description: 'Vendors with no email on file. Call this first to decide what needs researching.' },
  { appMethod: 'updateVendor', description: 'Write researched contact details back. One call per vendor.' },
]
```

When the model calls a tool, the platform deep-merges your defaults over the model's arguments. **Defaults win** — any field set in `defaults` overrides whatever the model passed for it, including nested fields, so the model can't talk its way out of a pinned model or config. The model decides what to do (prompt, query, parameters), you control which model/config it uses. If the model needs to search and generate an image and those are independent, it will call both tools in the same turn (parallel execution server-side).

### App methods as tools

`{ appMethod: 'methodId' }` exposes one of your app's methods. Use `appMethod`, not `method` — `method` means an SDK action, and the two are different namespaces.

**Write the description.** Unlike agent interfaces, where each method gets one compiled description, a task agent's tool descriptions are written inline, per task. This is deliberate: the same method serves different purposes in different tasks. `getVendor` called by an enrichment task and `getVendor` called by a reporting task want different framing — when to call it, what to do with the result, whether to call it once or per item. The method's own description is only a fallback.

Keep them short and task-specific. Say when to reach for it and when not to, since the model is choosing from a small flat list.

**Authorization is automatic.** The method runs as the user who invoked the method that started the task, with their roles. A method gated on a role they lack is rejected at runtime, exactly as if they'd called it themselves. The agent cannot reach anything the user couldn't — but that also means a task started from a background context (cron, webhook) runs with the `system` role, so gate accordingly.

**Constraints worth knowing:**

- A method invoked as a task tool **cannot start another task agent**. Decompose differently if you're reaching for that.
- A method id that collides with an SDK action name is rejected — the model sees one flat tool namespace. Rename the method.
- Method calls run in parallel with everything else in the turn, so don't expose two methods that would conflict if called simultaneously.
- Cost from inside a method (its own model calls) doesn't appear in the task's `usage.totalBillingCost`. It's billed and attributed to that method, just not rolled into the task total.

## Voice & Tone in Prompts

When a task agent produces user-facing text, the prompt must state the voice and tone it should write in. Specify the desired voice explicitly, and rule out emojis, em dashes, and other "ai-isms" — the output goes straight to the user, so nothing downstream will catch them.

## Options

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | — | System prompt defining the agent's behavior |
| `input` | Yes | — | Structured input (passed as user message) |
| `tools` | Yes | — | SDK action names and/or `{ appMethod, description }` entries, each with optional `defaults` |
| `structuredOutputExample` | Yes | — | Object or JSON string showing expected output shape. Use realistic example values, not placeholders like `'string'` |
| `model` | Yes | — | Model ID (must support tool use). Ask `askMindStudioSdk` for the right one — MindStudio's ids don't match vendor ids, so a plausible-looking guess is usually wrong |
| `maxTurns` | No | 20 | Max loop iterations (capped at 100) |
| `onEvent` | No | — | SSE event callback for real-time streaming |

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
const result = await mindstudio.runTask({
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
- An app method that throws: its actual error message goes back to the model, so a `MindStudioError` you throw deliberately ("vendor not found", "missing required field") is usable guidance the agent can act on. Worth throwing informative errors in methods you expose as tools
- Max turns exceeded: one final forced output attempt with tools disabled
- If output still can't be parsed: `parsedSuccessfully` will be `false`, raw text available in `outputRaw`

```typescript
try {
  const result = await mindstudio.runTask({ ... });
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
