# Methods

A method is a named async function that runs on the platform. It's the universal unit of backend logic — every interface (web, API, Discord, cron, webhook) invokes methods. One file per method, one named export.

## Writing a Method

```typescript
// dist/methods/src/submitVendorRequest.ts

import { db, auth } from '@mindstudio-ai/agent';
import { Vendors } from './tables/vendors';

export async function submitVendorRequest(input: {
  name: string;
  contactEmail: string;
  taxId: string;
}) {
  auth.requireRole('requester');

  const vendor = await Vendors.push({
    name: input.name,
    contactEmail: input.contactEmail,
    taxId: input.taxId,
    status: 'pending',
    requestedBy: auth.userId,
  });

  return { vendorId: vendor.id, status: vendor.status };
}
```

### Manifest Entry

```json
{
  "id": "submit-vendor-request",
  "name": "Submit Vendor Request",
  "path": "dist/methods/src/submitVendorRequest.ts",
  "export": "submitVendorRequest"
}
```

- `id` — kebab-case, used in API URLs (the platform maps these internally)
- **Important:** the frontend `createClient` uses the camelCase `export` name, not the kebab-case `id`. Call `api.submitVendorRequest()`, not `api['submit-vendor-request']()`.
- `path` — relative to project root
- `export` — must match the function name

### Input and Output

Methods receive a single `input` parameter (an object) and return an object. Both are JSON-serializable. If no input is needed, the parameter can be omitted or typed as `{}`.

```typescript
export async function getDashboard(input: {
  period?: 'week' | 'month' | 'quarter';
}) {
  const period = input.period || 'month';
  // ...
  return {
    pendingApprovals,
    recentOrders,
    stats: { totalSpend, vendorCount },
  };
}
```

## Platform Capabilities

The `@mindstudio-ai/agent` SDK provides access to 200+ AI models and 1,000+ actions (email, SMS, web scraping, file uploads, third-party integrations, and more). Inside a method, use the `mindstudio` singleton — credentials come from the execution environment automatically:

```typescript
import { mindstudio } from '@mindstudio-ai/agent';

// AI text generation
const { content } = await mindstudio.generateText({
  message: 'Summarize this invoice...',
});

// AI image generation
const { imageUrl } = await mindstudio.generateImage({
  prompt: 'A professional headshot placeholder',
});

// Send email
await mindstudio.sendEmail({
  to: 'user@example.com',
  subject: 'Your invoice',
  body: content,
});

// Upload files
const { url } = await mindstudio.uploadFile({
  data: buffer,
  fileName: 'report.pdf',
});

// Web scraping
const { markdown } = await mindstudio.scrapeUrl({
  url: 'https://example.com',
});

// Look up a user from your auth table (auth.userId is null if unauthenticated)
const user = auth.userId ? await Users.get(auth.userId) : null;
```

No separate API keys needed — the platform routes to the correct provider (OpenAI, Anthropic, Google, etc.) automatically.

## Error Handling

Errors need to serve two audiences: the user seeing it in the UI, and the developer (or agent) debugging it in logs.

For validation and business logic errors (bad input, not found, wrong state), throw clear, specific messages:

```typescript
if (!vendor) {
  throw new Error('Vendor not found.');
}

if (vendor.status !== 'pending') {
  throw new Error('This vendor has already been reviewed.');
}
```

For errors from external services or internal failures (API calls, AI generation, file processing), log the real error and throw a user-friendly message that still communicates what went wrong:

```typescript
try {
  const result = await mindstudio.generateVideo({ ... });
  return { videoUrl: result.url };
} catch (err) {
  console.error('Video generation failed:', err);
  throw new Error('There was an error generating your video. Check the logs for details.');
}
```

Never throw cute or vague errors like "Oops!" or "Something went wrong, try again!" — the user needs to know *what* failed, and the logs need the actual error for debugging. `console.error` output is captured in method logs and visible in the browser console during development.

`auth.requireRole()` throws 401 if unauthenticated, 403 if the user doesn't have the required role.

## Common Patterns

### CRUD Method

```typescript
export async function listVendors(input: {
  status?: string;
  search?: string;
}) {
  const vendors = await Vendors
    .filter(v => {
      if (input.status && v.status !== input.status) return false;
      if (input.search && !v.name.includes(input.search)) return false;
      return true;
    })
    .sortBy(v => v.name);

  return { vendors };
}
```

### Role-Gated Operation

```typescript
export async function deleteVendor(input: { vendorId: string }) {
  auth.requireRole('admin');

  const vendor = await Vendors.get(input.vendorId);
  if (!vendor) throw new Error('Vendor not found.');

  const { deleted } = await Vendors.remove(input.vendorId);
  return { deleted };
}
```

### Multi-Table Transaction

```typescript
export async function createPurchaseOrder(input: {
  vendorId: string;
  lineItems: Array<{ description: string; amount: number }>;
}) {
  auth.requireRole('requester');

  const vendor = await Vendors.get(input.vendorId);
  if (!vendor || vendor.status !== 'approved') {
    throw new Error('Vendor must be approved before creating a PO.');
  }

  const total = input.lineItems.reduce((sum, li) => sum + li.amount, 0);

  const po = await PurchaseOrders.push({
    vendorId: input.vendorId,
    requestedBy: auth.userId,
    lineItems: input.lineItems,
    totalAmountCents: total,
    status: 'pending_approval',
  });

  return { purchaseOrderId: po.id, total };
}
```

## Fire-and-Forget Background Tasks

A method can return immediately while kicking off slow work (like `runTask()`) that continues in the background. Don't await the slow call — use `.then()` / `.catch()` to update the record when it completes, and return an early result to the caller. The frontend polls the record's status to track progress.

```typescript
export async function enrichRestaurant(input: { id: string; name: string }) {
  await Restaurants.update(input.id, { status: 'enriching' });

  // Fire — don't await
  mindstudio.runTask<RestaurantData>({
    prompt: '...',
    input: { name: input.name },
    tools: ['searchGoogle', 'fetchUrl', 'generateImage'],
    structuredOutputExample: { /* ... */ },
    model: 'claude-4-6-sonnet',
  }).then(async (result) => {
    if (result.parsedSuccessfully) {
      await Restaurants.update(input.id, { ...result.output, status: 'complete' });
    } else {
      await Restaurants.update(input.id, { status: 'failed' });
    }
  }).catch(async () => {
    await Restaurants.update(input.id, { status: 'failed' });
  });

  return { status: 'enriching' };
}
```

This works because the execution environment persists between requests. The un-awaited promise continues after the method returns. DB, auth, and SDK all work normally in the background chain. For critical workflows, write a "pending" record before firing so incomplete tasks can be detected and retried.

## Shared Helpers

Code shared between methods goes in `dist/methods/src/common/`. Helpers are not listed in the manifest — they're internal, imported by methods but not directly invocable.

```typescript
// dist/methods/src/common/getApprovalState.ts
export function getApprovalState(approvals: Approval[]) {
  const allApproved = approvals.every(a => a.status === 'approved');
  const anyRejected = approvals.some(a => a.status === 'rejected');
  // ...
}
```

## Streaming

Methods can stream token-by-token output (useful for AI-generated content):

```typescript
// Frontend
const result = await api.generateReport(
  { month: 'march' },
  {
    stream: true,
    onToken: (text) => setPreview(text),
  },
);
```

The platform handles the SSE transport. The method returns normally — streaming is managed by the SDK and platform, not by your method code.

## Raw Request Context (API Interface)

Methods invoked via the API interface receive `input._request` alongside the parsed input:

```typescript
input._request: {
  method: string;                      // "GET", "POST", etc.
  headers: Record<string, string>;     // all headers (lowercase keys)
  rawBody: string | undefined;         // original unparsed body (UTF-8)
}
```

`rawBody` preserves the exact bytes the client sent — whitespace, key ordering, encoding. Use it for webhook signature verification:

```typescript
export async function stripeWebhook(input: {
  type: string;
  data: any;
  _request: { headers: Record<string, string>; rawBody: string };
}) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const event = stripe.webhooks.constructEvent(
    input._request.rawBody,
    input._request.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  switch (event.type) {
    case 'payment_intent.succeeded':
      // ...
      break;
  }

  return { received: true };
}
```

For most methods, you don't need `_request` — the parsed path params, query params, and body fields are already on `input` directly.
