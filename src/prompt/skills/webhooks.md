---
name: Webhooks
what: Inbound HTTP endpoints that run a method synchronously, routed by a secret in the URL rather than by an auth header — which is what makes them the right fit for provider callbacks from Stripe, GitHub, Shopify, Slack or Twilio, since those senders can't present a bearer token. Signature verification works natively off the raw request body.
when: The moment an external service needs to call the app — Stripe events, GitHub pushes, Twilio callbacks — load it before designing the receiving path. Also before adding a `webhook` interface or writing a method that receives a provider callback, and before reaching for any confirmation-token, polling, or proxy workaround for inbound HTTP — those aren't needed here.
---

# Webhook Interfaces

Inbound HTTP endpoints that invoke a method directly and synchronously — the caller waits for the method to finish. Use for receiving webhooks from external services (Stripe, GitHub, Shopify, Slack, Twilio). Direct inbound webhooks with signature verification work natively; do **not** build confirmation-token or polling workarounds.

The other native path for inbound HTTP is the API interface, which uses bearer auth and exposes the raw body at `input._request.rawBody` instead of at the top level. Use that one when the caller can send an `Authorization` header and you want a documented REST surface; use this one for provider callbacks. Load the `restApi` skill if that's the direction.

Webhook secrets are configured at the project level by the user through the Remy platform. Your job is the `interface.json` and the handling method.

## Config (`interface.json`)

The top-level key must match the interface type (`webhook`):

```json
{
  "webhook": {
    "endpoints": [
      {
        "method": "handle-payment-webhook",
        "secret": "whsec_pick_a_long_random_token",
        "description": "Stripe events"
      }
    ]
  }
}
```

- `method` — the id of a method in `methods[]` to invoke.
- `secret` — a developer-chosen opaque token that is **both the routing key and the access guard**. It is stable across deploys (compilation is a passthrough — redeploying never rotates it), so a URL you register with Stripe/GitHub stays valid. Generate one long random value per endpoint and keep it constant.
- Declare multiple endpoints if needed; each `secret` maps to one method.

Declare it in `mindstudio.json`:

```json
{ "type": "webhook", "path": "dist/interfaces/webhook/interface.json" }
```

## Endpoint URL

Register this with the external service:

```
https://{app-host}/_/webhook/{secret}
```

`{app-host}` is any host the app is served on: its `custom_subdomain` host (e.g. `myapp.madewithremy.com`), a custom domain if configured, or the UUID host (`<appId>.madewithremy.com` / `.msagent.ai`). All HTTP verbs are accepted.

## Input

The method receives:

```ts
{
  method: string;                  // HTTP method
  headers: Record<string, string>; // request headers
  query: Record<string, string>;   // query params
  body: any;                       // parsed JSON / form body
  rawBody: string;                 // exact raw request bytes (UTF-8), pre-parse
}
```

For signature verification **always use `rawBody`, never `body`** — providers (Stripe, GitHub, Shopify, Slack) HMAC the raw payload, and a re-serialized `body` will not match:

```typescript
const event = stripe.webhooks.constructEvent(
  input.rawBody,
  input.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET!,
);
```

`rawBody` is populated for `application/json` and `application/x-www-form-urlencoded` bodies (what these providers send).

## Response

Whatever the method returns as output is sent back to the caller as JSON; if it returns no output, the platform responds `204`. A wrong/unknown secret returns `401`; an app with no live release returns `404`.

## Auth

Methods invoked through this interface run with `auth.roles: ['system']` — the platform is calling, not a user session, so there's no user to impersonate. Use `auth.requireRole('system')` to gate methods that should only be reachable via a platform trigger. The auth reference in your system prompt covers the system role in full.

Note that the URL secret is the only access control on the endpoint itself, which is why it needs to be long and random. Signature verification is a second, independent check that the payload really came from the provider — do both.
