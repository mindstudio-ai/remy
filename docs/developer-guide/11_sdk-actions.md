# SDK Actions

`@mindstudio-ai/agent` provides access to 200+ AI models and 1,000+ actions through a single API key. No separate provider keys are needed — MindStudio routes to the correct provider (OpenAI, Anthropic, Google, and others) server-side, and billing is handled centrally.

That includes hundreds of text generation models, dozens of image generation models (FLUX, DALL-E, Stable Diffusion, Ideogram, …), video generation, text-to-speech, music generation, vision analysis, web scraping, and 850+ OAuth connectors. The tables in this document are a summary, not the full catalog.

**Always consult `askMindStudioSdk` before writing SDK code.** It knows the full `@mindstudio-ai/agent` surface — every action, option, and return type — and it is the authority on model IDs, which do not match vendor IDs. A plausible-looking guess is usually wrong.

---

## Usage in Methods

Inside an app method, use the `mindstudio` singleton. Credentials come from the execution environment automatically — there is nothing to configure and no key to store as a [secret](10_secrets.md):

```typescript
import { mindstudio } from '@mindstudio-ai/agent';

const { content } = await mindstudio.generateText({ message: 'Summarize this...' });
```

Results are returned flat, with output fields at the top level alongside metadata:

```typescript
const result = await mindstudio.generateText({ message: 'Hello' });
result.content;              // step-specific output
result.$billingCost;         // cost in credits (if applicable)
```

---

## Capabilities

What the actions cover, including a few that aren't obvious:

- **Text generation** across every major model family
- **Image generation**, including images containing legible text
- **Image remixing** — take a user's uploaded image as the source for a generation model to restyle it, or combine several into a collage
- **Video generation**, including from reference images and start frames, with audio and voice
- **Speech and audio** — text-to-speech, music generation, transcription
- **Detailed image and video analysis** via vision models
- **Realtime events** — publish to named channels from any backend code; connected clients receive the payloads instantly (see Realtime Events below)

---

## Action Reference

### AI Generation

| Action | What it does | Key input | Key output |
|--------|-------------|-----------|------------|
| `generateText` | Text generation with any LLM | `message`, `modelOverride?` | `content` |
| `generateImage` | Image from text prompt | `prompt`, `modelOverride?` | `imageUrl` |
| `generateVideo` | Video from text/image | `prompt`, `imageUrl?` | `videoUrl` |
| `textToSpeech` | Text to spoken audio | `text`, `modelOverride?` | `audioUrl` |
| `generateMusic` | Music from text description | `prompt` | `audioUrl` |
| `generateLipsync` | Animate face to match audio | `imageUrl`, `audioUrl` | `videoUrl` |
| `generateAsset` | HTML/PDF/PNG/video output | `prompt` | `assetUrl` |

### AI Analysis

| Action | What it does | Key input | Key output |
|--------|-------------|-----------|------------|
| `analyzeImage` | Vision model analysis | `prompt`, `imageUrl` | `analysis` |
| `analyzeVideo` | Video analysis | `prompt`, `videoUrl` | `analysis` |
| `transcribeAudio` | Audio to text | `audioUrl` | `transcription` |
| `extractText` | Extract text from documents/images | `url` | `text` |
| `detectPII` | Find personal data | `text` | `entities` |

### Web & Search

| Action | What it does | Key input | Key output |
|--------|-------------|-----------|------------|
| `scrapeUrl` | Extract page content | `url` | `markdown` |
| `searchGoogle` | Google search | `query` | `results` |
| `searchGoogleImages` | Image search | `query` | `results` |
| `searchGoogleNews` | News search | `query` | `results` |
| `searchPerplexity` | AI-powered search | `query` | `answer` |
| `httpRequest` | Custom HTTP call | `url`, `method`, `headers?`, `body?` | `response` |

### Communication

| Action | What it does | Key input | Key output |
|--------|-------------|-----------|------------|
| `sendEmail` | Send an email (own-brand sender auto-selected) | `to`, `subject`, `body`, `cc?`, `bcc?`, `from?`, `replyTo?`, `inReplyTo?`, `references?`, `bodyType?`, `attachments?` | `recipients`, `cc`, `bcc`, `from` |
| `sendSMS` | Send a text message | `to`, `message` | `messageId` |
| `postToSlackChannel` | Post to Slack | `channel`, `message` | — |

### Media Processing

| Action | What it does |
|--------|-------------|
| `removeBackgroundFromImage` | Remove image background |
| `upscaleImage` | Upscale image resolution |
| `imageFaceSwap` | Swap faces in an image |
| `imageRemoveWatermark` | Remove watermarks |
| `mergeVideos` | Concatenate video clips |
| `trimMedia` | Trim audio/video |
| `addSubtitlesToVideo` | Auto-generate subtitles |
| `extractAudioFromVideo` | Extract audio track |
| `captureThumbnail` | Get video thumbnail |

### Files & Data

| Action | What it does |
|--------|-------------|
| `downloadVideo` | Download a video URL |
| `getMediaMetadata` | Get dimensions, duration, etc. |
| `convertPdfToImages` | PDF pages to PNG images |

Actions that produce files can write straight into a file store rather than returning a URL you then have to persist. See [Files & Storage](08_files-and-storage.md).

---

## Third-Party Integrations (OAuth Connectors)

850+ additional actions from the MindStudio Connector Registry, covering services like HubSpot, Salesforce, Airtable, Google Workspace, Notion, and Coda. These require OAuth connections set up by the user in Remy.

Built-in connector methods include: ActiveCampaign, Airtable, Apollo, Coda, Facebook, Gmail, Google Docs/Sheets/Calendar/Drive, HubSpot, Hunter.io, Instagram, LinkedIn, Notion, X (Twitter), YouTube.

For other services, use `runFromConnectorRegistry`:

```typescript
// Discover available connectors
const { connectors } = await mindstudio.listConnectors();

// Get action details
const action = await mindstudio.getConnectorAction('hubspot', 'create-contact');

// Execute
const result = await mindstudio.runFromConnectorRegistry({
  serviceId: 'hubspot',
  actionId: 'create-contact',
  input: { email: 'user@example.com', firstName: 'Alice' },
});
```

---

## Model Selection

Override the default model for any AI action with `modelOverride`. Each model has its own config options (dimensions, seed, inference steps, and so on), so look up the correct config with `askMindStudioSdk` before specifying an override:

```typescript
const { content } = await mindstudio.generateText({
  message: 'Hello',
  modelOverride: {
    model: 'claude-5-sonnet',
    temperature: 0.7,
    maxResponseTokens: 16000,
  },
});
```

Two rules:

- **Prefer current-generation models.** MindStudio carries many models, most of them historical. Start from the latest generation from leading providers — the Anthropic Claude family, Google Gemini, OpenAI GPT — rather than picking something recognizable from an older generation.
- **Generally don't set `maxResponseTokens`.** Let models stop on their own and control length through prompt guidance instead. The limit **includes thinking tokens**, so setting it too low returns no usable result at all.

---

## Batch Execution

Run up to 50 actions in parallel:

```typescript
const result = await mindstudio.executeStepBatch([
  { stepType: 'generateImage', step: { prompt: 'a sunset' } },
  { stepType: 'textToSpeech', step: { text: 'hello world' } },
]);
// result.results[0].output, result.results[1].output
```

---

## Realtime Events

Realtime over named channels — no polling, no WebSocket code:

```typescript
import { auth, events } from '@mindstudio-ai/agent';

// The subscribe door is one of your methods — auth checks first, then mint.
// `publish` names channels the CLIENT may speak on (ephemeral signals like
// cursors and typing, sent directly — no method invoke per signal):
export async function watchInbox() {
  auth.requireRole('member');
  return await events.grant(`user:${auth.userId}`); // { token, expiresAt, ttlSeconds }
}
export async function joinCanvas(input: { roomId: string }) {
  await assertRoomMember(input.roomId);
  return await events.grant(`canvas:${input.roomId}`, { publish: [`canvas:${input.roomId}`] });
}

// Anything can publish — a method, a cron, a webhook handler.
// One call, up to 500 channels (audience fan-out):
await events.publish(`user:${assignee}`, { type: 'ticket', id: ticket.id });
```

The frontend consumes with `events.connect({ getToken, onEvent, onConnect })` from `@mindstudio-ai/interface`; the SDK handles reconnection and grant renewal. The returned subscription exposes `sub.publish(channels, data)` for grant-authorized client signals — call it per input event; the SDK coalesces to ~40ms batches and drops (never retries) on failure. Client events cap at 8k serialized, 30 batches/sec per grant.

**A channel is an audience, and a method decides who is in it.** Default to per-user channels with publish-time fan-out (removing someone stops their events immediately); reserve shared channels for genuinely broadcast content. For anonymous visitors `auth.userId` is null — key their channels on `session.visitorId` instead. Events are at-most-once nudges — nothing is buffered or replayed, so clients refetch state in `onConnect` (subscribe for speed, reconcile for truth). Every frame carries the platform-stamped publish `id` (dedupe key: `id` + `channel`), and `publish` returns the same id. Payloads cap at 256k serialized characters, checked in the SDK before the network call; when a publish carries data, publish before committing the write it announces — high-rate paths publish ids and let the client fetch.

Debug with `remy-admin events tail` / `publish` / `channels list`. Full treatment — channel design, grant lifecycle, the chat worked example — in the `realtimeEvents` skill.

---

## When to Use a Task Agent Instead

Chaining actions manually is right for a linear pipeline. For multi-step work where the model needs to decide what to do next (research plus scrape plus generate, enrichment pipelines, content creation with branching), use `runTask()` instead. It runs an agent loop and returns validated structured output, and its tools can include SDK actions, the app's own methods, and inline functions.

See [Task Agents](12_task-agents.md) for the full reference.

---

## Related

- [Methods](05_methods.md) — where SDK actions are called from
- [Task Agents](12_task-agents.md) — autonomous composition of these actions
- [Files & Storage](08_files-and-storage.md) — writing generated assets straight into a store
- [Secrets](10_secrets.md) — only needed for services the SDK does *not* cover
