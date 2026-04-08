# Secrets & Environment Variables

Apps can store encrypted secrets (API keys, database URLs, tokens) that get injected into method execution as `process.env` variables. Secrets have separate dev and prod values — dev values are used in the editor sandbox, prod values are used in deployed releases.

## When to Use Secrets

Secrets are for third-party services that aren't covered by the MindStudio SDK. If the SDK already provides a capability (AI models, SMS, email, web search, image generation, etc.), use the SDK — it handles auth, billing, and key management automatically.

Use secrets for things like Stripe, webhook signing secrets, or any other external service you connect to directly.

Never expose secrets to frontends or interfaces. You can only consume secrets in backend methods.

## Accessing Secrets

```typescript
export async function createPaymentIntent(input: { amount: number }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // stripe.create....
}
```

Never hardcode credentials in method source — always use `process.env`.

## Key Format

Uppercase snake_case, starting with a letter: `STRIPE_SECRET_KEY`, `DATABASE_URL`, `GITHUB_TOKEN`.

## Dev vs Prod

Each secret has a dev value and a prod value. The same code (`process.env.STRIPE_SECRET_KEY`) automatically resolves to the right value based on execution context. Use test/sandbox keys for dev, live keys for prod - or use the same value for both if the service does not make a distinction.

## Management

Secrets are managed through the app's dashboard or the `mindstudio-prod secrets` CLI.

## What NOT to Store

- AI model API keys (OpenAI, Anthropic, Google) — use the SDK
- Keys for platform-provided integrations (SMS, email, web search, image gen) — use the SDK
- Non-sensitive values — use method input parameters or database tables
