---
name: Voice Interfaces
what: Realtime voice conversation as a first-class interface — the user talks to the app and its voice agent talks back in sub-second, interruptible speech, calling the app's methods mid-conversation as the authenticated user. The platform handles the media transport, turn-taking, barge-in, and transcripts, so the work is authorship — a persona written for the ear, a small toolset where every tool carries a latency class, and descriptions that say results out loud. Any app whose methods do something interesting can pick up a voice, and it is often the most impressive surface it has.
when: Before authoring `src/interfaces/voice.md`, choosing a voice model or pipeline, deciding which methods a voice agent gets, or building the voice UI with `createVoiceClient()`.
---

# Building Voice Interfaces

A voice interface is the app's agent as a live phone-call-quality conversation: the user speaks, the
agent answers in speech, and the app's methods are its tools. It is a **sibling of the agent
interface, not a mode of it** — the two share a philosophy (an LLM projecting the backend contract
into conversation; load the `agentInterfaces` skill for that shared ground), but everything you
author differs. The persona is written for the ear, not the screen. The toolset is smaller and
curated for conversational latency. And every tool declares how the agent should handle the wait,
because in a live call, silence reads as a dropped line.

The platform owns the hard parts — realtime audio transport, turn detection, interruption handling,
transcripts, session limits, per-user auth on every tool call. Your job is the spec
(`src/interfaces/voice.md`) and its compilation into `dist/interfaces/voice/`.

## Voice Agent Design

### Written for the ear

Everything the agent produces gets spoken aloud. That inverts several habits that are correct
everywhere else, and the compiled system prompt must carry them explicitly:

- **No visual formatting, ever.** No markdown, no lists, no tables, no emoji, no URLs read as
  punctuation soup. If a tool returns a link, say what it is and where it will be, don't recite it.
- **Spoken-form values.** "Forty-two fifty," not "$42.50". "Two fifteen in the afternoon," not
  "14:15". Read email addresses and confirmation codes character by character, and read them *back*
  for confirmation before acting on them — mishearing one digit of a phone number is the classic
  voice failure.
- **Brevity is a hard rule, not a style preference.** One to two sentences per turn, one question at
  a time. A paragraph that reads fine in chat is a monologue on a call.
- **Handle unclear audio explicitly.** Give the prompt a rule for it: respond only to clear audio;
  if it's noisy or ambiguous, ask the user to repeat — never guess, and never call a tool on input
  the agent isn't sure it heard.
- **Pin the language.** State the response language in the prompt; don't let the model infer it from
  an accent.

Beyond the mechanics, the persona itself should be *of the ear*: pacing, warmth, how it handles
being interrupted, what it says when it needs a second. This is the fun part, same as the agent
interface — a distinct character beats a generic assistant, and voice makes character land harder
than any other surface.

### The latency classes

Every tool in the spec declares one of three classes. This is the voice-specific discipline — get it
right and tool use feels like talking to a competent person; get it wrong and every action is an
awkward pause.

- **`fast`** — sub-second reads: lookups, availability checks, small queries. The agent calls
  silently; announcing a sub-second call adds more delay than the call itself.
- **`slow`** — a noticeable wait, roughly one to three seconds: writes, searches, anything that does
  real work. The agent speaks a one-line preamble ("Let me get that booked") generated in parallel
  with the call, so the line never goes quiet.
- **`background`** — long-running work: reports, enrichment, bulk operations. The agent
  acknowledges, keeps conversing, and reports the result when it lands. Background tools are
  cancellable — if the user changes course mid-run, the work stops.

Classify by how the method actually behaves, not by what it is named. A "lookup" that fans out to an
external service is `slow`. When in doubt between `fast` and `slow`, pick `slow` — a needless
preamble is mildly chatty; an unexplained silence feels broken.

### Tool descriptions say results out loud

Follow the agent-interface principles for tool descriptions (when to use and when not, parameter
guidance, what comes back) — plus one voice-specific layer: **how to speak the result.** A tool that
returns a booking record needs its description to say what the confirmation sounds like ("You're all
set for Tuesday at two") and what never gets read aloud (internal ids, timestamps, enum values).

Curate harder than you would for chat. A voice agent with four excellent tools outperforms one with
twelve adequate ones — every tool the model considers is a beat of hesitation. Skip batch
operations, admin utilities, and anything whose output can't be said in a breath or two. Note role
restrictions in the description so the agent declines gracefully in character instead of surfacing a
rejection.

### Confirmation scales with risk

Bake the policy into the system prompt: read-only tools — just call them. Writes — summarize what's
about to happen and get a yes. Anything destructive or financial — read the details back first,
piece by piece. In voice there is no confirmation dialog to lean on; the conversation *is* the
confirmation UI.

### Choosing the model

Two shapes, one `model` field:

- **Native speech-to-speech** (`{"model": ..., "voice": ...}`) — one realtime model hears and
  speaks. Lowest latency, most natural prosody, hears tone and hesitation. The default for
  personality-forward, conversational apps.
- **Cascaded** (`{"llm": ..., "stt": ..., "tts": ..., "voice": ...}`) — streaming transcription
  into any chat model in the catalog, streaming speech out. Slightly higher latency, but the brain
  can be *any* chat model — the right choice when the app's reasoning demands a specific model, or
  when the agent interface already uses one and the voice should think identically. The blessed
  streaming pairing is `"stt": "deepgram-nova-3", "tts": "cartesia-sonic-3"` — the lowest-latency
  combination the platform wires; prefer it unless there's a reason not to. One nuance: cascaded
  engines speak the `greeting` verbatim (they have a real TTS); speech-to-speech engines have the
  model say it, so it may paraphrase slightly.

Ask `askMindStudioSdk` for available ids — realtime, transcription, and speech models are separate
catalogs, and MindStudio ids don't match vendor ids, so treat ids in this document as illustrative.
Voice ids are model-specific; query for those too. The user's UI has a picker for changing the model
later, so validate only when you set it.

### Seeding from an existing agent

If the app already has an agent interface, start from it: same character, same values, same
terminology — then rewrite for the ear (shorter, spoken-form, no formatting) and re-curate the
toolset for latency. Don't copy `agent.md`'s prose wholesale; a chat persona read aloud sounds like
someone reading chat aloud.

### Anti-patterns

- Prose that would render fine in chat — bullet lists, headers, or markdown anywhere in `system.md`.
- A tool description that explains what to display instead of what to say.
- Exposing the whole method surface. Voice is the most curated interface the app has.
- A generic greeting ("Hello! How can I assist you today?"). The greeting is the first thing anyone
  hears; make it the character's.
- Writing your own current-user placeholder — the platform appends a `## Current User` block (name,
  roles) to every system prompt at runtime.

## Compiling the Voice Spec

When building `dist/interfaces/voice/`, consider the spec, the app, and the `@brand/` guidelines —
the voice agent should be unmistakably the same product as the web UI, projected into sound. Output:

**`system.md`** — the persona compiled for the ear. Character first, then the mandatory carries from
"Written for the ear" above (spoken-form rules, brevity, unclear-audio handling, language pinning,
confirmation-by-risk), then any preamble phrasing guidance for `slow` tools so the fillers sound like
the character too.

**`tools/*.md`** — one per tool: when to use, parameter guidance, how to say the result, role
restrictions.

**`interface.json`** — the config tying it together. Full shape in "The wiring" below.

## Voice UI

When the app has a web interface, voice arrives as a **layer over it**, not a separate page: a
persistent affordance (a button, an orb in a corner) that starts a session in place, with the app
still visible and usable. A dedicated full-screen voice mode is the immersive option for apps where
the conversation *is* the product — earn it, don't default to it.

### Frontend SDK: `createVoiceClient()`

Ships as a subpath of the interface SDK so apps that never use voice pay nothing for it. All voice
UIs go through it — never hand-roll audio capture or transport.

```ts
import { createVoiceClient } from '@mindstudio-ai/interface/voice';

const voice = createVoiceClient();

// Prompts for mic permission, mints a session, connects.
// Throws MindStudioInterfaceError('microphone_denied') on refusal.
const session = await voice.startSession();

session.state;  // 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended'
session.on('stateChange', (state) => { });          // on() returns an unsubscribe fn

// Live captions, both sides. Each event carries the segment's FULL text so
// far (never a delta) — render by upserting on segmentId, not appending.
session.on('transcript', ({ role, segmentId, text, final }) => { });

session.on('toolCall', ({ method, status }) => { }); // 'running' | 'done' | 'failed'
session.on('error', (err) => { });

session.mute(); session.unmute(); session.isMuted;
session.sendText('123 Main Street');  // inject text into the live conversation
session.end();
```

Agent audio playback is handled inside the SDK (a hidden autoplaying element) — never create audio
elements for the agent. `startSession()` throws `MindStudioInterfaceError` with code
`microphone_denied` when mic access is refused (surface that state gently in the UI),
`voice_concurrency_limit` / `voice_visitor_limit` when the app's session limits are hit, and
`auth_required` (401) / `role_required` (403) when the interface's `auth` block denies the caller
(route those to the app's login flow).

Past sessions are call records with transcripts: `voice.listSessions()` /
`voice.getSession(id)` — the material for a history view if the app wants one.

### The state machine, made visible

One audio-reactive element carries the session: idle → connecting → listening → thinking → speaking.
Always pair it with a **text state label** — never signal state by color or motion alone. Calm at
idle, responsive to actual audio levels while listening and speaking. Respect
`prefers-reduced-motion` with a static-but-labeled variant.

### Live captions

Stream `transcript` events as captions — both sides of the conversation. Captions make the agent
feel accurate, catch mishearings early, and are the accessibility story. User-side transcripts
arrive as recognition output and can lag or differ slightly from what the model heard; render them
as captions, never treat them as input to app logic.

### Controls that must exist

**Mute** and **end call**, always visible, always working. `sendText` earns its place the moment the
conversation needs an exact string — an address, a code, an email — typing it beats spelling it
aloud three times. Show tool activity as a compact inline status from `toolCall` events, in the
app's voice ("Booking your appointment…"), never raw names or JSON.

### Anti-patterns

- Blocking the whole UI behind the session — voice is a layer, the app stays usable.
- An orb with no label, or state changes conveyed only by color.
- Rendering user-side captions as authoritative ("you said X") — they're recognition output.
- Auto-starting a session on page load. Microphone access is always a deliberate user action.

---

# The wiring

## Spec: `src/interfaces/voice.md`

Frontmatter holds the structured fields; the body is the persona plus an explicit `## Tools`
section.

```yaml
---
name: Front Desk
description: Books appointments and answers questions by voice.
type: interface/voice
model: {"model": "gpt-realtime-mini", "voice": "marin"}
turnDetection: {"eagerness": "medium"}
greeting: Hey! I can help you book, reschedule, or answer questions — what do you need?
---
```

Frontmatter fields:

- `name` — display name
- `description` — one-liner for listings
- `model` — JSON string, two shapes: native speech-to-speech `{"model": <realtime model id>,
  "voice": <voice id>}`, or cascaded `{"llm": <chat model id>, "stt": <transcription model id>,
  "tts": <speech model id>, "voice": <voice id>}`. Optional `config` for model-specific settings.
  Ids via `askMindStudioSdk`.
- `turnDetection` — optional; `{"eagerness": "low" | "medium" | "high"}` — how quickly the platform
  decides the user finished speaking. High is snappier; low is more patient (users dictating
  numbers or addresses). Default `medium`.
- `greeting` — optional spoken opener, delivered on session start. Omit and the agent waits for the
  user to speak first. Verbatim on cascaded engines; model-spoken (may paraphrase) on
  speech-to-speech.

Body: persona prose (voice register), then the toolset:

```markdown
## Tools

### Book appointment
method: book-appointment
latency: slow
~~~
Book an appointment once the caller has confirmed a date, time, and service.
Read the details back and get a yes before calling. Say the confirmation
naturally ("You're all set for Tuesday the 4th at 2pm") — never read the
booking id aloud unless asked.
~~~
```

`latency` is one of `fast` / `slow` / `background` (semantics in "The latency classes" above).
Don't hand-author input schemas — the platform derives them from the method contract.

## Compiled Output: `dist/interfaces/voice/`

```
dist/interfaces/voice/
├── interface.json      ← config the platform reads
├── system.md           ← compiled voice-register system prompt
└── tools/
    └── bookAppointment.md   ← rich tool description, one per tool
```

## Config (`interface.json`)

The top-level key must match the interface type (`voice`):

```json
{
  "voice": {
    "name": "Front Desk",
    "description": "Books appointments and answers questions by voice.",
    "model": "gpt-realtime-mini",
    "voice": "marin",
    "turnDetection": { "eagerness": "medium" },
    "greeting": "Hey! I can help you book, reschedule, or answer questions — what do you need?",
    "systemPrompt": "system.md",
    "auth": { "requireUser": true },
    "tools": [
      { "method": "book-appointment", "latency": "slow", "description": "tools/bookAppointment.md" }
    ],
    "webInterfacePath": "/"
  }
}
```

| Field | Description |
|-------|-------------|
| `name`, `description` | Display name + listing metadata |
| `model` | Realtime model id (native speech-to-speech). Mutually exclusive with `llm`/`stt`/`tts` |
| `llm`, `stt`, `tts` | The cascaded alternative: chat model id + streaming transcription id + streaming speech id |
| `voice` | Provider voice id (model-specific; query `askMindStudioSdk`) |
| `turnDetection` | `{ "eagerness": "low" \| "medium" \| "high" }`, optional |
| `greeting` | Optional spoken opener |
| `systemPrompt` | Relative path to the compiled system prompt |
| `auth` | **Required.** Who may start a session: `{ "requireUser": boolean, "requireRole"?: string[] }`. See the Auth section below |
| `tools` | `{ method, latency, description }` — method `id` from the manifest, a latency class, and a relative path to the tool's markdown |
| `webInterfacePath` | Optional. Where the voice layer lives in the web interface, for the editor preview |

Declare it in `mindstudio.json`:

```json
{ "type": "voice", "path": "dist/interfaces/voice/interface.json" }
```

## Platform Behavior

- Input schemas are derived from each method's contract — never hand-written.
- The platform appends a `## Current User` block (name, roles) to the system prompt at runtime;
  never author a placeholder for it.
- Turn detection, barge-in (interruption truncates the agent's context to the audio the user
  actually heard), and background-noise handling are platform-managed; `turnDetection.eagerness` is
  the only knob.
- Sessions have a per-app concurrency limit and a maximum duration, both configurable in the app's
  settings; an idle session is ended gracefully after a prompt. Voice minutes and model usage are
  metered.
- Every session persists as a call record with a transcript, visible in the dashboard and readable
  from the frontend via `voice.listSessions()` / `voice.getSession(id)`.

## Auth

**Every voice config declares an `auth` block.** A voice session spends the owner's money for its
entire duration without necessarily touching a backend method, so the platform gates session
creation itself:

```json
"auth": { "requireUser": true, "requireRole": ["member"] }
```

- `requireUser: true` — only authenticated app users may start a session; `false` — anyone,
  including anonymous visitors. Most apps want `true`; choose `false` deliberately (a public
  front-desk line).
- `requireRole` (optional) — the user must hold **at least one** of the listed manifest role ids
  (OR semantics, same as the backend `auth.requireRole(...)`). Omit or leave empty for no role
  gate. Requires `requireUser: true`. Unknown role ids fail the build.
- Denials reject `startSession()` with code `auth_required` (401) or `role_required` (403).
- Dev preview is exempt — the builder is never locked out while testing.
- Older compiled apps without the block fall back to the manifest's `auth.enabled` (auth-enabled →
  users only; no auth → public). New configs always declare it explicitly.

Once inside, voice sessions run as the **authenticated user** — every tool call carries that
user's roles, so a method gated with `auth.requireRole` behaves exactly as it would from the web
frontend or the agent interface. Anonymous sessions (when allowed) have no user and no roles:
gated methods reject, and the caller's history is scoped to their browser's visitor identity.
That's why role restrictions belong in the tool descriptions — the agent should decline in
character, not relay a rejection.
