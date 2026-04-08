# Secrets & Environment Variables

Apps can store encrypted secrets (API keys, database URLs, tokens) that get injected into method execution as `process.env` variables. Secrets have separate dev and prod values — dev values are used during local development and in the editor sandbox, prod values are used in deployed releases.

---

## When to Use Secrets

Secrets are for third-party services that you manage your own connection to — services that aren't covered by the MindStudio SDK or built-in platform integrations. If MindStudio already provides a way to do something (AI models, sending SMS, web search, image generation, etc.), use the SDK instead. It handles auth, billing, and key management automatically.

Use secrets for:
- **Third-party API keys**: Stripe, GitHub, Shopify, etc.
- **External database connections**: Postgres URLs, Redis connections
- **Webhook signing secrets**: Verifying incoming payloads from services like Stripe or GitHub
- **OAuth tokens**: For services you integrate with directly

---

## Accessing Secrets in Code

Secrets are available on `process.env` inside any method:

```typescript
export async function createPaymentIntent(input: { amount: number }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const intent = await stripe.paymentIntents.create({
    amount: input.amount,
    currency: 'usd',
  });

  return { clientSecret: intent.client_secret };
}
```

```typescript
export async function listRepos(input: { org: string }) {
  const response = await fetch(
    `https://api.github.com/orgs/${input.org}/repos`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
    },
  );

  return { repos: await response.json() };
}
```

Never hardcode credentials in method source:

```typescript
// Good — reads from environment
const apiKey = process.env.STRIPE_SECRET_KEY;

// Bad — hardcoded secret in source code
const apiKey = 'sk_live_abc123...';
```

---

## Key Format

Secret keys must be uppercase alphanumeric with underscores, starting with a letter:

- `STRIPE_SECRET_KEY` — valid
- `DATABASE_URL` — valid
- `GITHUB_TOKEN` — valid
- `stripeKey` — invalid (lowercase)
- `123_KEY` — invalid (starts with number)

---

## Dev vs Prod Values

Each secret has a dev value and a prod value. The same code (`process.env.STRIPE_SECRET_KEY`) automatically resolves to the right value based on execution context.

| Environment | When Used |
|-------------|-----------|
| Dev | Editor sandbox, `mindstudio dev`, preview branches |
| Prod | Deployed releases (main branch) |

Typical pattern — use test/sandbox keys for dev, live keys for prod:
- Dev: `STRIPE_SECRET_KEY` = `sk_test_abc123`
- Prod: `STRIPE_SECRET_KEY` = `sk_live_xyz789`

Both values are optional. If only one is set, the other environment falls back to it.

---

## Management

### Dashboard

Settings → Secrets in the MindStudio app editor. Each secret shows its key, whether dev and prod values are set, and controls to edit or delete.

### CLI

```bash
# List all secrets
mindstudio-prod secrets list

# Get a specific secret (shows dev + prod values)
mindstudio-prod secrets get STRIPE_SECRET_KEY

# Set dev and/or prod values
mindstudio-prod secrets set STRIPE_SECRET_KEY --dev sk_test_abc --prod sk_live_xyz

# Clear just one environment's value
mindstudio-prod secrets set STRIPE_SECRET_KEY --dev-clear

# Delete entirely
mindstudio-prod secrets delete STRIPE_SECRET_KEY
```

---

## Lifecycle

- Secrets are encrypted at rest using AWS KMS — the platform never stores plaintext values in its database
- When a secret is created, updated, or deleted, all active sandboxes for the app restart to pick up the new values immediately
- Secrets persist across deploys — they're tied to the app, not to a specific release
- Deleting a secret removes it from both dev and prod environments

---

## What NOT to Store as Secrets

- **AI model API keys** (OpenAI, Anthropic, Google) — use the MindStudio SDK, which handles model access and billing automatically
- **Keys for platform-provided integrations** (SMS, email, web search, image generation, text-to-speech, transcription) — these are available through the SDK's built-in actions and handle auth automatically
- **MindStudio platform credentials** — handled automatically
- **Non-sensitive values** — use method input parameters or database tables instead
- **Large values** (certificates, key files) — secrets are designed for short string values
