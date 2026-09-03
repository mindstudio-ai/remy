---
name: Realtime Events
what: Realtime over named channels, both directions, with no polling and no WebSocket code. Backend code publishes and connected clients receive instantly over a platform-held stream; clients with a publish-capable grant also send ephemeral signals (cursors, typing, live strokes) directly, with no backend method per signal. This is how a dashboard updates the moment a cron finishes, a notification appears while the user is on another page, a chat message reaches every member of a room, and a shared canvas shows everyone's cursors live. Authorization is a grant minted by one of the app's own methods, so who-may-hear-and-say-what is ordinary backend code under the normal auth rules.
when: Before building anything that should update without a user action — live dashboards, notifications, chat, collaborative UIs (shared cursors, live co-editing signals), job/approval queues, multi-tab or multi-device sync, progress that outlives the method that started the work — or whenever you catch yourself writing a polling loop against your own backend.
---

# Realtime Events

Three verbs. `events.publish(channels, data)` from any backend code (a method, a cron, a webhook handler). `events.grant(channels, opts?)` from a method, **after your own auth checks** — the grant is the entire client-side authorization: whoever holds it receives those channels, and may publish on any channels named in `opts.publish`. `events.connect(...)` in the frontend, which manages reconnection and grant renewal itself and exposes `sub.publish(...)` for ephemeral client signals.

This is different from `stream()`, which narrates one invocation to the caller currently waiting on it. Events reach clients that weren't part of the invocation at all — someone else's action, a cron, a webhook.

## The loop

```ts
// backend — the subscribe door is one of YOUR methods
import { auth, events } from '@mindstudio-ai/agent';

export async function watchInbox() {
  // Your auth checks first — the grant is the whole subscribe-side authorization.
  auth.requireRole('member');
  return await events.grant(`user:${auth.userId}`); // { token, expiresAt, ttlSeconds }
}

// backend — anything can publish (method, cron, webhook)
export async function assignTicket(input: { ticketId: string; assignee: string }) {
  const ticket = await Tickets.update(input.ticketId, { assignee: input.assignee });
  await events.publish(`user:${input.assignee}`, { type: 'ticket', id: ticket.id });
  return ticket;
}
```

```ts
// frontend
import { createClient, events } from '@mindstudio-ai/interface';
const api = createClient();

const sub = events.connect({
  getToken: () => api.watchInbox().then((r) => r.token),
  onEvent: (e) => { if (e.data.type === 'ticket') refreshTicket(e.data.id); },
  onConnect: () => refetchInbox(),   // fires on EVERY (re)connect — see below
});
// sub.close() on unmount
```

## Channel shape — the design decision that matters

**A channel is an audience, and a method decides who is in it.** Never put two users' data on one channel; the channel is the unit of authorization. For anonymous visitors `auth.userId` is null — key their channels on `session.visitorId` instead, or `` `user:${auth.userId}` `` becomes `user:null`, one channel shared by every anonymous user.

**Default: per-user channels, fan out at publish time.** For any membership-gated audience — chat rooms, notifications, assigned work — publish to each member's own channel rather than to an entity's:

```ts
const members = await RoomMembers.where({ roomId });
await events.publish(members.map((m) => `user:${m.userId}`), { type: 'message', roomId, msg });
```

One call handles up to 500 channels. The subscriber's grant is one channel (`user:${id}`) minted once and never re-minted on a membership change, the client routes by payload (`roomId`), and removing someone from the room stops their events **immediately** — the publisher simply stops enumerating them.

**Exception: a shared channel for genuinely broadcast content** — a live blog, a status ticker, a public scoreboard — where everyone receives the same thing and access is broad by design. There, revocation waits for the grant TTL, which is fine.

The anti-pattern is a channel per entity (`room:${roomId}`) with users granted many channels: grants churn on every join/leave, and a removed member keeps receiving until their grant expires.

## Ephemeral client signals (cursors, typing, live strokes)

High-frequency, low-durability signals publish **directly from the client** — no backend method runs per signal. The minting method grants publish capability on specific channels; the frontend fires per input event and the SDK coalesces automatically (~40ms batches):

```ts
// backend — one token, both directions
export async function joinCanvas(input: { roomId: string }) {
  await assertRoomMember(input.roomId);
  const channel = `canvas:${input.roomId}`;
  return await events.grant(channel, { publish: [channel] });
}

// frontend — publish per input event; the SDK batches and rate-boxes for you
const sub = events.connect({ getToken: () => api.joinCanvas({ roomId }).then((r) => r.token), onEvent: renderPeer });
canvas.onpointermove = (e) =>
  sub.publish(`canvas:${roomId}`, { kind: 'cursor', u: myId, x: e.x, y: e.y, seq: seq++ });
```

The rules of this shape:

- **Signals are disposable; truth is durable.** Anything that must survive (the committed stroke, the sent message) goes through a method and the database, announced with an id-only nudge. Client events cap at 8k serialized and are dropped — never queued — on any failure.
- **Carry a client `seq` and interpolate.** Delivery is at-most-once and unordered across batches: receivers drop stale seqs and animate between samples rather than rendering raw positions.
- **A shared channel is right here** — everyone in the room hears everyone, which is the broadcast exception to per-user fan-out; membership changes take effect at grant TTL.

## The contract

- **Events are nudges, at-most-once.** Nothing is buffered while a client is disconnected; nothing replays on connect. Subscribe for speed, **reconcile for truth**: `onConnect` fires on every (re)connect and is where you refetch current state. A subscriber without that refetch silently misses whatever happened while it was away.
- **Grant TTL is the revocation window** (default 15 min, max 1 h). The stream closes at expiry and the SDK re-mints through your method, re-running your checks — a user whose access you revoke keeps receiving for at most the TTL (or instantly, with per-user fan-out).
- **Environments never cross.** Publishes and grants are scoped live / preview / dev automatically — a tunnel-session publish cannot reach live users.
- **Exact channel strings.** No wildcards or prefixes exist. Names are letters, digits, and `: _ - .`; up to 500 channels per publish, 100 per grant.
- **Payload cap: 256k serialized characters**, checked in the SDK before the network call, so oversize throws synchronously. When a publish carries data (a committed record, not just ids), publish before you commit the write it announces — an oversize failure after the commit means the write landed and no other client heard. High-rate paths publish `{ type, id }` and let the client fetch.
- **Every frame carries the publish `id`** — one publish, one id, stamped by the platform. If a grant covers several published channels the same id arrives once per channel, so the dedupe key is `id + channel`.
- `publish` returns `{ delivered, id }` — live subscriber connections counted per channel, plus that publish id (it correlates app logs with `events tail`). `delivered: 0` means nobody is listening right now, which is normal for a nudge, never an error.
- **If a subscriber falls behind, the platform drops frames rather than buffering** and discloses it: the SDK fires `onGap(count)` when the stream catches up. Treat it like a reconnect — refetch, same as `onConnect`.

## Debugging (`remy-admin events`)

- `events tail [--for 60]` — prints publishes live; "is my backend publishing what I think it is". Bounded, exits 0 on its own.
- `events channels list` — channels with recent publishes/subscriptions + live subscriber counts. A channel with subscribers but no publishes (or the reverse) means the two sides spell the channel differently.
- `events publish <channel> '<json>'` — verify a frontend subscriber before the backend trigger exists.

## What this is not

No raw WebSockets — upstream is a method invoke or a grant-authorized client publish, both under the platform's auth. Every client-published channel was named by one of the app's own methods; there is no unauthorized client→client path. Delivery is at-most-once with no cross-batch ordering — dedupe by `id + channel`, order by your own `seq`, reconcile on connect. No message history or replay — an app that needs "what did I miss" reads its own tables on connect, which the reconcile rule already requires. Server-authoritative simulation (real-time action games) is still the wrong shape: there is no guaranteed tick or ordered delivery to build one on.
