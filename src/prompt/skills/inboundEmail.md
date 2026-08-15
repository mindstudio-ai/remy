---
name: Inbound Email
what: The app has its own email address, and mail sent to it runs a method. Every address on the app's subdomain routes to one handler, so `support@`, `receipts@` and `anything@` all arrive without registering anything — branch on the recipient in code. Attachments arrive as CDN URLs the platform has already uploaded, threading headers come through intact so replies land in the same conversation, and a verified custom domain both receives and sends under the app's own brand. "Forward a receipt and the app files it" is a real feature that costs one method.
when: Before writing an email-handler method, adding an `email` interface, or promising anything about what happens when a user emails the app.
---

# Inbound Email Interfaces

Inbound email triggers. Each app has **one** email-handler method; the platform routes all inbound
mail destined for the app — across any of its address tiers — to that method.

The addresses themselves are configured at the project level by the user through the Remy platform.
Your job is the `interface.json` and the method that handles the mail, not domain registration or MX
records.

## Address tiers

Three tiers, all delivered to the same handler method. The new tiers are catchall (no localpart
registration); the legacy tier is specific-localpart and frozen for new apps.

| Tier | Address | How it's set up |
|---|---|---|
| Platform subdomain (default) | `*@<custom_subdomain>.madewithremy.com` | Automatic the moment the app has a `custom_subdomain` set. Every address on that subdomain delivers to the handler. |
| Custom domain | `*@<their-domain>` | The user adds a domain in the dashboard's email-domains settings and points one MX record at `mx.msagent.ai`. Not something the agent provisions. |
| Legacy `mindstudio-hooks.com` | `<name>@mindstudio-hooks.com` | Existing apps only — frozen for new apps. Don't recommend it; treat as read-only history. |

Because the new tiers are catchall, `to` carries an arbitrary localpart. Methods that need to branch on
it should read `input.to` (e.g. `if (input.to.startsWith('support@')) ...`). This is what makes
per-purpose addresses free: you don't register `support@` anywhere, you just check for it.

A verified custom domain (and the app's `madewithremy.com` subdomain) also **sends** outbound mail, not
just receives — `sendEmail` picks the app's own-brand sender automatically, configured in the
dashboard's **Email** settings.

## Config (`interface.json`)

The top-level key must match the interface type (`email`):

```json
{
  "email": {
    "method": "handle-inbound-email",
    "approvedSenders": ["billing@vendor.com", "*@trusted-partner.com"]
  }
}
```

`approvedSenders` is optional. When set, only senders matching an exact address or `*@domain.com`
wildcard reach the method; everything else is rejected by the platform with `400 invalid_sender` before
the method runs (silently — the sender isn't bounced). Matching is case-insensitive. The same list
applies uniformly across all three address tiers.

Declare it in `mindstudio.json`:

```json
{ "type": "email", "path": "dist/interfaces/email/interface.json" }
```

## Input shape

```ts
{
  to: string;               // full recipient address; localpart is arbitrary on catchall tiers
  from: string;             // bare sender address, extracted from "Name <a@b>" form
  fromName: string | null;  // sender display name, or null
  subject: string;          // 'No Subject' if missing
  message: string;          // plain-text body, falls back to HTML if text is missing; 'No Body' if neither was sent
  html: string;             // HTML body, or '' when text-only
  attachments: string[];    // CDN URLs — already uploaded by the platform
  messageId: string | null; // this email's Message-ID, angle-bracketed (<id@host>)
  inReplyTo: string | null; // Message-ID this email is replying to, if any
  references: string[];     // prior Message-IDs in the thread (angle-bracketed); [] if none
  replyTo: string | null;   // Reply-To address — reply here, not `from`, when set
  cc: string[];             // Cc recipient addresses
  date: string | null;      // original send time, ISO-8601
}
```

## Replying in thread

Replies go out through the SDK's `sendEmail` action (its full parameter list is in the SDK actions
reference in your system prompt). Set `inReplyTo` to the incoming `messageId` and `references` to
`[...references, messageId]`. Send to `replyTo` when it's set, otherwise `from`.

```typescript
await mindstudio.sendEmail({
  to: input.replyTo ?? input.from,
  subject: `Re: ${input.subject}`,
  body: reply,
  inReplyTo: input.messageId ?? undefined,
  references: input.messageId
    ? [...input.references, input.messageId]
    : input.references,
  cc: input.cc, // reply-all
});
```

`sendEmail` returns `{ recipients, cc, bcc, from }` — who it sent to and the sender used. It does
**not** return the sent message's own `Message-ID`, so thread off *inbound* mail, never off messages
you sent.

## Attachments and size limits

`attachments[]` is an array of CDN URLs — the platform has already received and uploaded the files.
Fetch them server-side via the URL when you need the bytes; pass them through as URLs to UI or
downstream services.

Max inbound message size is 25 MB total (including all attachments). Oversized messages are rejected by
the platform before the method runs.

## Auth

Methods invoked through this interface run with `auth.roles: ['system']` — the platform is calling, not
a user session, so there's no user to impersonate. Use `auth.requireRole('system')` to gate methods that
should only be reachable via email. The auth reference in your system prompt covers the system role in
full.
