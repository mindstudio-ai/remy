---
name: Agent Chat Experience
what: The holistic experience of an app's chat agent — message design, streaming behavior, thinking and tool activity, the composer, the empty state, and threads, composed as one designed surface. Chat is often the app's most-used interface and the one users judge hardest, because they arrive fluent in it - a first-class design deliverable end to end, never a bolted-on widget. This reference carries the full craft recipe — the modern message shape, streaming and transition rules, tool-activity presentation, composer and empty-state patterns — that separates a product-grade conversation from a generic chatbot.
when: Before designing (or reviewing) an agent chat UI — its layout and placement, message design, streaming behavior, thinking/tool presentation, composer, empty state, or thread navigation.
---

# Agent Chat Experience

An app's chat agent is one designed surface, and you own it end-to-end: the messages, the way
text streams in, the quiet rows that show the agent working, the composer, the first screen, the
thread history. Chat is frequently the most-used interface an app has, and the one users judge
hardest — everyone arrives already fluent in chat, holding expectations set by the best chat
products in the world. That fluency is the design constraint that makes this surface different:
**the win is craft within convention, not novel form.** Where a voice agent's centerpiece rewards
invention, a chat UI rewards a familiar shape executed to a standard users didn't expect from
this app. Meet the expectations, then surpass them.

Placement is itself a design decision, made deliberately: a full-page conversation when chat is a
primary surface; a side panel when the agent works alongside content; inline, next to the thing
the agent acts on, when the conversation is about one artifact. A floating bubble in the corner
is the support-widget pattern — it tells the user this agent is an afterthought.

## The register

- **Modern document-flow conversations (Claude, ChatGPT in their current form)** — the agent's
  turns are a flowing *document*, not a bubble: generous measure, real markdown hierarchy set in
  the brand's type, comfortable line height, no container fighting the text. The user's turns are
  compact right-aligned chips. That asymmetry is the modern shape — the agent writes, the user
  interjects — and it's what makes long, substantive answers readable.
- **iMessage** — the physics: scroll that sticks to the bottom while new content arrives and
  releases the moment the user scrolls up, momentum that feels native, rhythm and breathing room
  between turns. People know in one flick whether a chat scroll is right.
- **Linear** — the finish: exact alignment, restrained color, subtle borders over heavy shadows,
  motion only where it informs. Nothing in the transcript exists for decoration.

And the register's explicit exclusions — each of these reads as a dated messenger or a bolted-on
bot; never ship any of them: symmetrical bubbles on both sides (the 2015 messaging-app look); the
SaaS support-widget (floating launcher, branded header bar, "We typically reply in a few
minutes"); avatar-vs-avatar rows on every message; sparkle-emoji or gradient "AI" badges and
buttons; robotic empty states ("Hello! I'm your AI assistant. How can I help you today?"); raw
JSON, method names, or tool ids in the transcript; unstyled gray-box code blocks.

## Messages are typography

A conversation is 95% type, so the brand's typography does almost all of the work — treat message
design as editorial design. Prescribe it exactly: the measure of the agent's column (comfortable
reading width, not full-bleed), the type scale for body and for markdown headings inside agent
turns, the spacing rhythm between turns versus within a turn, the chip treatment for user
messages (background, radius, max-width, alignment). Timestamps stay quiet — visible on demand or
at conversation breaks, never shouting on every row. No avatars unless they carry real meaning
(a multi-agent app, a human-handoff surface); a two-party conversation doesn't need faces to say
who's talking.

Code blocks, tables, and lists inside agent turns are part of the brand too: styled, syntax-lit,
copy-affordanced — an unstyled gray block in the middle of a designed transcript reads as a bug.

## Streaming craft

Streaming is the heartbeat of the surface, and it must feel poured, not stuttered. Design the
message lifecycle — thinking → streaming → complete — as one set of continuous, layout-shift-free
transitions:

- **Thinking** shows as a compact, in-character indicator the moment the user sends (the
  optimistic send is non-negotiable: the user's message appears instantly, the indicator with
  it). If the model emits visible reasoning, give it a collapsed-but-present treatment the user
  can expand — never a wall of gray text pushed above the answer.
- **Streaming** renders batched (~50–100ms per paint, not per token) so arrival reads as pouring;
  give the streaming edge a treatment — a soft cursor or shimmer — so "still writing" is legible
  at a glance.
- **Completion** is a settle, not a jump: the cursor fades, actions (copy, retry) ease in. No
  element of the transcript moves except by growing downward.
- The transition between these states never reflows what's already on screen — reserve space for
  indicators instead of inserting them.

## Tool activity

When the agent calls the app's methods, the transcript should show it working the way the product
would say it: a compact status row in the app's voice ("Booking your appointment…", "Searching
your library…"), appearing when the call starts and resolving in place when it lands — never raw
method names, spinners without labels, or JSON. Design the row as a real element of the
transcript: aligned to the agent's column, quiet, layout-stable.

Results deserve more than prose when they're structural: the record the agent pulled up, the item
it created, the rows it found can render as real UI inside the turn — a card, a compact list, the
app's own components — so the agent visibly operates the same product the user sees. Decide which
tools earn a rendered result and prescribe what it looks like. When the agent runs several tools
in a row, collapse them into one grouped status that expands on demand; a stack of six status
rows reads as noise.

## The composer

The composer is a designed object, not a bare input: an auto-growing textarea with a clear send
affordance, a visible stop control while the agent is streaming, and an attachment affordance
when the app supports uploads. The placeholder is the agent's personality in six words — never
"Type a message...". On mobile, the composer and the virtual keyboard are the layout: design for
the reduced viewport instead of letting the keyboard crop the transcript.

## The empty state and threads

The first screen is the character's opening move, in the agent's voice and the brand's type: a
greeting that sounds like *this* agent, a few suggested prompts as designed elements (real
questions this app answers, tappable, skippable), or a concise line about what it can do. The
user must always be able to just start typing.

Thread history is real navigation, not an afterthought dropdown: design where past conversations
live (a sidebar on desktop, a sheet or screen on mobile), how titles read, and how a new thread
starts. If the app allows anonymous chat, account for the sign-in moment — the conversation
should visibly survive it.

## Your deliverable: art direction, not suggestions

You art-direct this surface end-to-end. The developer has a terrible sense of design and will
fill any gap you leave with a default — and defaults are how a designed conversation decays into
a generic chatbot. Deliver an implementation-ready specification:

- **Exact values everywhere.** The agent column's measure, type sizes and line heights for body
  and markdown levels, chip radius and max-width, spacing between and within turns, indicator
  dimensions, streaming batch interval, transition durations and easings, all colors as hexes
  from the brand.
- **The message lifecycle, state by state.** Sending / thinking / streaming / complete / error —
  what appears, where space is reserved, what animates — plus the tool-row lifecycle (start,
  running, resolved, grouped), so no transition is left to improvisation.
- **One answer per question.** If you would accept either of two options, pick one and prescribe
  it. "Something like," "roughly," and "consider" are how implementations go generic; the only
  tolerances that exist are the ones you state numerically.
- **A verification checklist.** End with the specific things to screenshot-check after
  implementation — no layout shift while streaming (capture mid-stream), tool rows appearing and
  resolving cleanly, the empty state, code blocks inside a turn, the mobile viewport with the
  keyboard up — so the developer can prove the direction landed rather than assume it did.
