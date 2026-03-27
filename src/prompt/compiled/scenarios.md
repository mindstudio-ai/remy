# Scenarios

Scenarios are seed scripts that set up the dev database into a specific state for testing. Instead of manually creating data through the app, run a scenario and get a repeatable starting point. A scenario is just an async function that uses the same `db.push()` calls as methods — no new API to learn.

## Defining Scenarios

In `mindstudio.json`:

```json
{
  "scenarios": [
    {
      "id": "ap-overdue-invoices",
      "name": "AP: Overdue Invoices",
      "description": "AP user with two invoices past due date.",
      "path": "dist/methods/.scenarios/apOverdueInvoices.ts",
      "export": "apOverdueInvoices",
      "roles": ["ap"]
    },
    {
      "id": "empty-requester",
      "name": "Empty Requester",
      "description": "Brand new user, no data.",
      "path": "dist/methods/.scenarios/emptyRequester.ts",
      "export": "emptyRequester",
      "roles": ["requester"]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Kebab-case identifier |
| `name` | Display name (shown in dev panel) |
| `description` | What state this scenario creates |
| `path` | Path to the TypeScript file |
| `export` | Named export (the async function) |
| `roles` | Roles to impersonate after seeding |

## Writing a Scenario

Scenarios live at `dist/methods/.scenarios/` — inside the methods package scope. `@mindstudio-ai/agent` resolves from `dist/methods/node_modules/` and table imports are relative.

```typescript
// dist/methods/.scenarios/apOverdueInvoices.ts

import { db } from '@mindstudio-ai/agent';
import { Vendors } from '../src/tables/vendors';
import { PurchaseOrders } from '../src/tables/purchase-orders';
import { Invoices } from '../src/tables/invoices';

export async function apOverdueInvoices() {
  const vendor = await Vendors.push({
    name: 'Acme Corp',
    contactEmail: 'billing@acme.com',
    status: 'approved',
  });

  const po = await PurchaseOrders.push({
    vendorId: vendor.id,
    requestedBy: 'user-requester-1',
    totalAmountCents: 500000,
    status: 'active',
  });

  await Invoices.push([
    {
      poId: po.id,
      invoiceNumber: 'INV-001',
      amountCents: 150000,
      dueDate: db.ago(db.days(5)),
      status: 'pending_review',
    },
    {
      poId: po.id,
      invoiceNumber: 'INV-002',
      amountCents: 100000,
      dueDate: db.ago(db.days(2)),
      status: 'approved',
    },
  ]);
}
```

An empty scenario is valid — it exists so you can switch to "clean slate" state:

```typescript
export async function emptyRequester() {
  // No data — the truncate clears everything.
}
```

Shared setup code can go in `dist/methods/.scenarios/_helpers/`.

## How Scenarios Run

When a scenario runs, the platform:
1. **Truncates** all tables (deletes all rows, preserves schema)
2. **Executes** the seed function (your `db.push()` calls populate the clean database)
3. **Impersonates** the roles from the scenario's `roles` field (the app renders from that user's perspective)

This is deterministic — same scenario always produces the same state.

## Scenario Data

Align scenario data to the vibe of the app - construct data that feels like it fits.

### Scenario Images

When scenarios seed data that includes image URLs (profile photos, product images, cover art, etc.), ask the `visualDesignExpert` to generate a small batch of images that fit the app's aesthetic before writing the scenario code. A handful of bespoke photos make scenarios feel dramatically more real than placeholder services. Use the CDN URLs directly in your `db.push()` calls.
