---
name: Scenarios
what: Seed scripts that reset the dev database to a specific state — the platform truncates all tables, runs an async function of plain `db.push()` calls, then impersonates a role, so the same scenario always produces the same state. They're how the user tests the app from each role's perspective and how a freshly built app makes its first impression already populated with data that fits its vibe. Declared in the manifest, written at `dist/methods/.scenarios/`.
when: Before writing or editing a scenario — including the initial build, where scenarios are required. Covers file placement and imports, truncate semantics, what scenarios must not touch (file stores, data sources), and seeding realistic data and bespoke images.
---

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
1. **Truncates** all tables (deletes all rows, preserves schema - unless skipTruncate is true)
2. **Executes** the seed function (your `db.push()` calls populate the clean database)
3. **Impersonates** the roles from the scenario's `roles` field (the app renders from that user's perspective)

This is deterministic — same scenario always produces the same state.

Scenarios are useful for seeding initial app state after build for testing, as well as to give the user a first impression of an app that is already filled with data and looks and feels usable. The user can choose to run further scenarios after initial build by clicking the Scenarios tab and selecting a scenario to run.

## What scenarios don't touch

**Scenarios seed database tables and nothing else.** They do not touch file stores or data sources — deliberately: both are durable and shared across dev and prod, with no per-release copy to reset, so there is nothing to truncate.

Don't try to seed documents into a data source from a scenario, and don't write `clear()`-style reset helpers for one. Load a test corpus once from the CLI instead:

```bash
mindstudio-prod datasources add --source policies --wait fixtures/*.pdf
```

Re-running it is free (documents are content-addressed), so it's safe to keep in a setup script beside your scenarios.

## Scenario Data

Align scenario data to the vibe of the app - construct data that feels like it fits.

### Scenario Images

When scenarios seed data that includes image URLs (profile photos, product images, cover art, etc.), ask the `visualDesignExpert` to generate a small batch of images that fit the app's aesthetic before writing the scenario code. A handful of bespoke photos make scenarios feel dramatically more real than placeholder services. Use the CDN URLs directly in your `db.push()` calls.
