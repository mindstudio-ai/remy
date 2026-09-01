---
name: Realtime Events
what: Server→client push — backend code publishes to named channels and connected clients receive the payloads instantly over a platform-held stream, with no polling and no WebSocket code. This is how a dashboard updates the moment a cron finishes, a notification appears while the user is on another page, a chat message reaches every member of a room, and a second tab stays in sync with the first. Authorization is a grant minted by one of the app's own methods, so who-may-hear-what is ordinary backend code under the normal auth rules.
when: Before building anything that should update without a user action — live dashboards, notifications, chat, job/approval queues, multi-tab or multi-device sync, progress that outlives the method that started the work — or whenever you catch yourself writing a polling loop against your own backend.
---

# Realtime Events

Three verbs. `events.publish(channels, data)` from any backend code (a method, a cron, a webhook handler). `events.grant(channels, opts?)` from a method, **after your own auth checks** — the grant is the entire subscribe-side authorization, so whoever holds it receives those channels. `events.connect(...)` in the frontend, which manages reconnection and grant renewal itself.

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

## The contract

- **Events are nudges, at-most-once.** Nothing is buffered while a client is disconnected; nothing replays on connect. Subscribe for speed, **reconcile for truth**: `onConnect` fires on every (re)connect and is where you refetch current state. A subscriber without that refetch silently misses whatever happened while it was away.
- **Grant TTL is the revocation window** (default 15 min, max 1 h). The stream closes at expiry and the SDK re-mints through your method, re-running your checks — a user whose access you revoke keeps receiving for at most the TTL (or instantly, with per-user fan-out).
- **Environments never cross.** Publishes and grants are scoped live / preview / dev automatically — a tunnel-session publish cannot reach live users.
- **Exact channel strings.** No wildcards or prefixes exist. Names are letters, digits, and `: _ - .`; up to 500 channels per publish, 100 per grant.
- **Payloads are ids, not documents** — 32k serialized cap. Publish `{ type, id }`, let the client fetch.
- `publish` returns `{ delivered }` — live subscriber connections counted per channel. `0` means nobody is listening right now, which is normal for a nudge, never an error.

## Debugging (`remy-admin events`)

- `events tail [--for 60]` — prints publishes live; "is my backend publishing what I think it is". Bounded, exits 0 on its own.
- `events channels list` — channels with recent publishes/subscriptions + live subscriber counts. A channel with subscribers but no publishes (or the reverse) means the two sides spell the channel differently.
- `events publish <channel> '<json>'` — verify a frontend subscriber before the backend trigger exists.

## What this is not

No raw WebSockets and no client→client transport — everything upstream is a method invoke, with all its auth and logging. Sub-100ms bidirectional interaction (shared cursors, 60fps co-editing) is the wrong platform. No message history or replay — an app that needs "what did I miss" reads its own tables on connect, which the reconcile rule already requires.
