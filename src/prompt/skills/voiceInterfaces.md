---
name: Voice Interfaces
what: Realtime voice conversation as a first-class interface — the user talks to the app and its voice agent talks back in sub-second, interruptible speech, calling the app's methods mid-conversation as the authenticated user. The platform handles the media transport, turn-taking, barge-in, and transcripts, so the work is authorship — a persona written for the ear, a small toolset where every tool carries a latency class, and descriptions that say results out loud. Any app whose methods do something interesting can pick up a voice, and it is often the most impressive surface it has.
when: Before authoring `src/interfaces/voice.md`, choosing a voice model or pipeline, deciding which methods a voice agent gets, building the voice UI with `createVoiceClient()`, or working out why a voice agent behaved the way it did on a call.
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
  voice failure. Collect one value per turn; two asked together blend when spoken.
- **Brevity is a hard rule, not a style preference.** One to two sentences per turn, one question at
  a time. A paragraph that reads fine in chat is a monologue on a call.
- **Vary the phrasing.** Repeated openers and acknowledgments sound convincing once and robotic by
  the third turn — give the prompt an explicit variety rule, and treat any sample phrases as
  anchors, never scripts.
- **Handle unclear audio explicitly.** Give the prompt a rule for it: respond only to clear audio;
  if it's noisy or ambiguous, ask the user to repeat — never guess, never call a tool on input the
  agent isn't sure it heard, and don't reuse the same clarification line twice in a row.
- **Pin the language.** State the response language in the prompt; don't let the model infer it from
  an accent. If the app's domain has brand names or terms with non-obvious pronunciations, give
  them a line ("pronounce SQL as 'sequel'").

Beyond the mechanics, the persona itself should be *of the ear*: pacing, warmth, how it handles
being interrupted, what it says when it needs a second. This is the fun part, same as the agent
interface — a distinct character beats a generic assistant, and voice makes character land harder
than any other surface.

### The shape of `system.md`

Structure the compiled prompt as short **labeled sections** — Role & Objective, Personality & Tone,
Rules, and (when the app has a real call flow) Conversation Flow — with bullets over paragraphs;
realtime models find and follow sectioned rules far more reliably than prose. Scope rules
precisely; blanket `always`/`never` makes the agent rigid and unable to handle reasonable exceptions. 
And start minimal: state the role, the boundaries, and the voice mechanics above, then add rules only for
behaviors that actually misfire in test calls (the transcripts in the call log are the feedback
loop — `mindstudio-prod voice sessions get` reads a call verbatim) rather than front-loading a
policy manual.

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

### Tool results reach the screen

Every successful tool call delivers its raw return value to the session's browser on the SDK's
`toolCall` event (`result` field, on `done`) — so the UI can render what the agent just did (the
citation it found, the record it pulled up, the booking it made) in lockstep with the spoken
answer. No flag, no polling, no key-threading, no model involvement: delivery to the invoking
session's own client is the same security context as the invocation itself (an RPC response), and
it's scoped to that one session.

Consequence for authoring: **a tool's return value is user-visible by definition.** Return what
the user may see — no internal fields, keys, or diagnostics you wouldn't put on screen (the same
discipline as agent-interface tools, whose results render in chat). Payloads over ~32KB serialized
arrive as `resultTruncated: true` with no data — keep returns compact, or have the UI fetch big
data itself. Failed calls deliver nothing to the client (the model gets the `{ error }` and speaks
a decline).

For backend-side correlation (writing results to a table keyed by the call, custom channels), the
method itself can read `session.voiceSessionId` / `session.visitorId` from the agent SDK
(`import { session } from '@mindstudio-ai/agent'`) — the same id the browser holds as
`session.sessionId`, guaranteed by the platform rather than echoed by the model.

### Client tools: actions that happen on screen (`target: "client"`)

A tool whose effect belongs in the browser — open the verification sheet, navigate to a page,
highlight a record — is declared with `target: "client"` instead of a `method`:

```json
{
  "target": "client",
  "name": "showVerification",
  "description": "tools/showVerification.md",
  "inputSchema": { "type": "object", "properties": { "reason": { "type": "string" } } }
}
```

The platform never touches the backend for these: the agent's invocation is delivered to the
session's browser, the app's registered handler runs, and the handler's **return value goes back
to the agent as the tool result** — a real request/response, so the agent knows the sheet
actually opened (or that the user dismissed it) and speaks accordingly. Rules:

- `name` instead of `method`; must not collide with any backend method id. No latency class —
  the agent holds the turn while the browser responds (up to ~30s, then a timeout error).
- `inputSchema` is authored inline (an object schema) — there's no method contract to derive
  it from. Keep it small; these are UI directives, not data payloads.
- The frontend must register a handler, or invocations fail as `unhandled_client_tool`:

```js
session.registerClientTool('showVerification', async ({ reason }) => {
  openVerifySheet(reason);
  return { opened: true };   // what the agent hears back
});
```

- One client tool runs at a time per session; the description should tell the agent when to use
  it and what to say while it's on screen. Throwing from the handler (or returning nothing)
  becomes an error/ack the agent can speak around.
- The progressive-auth pattern above is the canonical use: make the verification sheet a client
  tool and the agent opens it deliberately instead of the frontend inferring it from tool events.

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

And give failure a script: never speak a raw error. When a lookup misses or a tool fails, read back
the value it used ("I couldn't find an order ending three-one-two-five — did I get part of that
wrong?"), offer one retry, then move to an alternate path — in character, without blaming the
caller.

### Choosing the model

Two shapes, one `model` field. **Use native speech-to-speech unless the user specifically asks
for a cascaded pipeline** — one realtime model hears and speaks: lowest latency, most natural
prosody, hears tone and hesitation.

**Native** (`{"model": ..., "voice": ...}`) — **default to `gpt-realtime-2.1` with voice
`marin`.**

- `gpt-realtime-2.1` — the default. Voices: `marin` (default), `cedar`, `alloy`, `ash`,
  `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`.
- `gpt-realtime-2.1-mini` — the same family, lighter; same voices.
- `gemini-2.5-flash-native-audio-preview-12-2025` — the Gemini pick, with a large expressive
  roster: `Puck` (default, upbeat), `Zephyr` (bright), `Charon` (informative), `Kore` (firm),
  `Fenrir` (excitable), `Leda` (youthful), `Orus` (firm), `Aoede` (breezy), `Callirrhoe`
  (easy-going), `Autonoe` (bright), `Enceladus` (breathy), `Iapetus` (clear), `Umbriel`
  (easy-going), `Algieba` (smooth), `Despina` (smooth), `Erinome` (clear), `Algenib` (gravelly),
  `Rasalgethi` (informative), `Laomedeia` (upbeat), `Achernar` (soft), `Alnilam` (firm),
  `Schedar` (even), `Gacrux` (mature), `Pulcherrima` (forward), `Achird` (friendly),
  `Zubenelgenubi` (casual), `Vindemiatrix` (gentle), `Sadachbia` (lively), `Sadaltager`
  (knowledgeable), `Sulafat` (warm).
- `gemini-3.1-flash-live-preview` — newer Gemini, same voices as 2.5, but currently can't speak
  an opening greeting or take mid-call prompt updates (a plugin limitation expected to resolve
  upstream) — prefer 2.5 until then.
- `grok-voice-think-fast-2.0` — a distinct personality register. Voices: `eve` (default),
  `altair`, `ara`, `atlas`, `aurora`, `carina`, `castor`, `celeste`, `cosmo`, `helios`, `helix`,
  `iris`, `kepler`, `leo`, `liora`, `lumen`, `luna`, `lux`, `naksh`, `orion`, `perseus`, `rex`,
  `rigel`, `sal`, `sirius`, `ursa`, `zagan`, `zenith`.

**Cascaded** (`{"llm": ..., "stt": ..., "tts": ..., "voice": ...}`) — streaming transcription
into any chat model in the catalog, streaming speech out. Slightly higher latency; reach for it
only when the user wants it or the app's reasoning demands a specific chat model (e.g. the agent
interface already uses one and the voice should think identically). Slots: `stt` is
`deepgram-nova-3`; `tts` is `cartesia-sonic-3` (voices are per-account Cartesia UUIDs — see
play.cartesia.ai) or `elevenlabs-tts` (the account's ElevenLabs voice library); `llm` is any chat
model — ask `askMindStudioSdk` for chat model ids. One nuance: cascaded engines speak the
`greeting` verbatim (they have a real TTS); speech-to-speech engines have the model say it, so it
may paraphrase slightly.

The model and voice ids above are current and maintained with the platform — use them as written
(they are MindStudio ids, not vendor ids). The user's UI has a picker for changing the model
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
- Writing your own current-user placeholder — the platform appends a `## Current User` block
  (email, phone, roles) to every system prompt at runtime.

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

// status: 'running' | 'done' | 'failed'. Every 'done' carries the tool's raw
// return value in `result` (or `resultTruncated: true` if >~32KB serialized).
session.on('toolCall', ({ method, status, result }) => { });
session.on('error', (err) => { });

session.mute(); session.unmute(); session.isMuted;
session.sendText('123 Main Street');  // inject text into the live conversation
await session.refreshIdentity();      // after in-app verification — upgrade the
                                      // live session anonymous → signed-in in place
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

## Outbound calls (`voice.call`)

The agent can call the user. Backend methods (and crons) place outbound phone calls with the
agent SDK's `voice` namespace — the platform dials the number and connects the callee to this
app's voice agent (same persona, engine, and tools as the web sessions):

```ts
import { voice, auth } from '@mindstudio-ai/agent';

export async function callMeAboutMyOrder(input: { phone: string }) {
  auth.requireRole('member');
  const call = await voice.call({ to: input.phone, assumeIdentity: true });
  return { calling: call.to, from: call.from };
}
```

- **The method is the authorization gate.** The voice interface's `auth` block does not apply to
  calls the backend places deliberately — gate the *method* with `auth.requireRole(...)` exactly
  as you would any sensitive action.
- **`assumeIdentity: true`** runs the call as the user who invoked the method: the agent knows
  who it's talking to (Current User block) and every tool call carries their roles — regardless
  of which number was dialed (the user types any number into a field; identity comes from their
  session, not the phone). Omitted/false → anonymous call; role-gated tools decline.
  System/cron invocations have no human identity and always run anonymously.
- **Production needs a dedicated phone number.** The app owner attaches one ($1/month) via the
  dashboard or `mindstudio-prod voice numbers` (see "The voice CLI"
  below) — it becomes the caller ID for every call, in dev sessions too, so users always see
  the same number. Without one, deployed calls throw `phone_out_requires_dedicated_number`, and
  dev sessions fall back to a shared platform test number that varies per call (tighter limits
  apply on the shared pool).
- **Outcome is on the call record**, not the return value: `voice.call` returns as soon as
  dialing starts (`{ sessionId, status: 'dialing', from, to }`); answered/busy/no-answer land on
  the session in the app's call log (`voice.listSessions()` / the dashboard).
- **Limits**: the app's concurrent-session policy, a daily outbound-call cap, a per-call
  duration ceiling, and one active call per callee number (`voice_callee_busy`).
- **Compliance**: automated calls require prior consent. Call your own users who opted in to
  calls from this app, honor reasonable calling hours, never dial purchased or cold lists —
  design the consent moment into the product (a "call me" button IS consent; a scraped list is
  not).

## Inbound calls

Once the app has a dedicated phone number, people can call it — the same voice agent answers
(same persona, engine, and tools). Nothing extra to author for the basic case; the number in the
app's settings is the whole switch.

How answering works:

- **Inbound always runs the live release.** There is no dev inbound — test the agent over the
  normal WebRTC session in the editor; the phone is the same interface with a different
  transport. An app with no live voice interface (or at its concurrency limit) doesn't answer.
- **Callers are anonymous until verified.** The `auth` block still applies, but a phone call
  can't show a login page — so the platform answers first, and `requireUser` becomes an
  in-call verification flow. The agent can serve whatever anonymous callers are allowed, and
  offers verification when the caller wants something account-bound.
- **Verification uses the app's own auth methods** (`sms-code` / `email-code` from the
  manifest), existing accounts only — there is no sign-up over the phone:
  - SMS: a code is texted to the number the caller is calling from, if an account has that
    number on file. No other number is possible by design.
  - Email: the caller says their address; the platform matches it against the app's users
    (transcription-tolerant — no letter-by-letter spelling ceremony) and emails the account's
    stored address a code.
  - The flow never confirms or denies that an account exists — a code is "sent if an account
    matches", always phrased that neutrally. The persona should offer verification naturally
    when it unlocks something, never as a robotic gate.
- **Verified mid-call, upgraded mid-call**: once the code checks out, the session becomes that
  user's — Current User block, roles on every tool call — without redialing.

### `phone.trustCallerId`

For apps whose users are known by phone number, the interface config may opt into treating
caller ID as identity:

```json
"phone": { "trustCallerId": true }
```

A caller whose number exactly matches an app user's phone starts the call already verified —
no code. This is a real security tradeoff: **caller ID can be spoofed**, so a motivated
attacker who knows a user's phone number can impersonate them to this agent. Before enabling
it, you MUST surface that risk to the user and get their explicit confirmation — it's the
right call for convenience-first, low-stakes apps (a family assistant, a status line), and the
wrong one wherever the agent's tools can move money, reveal sensitive records, or take
destructive actions. It lives in the interface config deliberately: enabling it is a code
change, visible in review and auditable via deploys, not a dashboard toggle.

## The voice CLI

The `mindstudio-prod voice` family covers numbers, the call log, and voice policy:

```bash
mindstudio-prod voice numbers search --area-code 310   # available numbers to offer the user
mindstudio-prod voice numbers buy +13105551234         # buy + attach ($1/month — see below)
mindstudio-prod voice numbers release +13105551234     # permanent; no refund, ~15-day quarantine
mindstudio-prod voice sessions list --limit 10         # call log: web / phone-out / phone-in
mindstudio-prod voice sessions get <sessionId>         # full transcript + cost breakdown
```

Also `voice numbers list`, `voice numbers set-name` (outbound caller-ID display
name; 12-72h carrier propagation), `voice settings get`/`set` (concurrency, per-visitor,
max duration — `set` merges: only the settings you pass change). `--help` for flags.

**Never buy a number without the user's explicit confirmation** — it starts a recurring
$1/month workspace charge. Search first, present the options with the price, and only run
`numbers buy` after they've picked one and said yes.

Transcripts are how you iterate on a voice persona: after the user test-calls the agent, read
`voice sessions get` for what was actually said — misheard input, interruptions, tools declining
— and fix the spec from evidence rather than guesses. (Dev-session test calls carry a
`devSessionId` in the list, so you can tell them from live traffic.)

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
model: {"model": "gpt-realtime-2.1", "voice": "marin"}
turnDetection: {"eagerness": "medium"}
greeting: Hey! I can help you book, reschedule, or answer questions — what do you need?
---
```

Frontmatter fields:

- `name` — display name
- `description` — one-liner for listings
- `model` — JSON string, two shapes: native speech-to-speech `{"model": <realtime model id>,
  "voice": <voice id>}`, or cascaded `{"llm": <chat model id>, "stt": <transcription model id>,
  "tts": <speech model id>, "voice": <voice id>}`. Ids via `askMindStudioSdk`.
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
    "model": "gpt-realtime-2.1",
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
| `phone` | Optional telephony options: `{ "trustCallerId"?: boolean }` — see "Inbound calls" above. Only add it after the user has confirmed the spoofing tradeoff |
| `context` | Optional session context: `{ "method": <method id> }` — auto-fired in the background at session start; see "Session context" below |
| `tools` | `{ method, latency, description }` — method `id` from the manifest, a latency class, and a relative path to the tool's markdown |
| `webInterfacePath` | Optional. Where the voice layer lives in the web interface, for the editor preview |

Declare it in `mindstudio.json`:

```json
{ "type": "voice", "path": "dist/interfaces/voice/interface.json" }
```

## Session context (auto-loaded)

When the config declares `"context": { "method": "session-context" }`, the platform fires that
backend method automatically when a session starts — in the background, so the greeting is
never delayed — and appends its return to the system prompt as a `## Session Context` block.
Use it for situational state that should color every turn: the caller's open orders, account
standing, where they left off. Timing: the method runs while the greeting audio plays, so the
agent has the context by roughly the first exchange and is guaranteed to have it shortly
after — it is NOT guaranteed for the literal first utterance. On inbound phone calls it
re-fires after the caller verifies mid-call, so the context recomputes for the now-known user.

The method contract:
- Runs as the session's user (same identity/RBAC as a tool call); anonymous sessions run it
  anonymously — return generic or empty content for them.
- Return a short markdown **string** (a few lines). Results are capped at 4,000 characters;
  keep it situational context, not documents — deep or on-demand data belongs in tools or
  data sources.
- It is never a model-visible tool, and failures degrade silently to the generic prompt —
  never make correctness depend on it.

Rule of thumb: `context` for always-relevant state the agent should just know; tools for
anything looked up on demand. Identity itself (name, roles) is already injected via the
Current User block — don't re-fetch it in the context method.

## Platform Behavior

- Input schemas are derived from each method's contract — never hand-written.
- The platform appends a `## Current User` block (email, phone, roles) to the system prompt at
  runtime; never author a placeholder for it.
- Turn detection, barge-in (interruption truncates the agent's context to the audio the user
  actually heard), and background-noise handling are platform-managed; `turnDetection.eagerness` is
  the only knob (not yet wired on Gemini realtime engines — it's a no-op there).
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
- On the phone channel there is no login page to bounce to, so `requireUser` becomes
  answer-then-verify — see "Inbound calls" above.
- Dev preview is exempt — the builder is never locked out while testing.
- Older compiled apps without the block fall back to the manifest's `auth.enabled` (auth-enabled →
  users only; no auth → public). New configs always declare it explicitly.

Once inside, voice sessions run as the **authenticated user** — every tool call carries that
user's roles, so a method gated with `auth.requireRole` behaves exactly as it would from the web
frontend or the agent interface. Anonymous sessions (when allowed) have no user and no roles:
gated methods reject, and the caller's history is scoped to their browser's visitor identity.
That's why role restrictions belong in the tool descriptions — the agent should decline in
character, not relay a rejection.

### Progressive auth: verify mid-call without dropping the conversation

The best pattern for apps that allow anonymous sessions (`requireUser: false`): let visitors
explore by voice, and verify only when they hit an account-bound action — without killing the
live call. Four pieces, all platform rails:

1. **Account-gated tools return a standard not-verified shape** instead of doing the work:
   `{ verified: false, message: 'The caller is not verified. Offer to verify them before sharing
   account details.' }`. The agent speaks the offer in character (reinforce tone in the system
   prompt's verification section). Check with the agent SDK's `auth.userId` inside the method.
2. **The frontend opens its verification sheet off the same signal.** It already receives every
   tool's `toolCall` event (and the tool's return in `result`) — when an account tool fires (or
   returns `verified: false`) while the app has no signed-in user, open the sheet.
3. **The sheet runs the platform's auth rails** — `auth.sendSmsCode()` / `auth.verifySmsCode()`
   (or the email pair) from `@mindstudio-ai/interface`. On success the app's session becomes the
   verified user.
4. **Hand the verified session back to the live call**: `await session.refreshIdentity()`. The
   platform upgrades the running voice session in place — subsequent tool calls carry the user's
   identity and roles, and the agent's Current User context refreshes — no teardown, no lost
   conversation. (Phone calls don't need this: they verify through the agent's built-in flow.)

`refreshIdentity()` is upgrade-only (anonymous → signed-in; an already-identified session rejects
with `already_identified`) and requires the session to have been started by this same browser. If
it fails, ending and restarting the session is the graceful fallback. The chat sibling for agent
interfaces is `claimThread(threadId)` — anonymous threads become unreachable after login until
claimed.
