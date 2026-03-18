# Scenarios

## What Scenarios Are

Scenarios are seed scripts that put the dev database into a specific state. Instead of manually creating data through the app every time you want to test something, you run a scenario and get a repeatable starting point.

A scenario is just an async function that uses the same `db.push()` calls as methods. If you can write a method, you can write a scenario.

---

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
| `name` | Display name (shown in CLI and dev panel) |
| `description` | What state this scenario creates |
| `path` | Path to the TypeScript file |
| `export` | Named export (the async function) |
| `roles` | Roles to impersonate after seeding |

---

## Writing a Scenario

Scenarios live at `dist/methods/.scenarios/`. They're inside the methods package scope, so `@mindstudio-ai/agent` resolves normally and table imports are relative.

### Full Example

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

### Empty Scenario

```typescript
// dist/methods/.scenarios/emptyRequester.ts

export async function emptyRequester() {
  // No data — the truncate clears everything.
  // This scenario exists so you can switch to "empty app" state
  // without manually deleting records.
}
```

### Composable Helpers

Shared setup code goes in `dist/methods/.scenarios/_helpers/`:

```typescript
// _helpers/createTestVendor.ts
export async function createTestVendor(overrides = {}) {
  return Vendors.push({
    name: 'Test Vendor',
    contactEmail: 'test@example.com',
    status: 'approved',
    ...overrides,
  });
}
```

---

## Execution Flow

Running a scenario is three steps:

### 1. Truncate

```
POST /_internal/v2/apps/{appId}/dev/manage/reset
Body: { "mode": "truncate" }
```

Deletes all rows from all tables, preserves schema and IDs. Gives the seed function a clean canvas.

### 2. Execute the Seed

```
POST /_internal/v2/apps/{appId}/dev/manage/token
→ { "authorizationToken": "InternalCallbackAuthorization@@..." }
```

The CLI gets a fresh callback token scoped to the dev release, then transpiles and executes the scenario file in a child process with `CALLBACK_TOKEN` set. The SDK's `db.push()` calls route through the token to the correct dev database.

### 3. Impersonate

```
POST /_internal/v2/apps/{appId}/dev/manage/impersonate
Body: { "roles": ["ap"] }
```

Sets the role override from the scenario's `roles` field. The app now renders from the AP user's perspective.

---

## CLI Integration

### TUI Mode

Select "Run Scenario" from the actions menu:

```
Select Scenario
  ❯ AP: Overdue Invoices — AP user with two invoices past due
    Empty Requester — Brand new user, no data
    Admin: Busy Org — Admin with lots of pending approvals
    Back
```

After running:
```
✓ Scenario "AP: Overdue Invoices" applied
  Reset database, seeded data, impersonating: ap
  Refresh your browser to see the new state.
```

### Headless Mode

JSON events on stdout:

```json
{"event":"scenario-start","id":"ap-overdue-invoices","name":"AP: Overdue Invoices"}
{"event":"scenario-reset"}
{"event":"scenario-seeded","duration":234}
{"event":"scenario-complete","roles":["ap"]}
```

The C&C server (in the sandbox) triggers scenarios via control messages to the tunnel.

---

## Why Scenarios Matter

- **Living documentation.** Each scenario is an executable description of an app state. "What does the AP dashboard look like with overdue invoices?" Run the scenario and see.
- **Deterministic.** Same scenario always produces the same state. No accumulated test data, no "it worked on my machine."
- **Composable.** Scenarios can import shared helpers for common setup patterns.
- **Demo-ready.** Scenarios double as demo data for stakeholders.
- **Visual regression.** Screenshot each scenario, diff against previous. Catch UI regressions across roles and data states.
