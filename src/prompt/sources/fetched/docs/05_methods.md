# Methods

## What is a Method?

A method is a named async function that runs on the platform. It's the
universal unit of backend logic — every interface (web, API, Discord,
cron, webhook) is just a different way to invoke a method.

Methods run in isolated sandboxes. You don't manage servers, configure
runtimes, or worry about cold starts. Write the function, declare it
in the manifest, push to git.

---

## Writing a Method

One file per method, one named export:

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

### The Manifest Entry

```json
{
  "id": "submit-vendor-request",
  "name": "Submit Vendor Request",
  "path": "dist/methods/src/submitVendorRequest.ts",
  "export": "submitVendorRequest"
}
```

- `id` — kebab-case identifier, used in API URLs and frontend method map
- `path` — relative to project root
- `export` — the named export (must match the function name)

### Input and Output

Methods receive a single `input` parameter (an object) and return an
object. Both are JSON-serializable.

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

If no input is needed, the parameter can be omitted or typed as `{}`.

---

## Using the SDK

### Database Operations

```typescript
import { db } from '@mindstudio-ai/agent';
import { Vendors } from './tables/vendors';
import { PurchaseOrders } from './tables/purchase-orders';

// Create
const vendor = await Vendors.push({ name: 'Acme', status: 'pending' });

// Read
const approved = await Vendors.filter(v => v.status === 'approved');

// Update
await Vendors.update(vendor.id, { status: 'approved' });

// Delete
await Vendors.remove(vendor.id);

// Cross-table queries
const [vendor, orders] = await db.batch(
  Vendors.get(vendorId),
  PurchaseOrders.filter(po => po.vendorId === vendorId),
);
```

See [Tables & Database](04_tables-and-database.md) for the full API.

### Auth

```typescript
import { auth } from '@mindstudio-ai/agent';

// Current user
const userId = auth.userId;

// Check roles
if (auth.hasRole('admin')) { /* ... */ }

// Require a role (throws 403 if not)
auth.requireRole('admin');

// Require any of several roles
auth.requireRole('admin', 'approver');
```

See [Roles & Auth](06_roles-and-auth.md).

### Platform Capabilities

The `@mindstudio-ai/agent` SDK provides access to 200+ AI models and
1,000+ actions (email, SMS, web scraping, file uploads, third-party
integrations, and more). Inside a method, create an instance and call
actions directly. No constructor arguments needed — credentials are
picked up automatically from the execution environment:

```typescript
import { MindStudioAgent } from '@mindstudio-ai/agent';

const agent = new MindStudioAgent();

// AI text generation
const { content } = await agent.generateText({
  message: 'Summarize this invoice...',
});

// AI image generation
const { imageUrl } = await agent.generateImage({
  prompt: 'A professional headshot placeholder',
});

// Send email
await agent.sendEmail({
  to: 'user@example.com',
  subject: 'Your invoice',
  body: content,
});

// Upload files
const { url } = await agent.uploadFile({
  data: buffer,
  fileName: 'report.pdf',
});

// Web scraping
const { markdown } = await agent.scrapeUrl({
  url: 'https://example.com',
});

// Resolve user display info
const { displayName, email } = await agent.resolveUser({
  userId,
});
```

No separate API keys needed — the platform routes to the correct
provider (OpenAI, Anthropic, Google, etc.) automatically. See the
`@mindstudio-ai/agent` SDK reference for the full list of available
actions.

---

## Error Handling

Throw errors with messages that make sense to end users — these may
surface in the UI:

```typescript
export async function approveVendor(input: { vendorId: string }) {
  auth.requireRole('admin', 'grc');

  const vendor = await Vendors.get(input.vendorId);
  if (!vendor) {
    throw new Error('Vendor not found.');
  }

  if (vendor.status !== 'pending') {
    throw new Error('This vendor has already been reviewed.');
  }

  // ...
}
```

`auth.requireRole()` throws a 403 automatically if the user doesn't
have the required role.

---

## Execution Lifecycle

### Production (live)

1. Interface invokes method (web SPA, API key, Discord command, etc.)
2. Platform resolves the live release
3. Loads compiled JavaScript from S3 (cached)
4. Dispatches to an isolated sandbox container
5. Sandbox runs the method with `globalThis.ai` pre-configured
6. Method's `db` and `auth` calls route back to the platform
7. Result returned to the calling interface

### Development (local CLI or sandbox)

1. Interface invokes method (through the tunnel proxy)
2. Platform queues the request
3. Tunnel (local or in sandbox) polls, receives the request
4. Transpiles the TypeScript source with esbuild
5. Executes in an isolated child process
6. `db` and `auth` calls route to the platform via `CALLBACK_TOKEN`
7. Result posted back, returned to the interface

The key difference is *where* the code runs — sandbox container in
production, local process in development. The database, auth, and SDK
are the same.

---

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

  await Vendors.remove(input.vendorId);
  return { success: true };
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

---

## Shared Helpers

Code shared between methods goes in `dist/methods/src/common/`:

```typescript
// dist/methods/src/common/getApprovalState.ts
export function getApprovalState(approvals: Approval[]) {
  const allApproved = approvals.every(a => a.status === 'approved');
  const anyRejected = approvals.some(a => a.status === 'rejected');
  // ...
}
```

Helpers are not listed in the manifest — they're internal to the
backend, imported by methods but not directly invocable.

---

## Streaming

Methods can stream token-by-token output (useful for AI-generated
content):

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

The platform handles the SSE transport. The method returns normally —
streaming is managed by the SDK and platform, not by your method code.
