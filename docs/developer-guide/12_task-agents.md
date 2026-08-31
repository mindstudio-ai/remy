# Task Agents

A full autonomous agent loop, callable from any method. Give it a prompt, a set of tools, and a JSON Schema for the output you want; the platform runs the model until it produces validated output matching that schema — searching, scraping, generating images, retrying approaches that failed, and calling the app's own methods to read and write data as it goes.

For example: a user types a restaurant name into an app. The method returns early, and in the background a task agent searches Google, finds the official website, scrapes the address, collects the social accounts, and generates a stylized watercolor illustration of the exterior from images it found. From one text field, the user gets back a card with canonical name, website, address, and a custom image.

Tools are **SDK actions** (`searchGoogle`, `generateImage`, …), **the app's own methods** (`{ appMethod: 'save-vendor' }`), and **inline functions** defined at the call site, in any combination. The latter two are what make a task agent part of the app rather than a detached research bot: it can read the app's tables to decide what to do next, and write results back itself instead of handing them over to be persisted.

---

## When to Use One

Reach for a task agent when a feature calls for the app to research, enrich, or create on the user's behalf.

- **Research and enrichment** — "given this email, find the person's LinkedIn, role, company, and a headshot": the model searches, scrapes, extracts, and assembles structured data.
- **Content creation pipelines** — "write SEO copy for this product in three languages, generate a hero image, extract keywords": the model calls text generation, image generation, and analysis actions as needed.
- **Data processing with judgment** — "given this restaurant name, find the canonical name, website, address, and create a stylized illustration."
- **Any multi-step task with branching logic** — where the model might retry a search with different terms, try another approach when one fails, or decide based on intermediate results.
- **Work that depends on app state** — "check which vendors are missing contact details, research those, and update them": the agent reads data with one method, decides what needs doing, and writes back with another.

### When Not To

- **Simple linear pipelines** (2-3 steps, no branching) — call the SDK actions or methods directly in sequence. `runTask()` adds the overhead of a model reasoning about what to do next.
- **Anything with a deterministic answer** — if you know which calls to make and in what order, make them. Handing a fixed sequence to a model buys nothing and can go wrong.
- **Chat or conversation** — use an [Agent interface](07_interfaces.md) instead. Task agents are single-shot with no persistent conversation history.
- **One-off text generation** — use `generateText()` directly. See [SDK Actions](11_sdk-actions.md).

### Where to run it

Run tasks in the background. Depending on complexity they take time, so return an early partial result to the user and update it with the final result when the agent finishes.

The exception is cron and email triggers. There is no user waiting, so `await` the task instead; awaiting is what surfaces its failures in the run's own result.

---

## Usage

```typescript
import { mindstudio } from '@mindstudio-ai/agent';

const result = await mindstudio.runTask({
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

  outputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: ['string', 'null'] },   // nullable = a type array, never `nullable: true`
      address: { type: 'string' },
      photoUrl: { type: 'string' },
    },
    required: ['name', 'url', 'address', 'photoUrl'],
  },

  model: 'claude-5-sonnet',   // don't copy this one blind — see "Choosing a model"
  maxTurns: 15,
});

// result.output is typed from the schema — no generic argument, no validation.
console.log(result.output.name);    // string
console.log(result.output.url);     // string | null
```

### Choosing a model

`model` is required and must support tool use. MindStudio's model IDs do not match vendor IDs, so a plausible-looking guess is usually wrong. Consult `askMindStudioSdk` for the current ID rather than copying one from an example.

---

## Output Contracts

Two ways to declare the output shape. They behave differently on failure.

### `outputSchema` (use this)

Validation is built in. The schema is plain JSON Schema in the tool-definition dialect: `type`, `properties`, `required`, `enum`, `items`, and nullability via type arrays like `['string', 'null']`.

Not supported: `oneOf`, `anyOf`, `$ref`, and `nullable: true`. Out-of-dialect schemas are rejected up front with `task_output_schema_unsupported`.

Output is validated every turn and repaired automatically. `runTask()` either returns schema-conforming typed output or throws a `MindStudioError` with `code === 'task_output_schema_mismatch'` (raw text and validation errors in `err.details`). It never resolves with garbage, so use `result.output` directly and validate only domain invariants the schema can't express.

For dynamic value sets, build the schema at runtime and put the set in an `enum`. The value is checked at runtime even though the type widens to `string`:

```typescript
import type { JsonObjectSchema } from '@mindstudio-ai/agent';

const services = [...new Set(rows.map((r) => r.service))];
const result = await mindstudio.runTask({
  // ...
  outputSchema: {
    type: 'object',
    properties: { service: { enum: services } },
    required: ['service'],
  } as const satisfies JsonObjectSchema, // needed when the schema lives in a variable
  // ...
});
```

### `structuredOutputExample` (legacy)

The output shape is suggested by example only, `output` is typed by a generic argument, and `runTask()` can return successfully with garbage — fields null, data echoed back, or raw text instead of JSON. Always check `parsedSuccessfully` before using the output:

```typescript
const result = await mindstudio.runTask<MyType>({ ... });

if (!result.parsedSuccessfully) {
  console.error('Task output was not valid JSON:', result.outputRaw);
  throw new Error('Task agent failed to produce structured output');
}

// Now safe to use result.output
await Table.update(id, result.output);
```

---

## Tool Configuration

The model receives the full input schema for each tool, so it knows what parameters to pass. Include only the tools the task actually needs — a model given extra tools may use them unnecessarily.

Use tool `defaults` for model and config choices. Use the prompt for task-level instructions.

```typescript
tools: [
  // SDK action — just the action name
  'searchGoogle',
  'fetchUrl',
  'scrapeUrl',

  // SDK action with defaults — override specific input fields while letting the model control the rest
  { method: 'generateImage', defaults: { imageModelOverride: { model: 'seedream-4.5' } } },
  { method: 'analyzeImage', defaults: { visionModelOverride: { model: 'gemini-3-flash' } } },

  // One of the app's own methods — note `appMethod`, not `method`
  { appMethod: 'listVendorsMissingContacts', description: 'Vendors with no email on file. Call this first to decide what needs researching.' },
  { appMethod: 'updateVendor', description: 'Write researched contact details back. One call per vendor.' },

  // An inline function — runs right here in the calling process
  {
    name: 'checkDomainReputation',
    description: 'Look up a domain in our internal blocklist. Call before trusting a scraped site.',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
    execute: async (input) => BlockedDomains.find(String(input.domain)),
  },
]
```

When the model calls a tool, the platform deep-merges the declared defaults over the model's arguments. **Defaults win** — any field set in `defaults` overrides whatever the model passed for it, including nested fields, so the model can't talk its way out of a pinned model or config. The model decides what to do (prompt, query, parameters); the caller controls which model and config it uses.

If the model needs to search and generate an image and those are independent, it will call both tools in the same turn — parallel execution happens server-side.

### App methods as tools

`{ appMethod: 'methodId' }` exposes one of the app's own methods. Use `appMethod`, not `method` — `method` means an SDK action, and the two are separate namespaces.

**Write the description.** Unlike agent interfaces, where each method gets one compiled description, a task agent's tool descriptions are written inline, per task. This is deliberate: the same method serves different purposes in different tasks. `getVendor` called by an enrichment task and `getVendor` called by a reporting task want different framing — when to call it, what to do with the result, whether to call it once or per item. The method's own description is only a fallback.

Keep descriptions short and task-specific. Say when to reach for the tool and when not to, since the model is choosing from a small flat list.

**Authorization is automatic.** The method runs as the user who invoked the method that started the task, with their roles. A method gated on a role they lack is rejected at runtime, exactly as if they had called it themselves. The agent cannot reach anything the user couldn't. That also means a task started from a background context (cron, webhook) runs with the `system` role — gate accordingly. See [Auth & Roles](06_roles-and-auth.md).

Constraints worth knowing:

- A method invoked as a task tool **cannot start another task agent**. Decompose differently if you're reaching for that.
- A method ID that collides with an SDK action name is rejected — the model sees one flat tool namespace. Rename the method.
- Method calls run in parallel with everything else in the turn, so don't expose two methods that would conflict if called simultaneously.
- Cost incurred inside a method (its own model calls) does not appear in the task's `usage.totalBillingCost`. It is billed and attributed to that method, just not rolled into the task total.

### Inline function tools

`{ name, description, inputSchema, execute }` defines a tool right in the calling method; the function executes in that process when the model calls it. Use it for task-private glue that doesn't deserve to be an app method: a lookup against the app's tables framed exactly for this task, a computation, a check against data the task closed over.

If the capability should exist in the app in its own right — invocable, authorized, visible in the manifest — make it a method and expose it with `appMethod` instead.

```typescript
{
  name: 'checkExisting',
  description: 'Look up whether we already track this vendor. Call before researching one.',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  execute: async (input) => Vendors.findByName(String(input.name)),
}
```

- `description` is required — it is everything the model knows about the tool. `inputSchema` is optional; omitting it means the tool takes no arguments.
- A thrown error is fed back to the model as `{ error: message }` tool output to work around. It never fails the task. Throw informative errors, same as app methods.
- No `defaults` — the function is your own code; close over whatever it needs.
- Names share the flat tool namespace: 1–64 characters of letters, digits, `_`, `-`, and no collisions with SDK action names.
- Calling `runTask()` from inside a function tool is not blocked the way it is from a method tool. The depth cap does not apply, so unbounded recursion (and its cost) is yours to prevent.

---

## Voice and Tone in Prompts

When a task agent produces user-facing text, state the voice and tone in the prompt, and rule out emojis, em dashes, and other AI-isms. The output goes straight to the user, so nothing downstream will catch them.

---

## Options

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | — | System prompt defining the agent's behavior |
| `input` | Yes | — | Structured input (passed as user message) |
| `tools` | Yes | — | SDK action names, `{ appMethod, description }` entries (each with optional `defaults`), and/or inline `{ name, description, inputSchema, execute }` function tools |
| `outputSchema` | One of these two | — | Plain JSON Schema for the output (`type`/`properties`/`required`/`enum`/`items`; nullable via type arrays, never `nullable: true`; no `oneOf`/`$ref`). Validated every turn with automatic repair; `result.output` typed from the schema. Use this |
| `structuredOutputExample` | One of these two | — | Legacy: object or JSON string showing expected output shape, unvalidated. Use realistic example values, not placeholders like `'string'`, and always check `parsedSuccessfully` |
| `model` | Yes | — | Model ID (must support tool use). Ask `askMindStudioSdk` for the right one; MindStudio's IDs don't match vendor IDs |
| `maxTurns` | No | 20 | Max loop iterations (capped at 100) |
| `onEvent` | No | — | SSE event callback for real-time streaming |

---

## Return Value

```typescript
interface RunTaskResult<T> {
  output: T;                // With outputSchema: validated, typed from the schema. With an example: whatever parsed
  outputRaw: string;        // Raw model text before JSON parse
  parsedSuccessfully: boolean; // Example mode only — always true in schema mode (a failure throws instead)
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

When something goes wrong, `toolCalls` is the first thing to check. If it is empty, the model never used any tools, which usually means the prompt isn't clear enough. If a tool failed, the model may have worked around it or produced garbage.

---

## Streaming

Pass an `onEvent` callback to receive real-time events:

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

Without `onEvent`, the SDK uses async polling and returns silently when complete. In dev, progress and results are logged to the console automatically with no setup.

---

## Error Handling

| Situation | Behavior |
|---|---|
| Model produces non-JSON output | Retried automatically if turns remain |
| With `outputSchema`, JSON that doesn't conform | Validation errors go back to the model as a repair turn (up to 3), then the call throws |
| Tool execution fails | Error fed back to the model; it can retry or work around it |
| An app method throws | Its actual error message goes back to the model, so a `MindStudioError` thrown deliberately ("vendor not found", "missing required field") is usable guidance the agent can act on. Worth throwing informative errors in methods exposed as tools |
| Max turns exceeded | One final forced output attempt with tools disabled |
| Exhausted with nonconforming output | Schema mode **throws** `task_output_schema_mismatch` (raw text and errors in `err.details`); example mode resolves with `parsedSuccessfully: false` and raw text in `outputRaw` |

```typescript
try {
  const result = await mindstudio.runTask({ ...with outputSchema... });
  // Conforming, typed output — use it directly.
  await Table.update(id, result.output);
} catch (err) {
  if (err instanceof MindStudioError) {
    // err.code: 'task_output_schema_mismatch' (couldn't produce conforming output;
    //   err.details has outputRaw + validation errors + toolCalls)
    // | 'task_output_schema_unsupported' (schema uses out-of-dialect keywords)
    // | 'task_execution_error' | 'poll_token_expired' | 'stream_error'
  }
}
```

---

## Related

- [Methods](05_methods.md) — task agents are called from methods, and expose methods as tools
- [SDK Actions](11_sdk-actions.md) — the action catalog a task agent draws its tools from
- [Interfaces](07_interfaces.md) — use an Agent interface for conversation; a task agent is single-shot
- [Jewels](13_jewels.md) — task agents are the usual way a jewel exercises judgment
