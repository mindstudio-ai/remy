# MindStudio Agent SDK

`@mindstudio-ai/agent` provides access to 200+ AI models and 1,000+ actions through a single API key. No separate provider keys needed. MindStudio routes to the correct provider (OpenAI, Anthropic, Google, etc.) server-side.

There is a huge amount of capability here: hundreds of text generation models (OpenAI, Anthropic, Google, Meta, Mistral, and more), dozens of image generation models (FLUX, DALL-E, Stable Diffusion, Ideogram, and more), video generation, text-to-speech, music generation, vision analysis, web scraping, 850+ OAuth connectors, and much more. The tables below are a summary. Always use `askMindStudioSdk` before writing SDK code.

## Usage in Methods

Inside a MindStudio app method, create an instance with no arguments — credentials come from the execution environment:

```typescript
import { MindStudioAgent } from '@mindstudio-ai/agent';

const agent = new MindStudioAgent();
```

Every action is a method on the agent instance:

```typescript
const { content } = await agent.generateText({ message: 'Summarize this...' });
```

Results are returned flat — output fields at the top level alongside metadata:

```typescript
const result = await agent.generateText({ message: 'Hello' });
result.content;              // step-specific output
result.$billingCost;         // cost in credits (if applicable)
```

## Available Actions

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
| `generateChart` | Chart from data | `data`, `chartType` | `imageUrl` |

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
| `sendEmail` | Send an email | `to`, `subject`, `body` | `messageId` |
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
| `uploadFile` | Upload a file to CDN |
| `downloadVideo` | Download a video URL |
| `getMediaMetadata` | Get dimensions, duration, etc. |
| `convertPdfToImages` | PDF pages to PNG images |

### Third-Party Integrations (OAuth Connectors)

850+ additional actions from the MindStudio Connector Registry, covering services like HubSpot, Salesforce, Airtable, Google Workspace, Notion, Coda, and many more. These require OAuth connections set up by the user in MindStudio.

Built-in connector methods include: ActiveCampaign, Airtable, Apollo, Coda, Facebook, Gmail, Google Docs/Sheets/Calendar/Drive, HubSpot, Hunter.io, Instagram, LinkedIn, Notion, X (Twitter), YouTube.

For other services, use `runFromConnectorRegistry`:

```typescript
// Discover available connectors
const { connectors } = await agent.listConnectors();

// Get action details
const action = await agent.getConnectorAction('hubspot', 'create-contact');

// Execute
const result = await agent.runFromConnectorRegistry({
  serviceId: 'hubspot',
  actionId: 'create-contact',
  input: { email: 'user@example.com', firstName: 'Alice' },
});
```

### Model Selection

Override the default model for any AI action. Each model has its own config options (dimensions, seed, inference steps, etc.) so always use `askMindStudioSdk` to look up the correct config before specifying a model override:

```typescript
const { content } = await agent.generateText({
  message: 'Hello',
  modelOverride: {
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    maxResponseTokens: 1024,
  },
});
```

### Batch Execution

Run up to 50 actions in parallel:

```typescript
const result = await agent.executeStepBatch([
  { stepType: 'generateImage', step: { prompt: 'a sunset' } },
  { stepType: 'textToSpeech', step: { text: 'hello world' } },
]);
// result.results[0].output, result.results[1].output
```
