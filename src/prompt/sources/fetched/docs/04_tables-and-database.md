# Tables & Database

## Defining a Table

Tables are TypeScript files that define the data model. Each table is
a `defineTable<T>()` call with a typed interface:

```typescript
import { db } from '@mindstudio-ai/agent';

interface Vendor {
  name: string;
  contactEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  taxId: string;
  paymentTerms?: string;
}

export const Vendors = db.defineTable<Vendor>('vendors');
```

One file per table, one export per file. The export name is what you
reference in `mindstudio.json` and import in methods.

### Column Types

| TypeScript type | SQLite type | Notes |
|----------------|-------------|-------|
| `string` | TEXT | Default for most fields |
| `number` | REAL | Numeric values |
| `boolean` | INTEGER | Stored as 0/1 |
| `object` / `array` / JSON types | TEXT | Stored as JSON string, parsed on read |
| `User` (branded type) | TEXT | User ID with `@@user@@` prefix (transparent) |

### System Columns

Every table automatically has these columns. You don't define them —
they're added by the platform and maintained by SQLite triggers:

| Column | Type | Behavior |
|--------|------|----------|
| `id` | TEXT (UUID) | Auto-generated on insert if not provided |
| `created_at` | INTEGER (unix ms) | Set on insert, never changes |
| `updated_at` | INTEGER (unix ms) | Updated on every write |
| `last_updated_by` | TEXT | Set from the current user's auth context |

System columns are automatically stripped from write inputs — you
don't include them in `push()` or `update()` calls.

---

## The `db` Namespace

Import from `@mindstudio-ai/agent`:

```typescript
import { db } from '@mindstudio-ai/agent';
import { Vendors } from './tables/vendors';
```

### Creating Records

```typescript
// Single insert — returns the full row with id, created_at, etc.
const vendor = await Vendors.push({
  name: 'Acme Corp',
  contactEmail: 'billing@acme.com',
  status: 'pending',
  taxId: '12-3456789',
});
// vendor.id is populated

// Batch insert — returns array
const vendors = await Vendors.push([
  { name: 'Acme', status: 'pending', ... },
  { name: 'Globex', status: 'pending', ... },
]);
```

### Reading Records

```typescript
// By ID
const vendor = await Vendors.get('uuid-here');  // Vendor | null

// Find one matching a predicate
const first = await Vendors.findOne(v => v.status === 'approved');

// Filter — returns all matching rows
const approved = await Vendors.filter(v => v.status === 'approved');

// Chainable queries
const results = await Vendors
  .filter(v => v.status === 'approved')
  .sortBy(v => v.name)
  .skip(10)
  .take(5);

// Aggregates
const count = await Vendors.count();
const any = await Vendors.some(v => v.status === 'pending');
const all = await Vendors.every(v => v.status !== 'rejected');
const empty = await Vendors.isEmpty();
const cheapest = await Vendors.min(v => v.totalCents);
const grouped = await Vendors.groupBy(v => v.status);
```

### Updating Records

```typescript
// Update by ID — returns the updated row
const updated = await Vendors.update(vendor.id, {
  status: 'approved',
});
// updated.updated_at is bumped automatically
```

### Deleting Records

```typescript
// Delete by ID
await Vendors.remove(vendor.id);

// Delete all matching a predicate — returns count
const count = await Vendors.removeAll(v => v.status === 'rejected');

// Delete everything
await Vendors.clear();
```

### Filter Predicates

Predicates are JavaScript arrow functions that compile to SQL WHERE
clauses:

```typescript
// Comparisons
Vendors.filter(v => v.status === 'approved')
Vendors.filter(v => v.totalCents > 10000)
Vendors.filter(v => v.totalCents >= 5000 && v.totalCents <= 50000)

// Null checks
Vendors.filter(v => v.paymentTerms !== null)
Vendors.filter(v => v.deletedAt === null)

// Logical operators
Vendors.filter(v => v.status === 'approved' && v.totalCents > 10000)
Vendors.filter(v => v.status === 'approved' || v.status === 'pending')
Vendors.filter(v => !v.isArchived)

// Array membership (IN)
Vendors.filter(v => ['approved', 'pending'].includes(v.status))

// String contains (LIKE)
Vendors.filter(v => v.name.includes('Acme'))

// Nested JSON fields
Vendors.filter(v => v.address.city === 'New York')

// Captured variables work
const minAmount = 10000;
Vendors.filter(v => v.totalCents > minAmount)
```

If a predicate can't be compiled to SQL (complex closures, function
calls), the SDK falls back to fetching all rows and filtering in
JavaScript. A warning is logged.

### Time Helpers

```typescript
db.now()                          // current timestamp (unix ms)
db.days(n)                        // n days in ms
db.hours(n)                       // n hours in ms
db.minutes(n)                     // n minutes in ms
db.ago(duration)                  // now - duration
db.fromNow(duration)              // now + duration

// Composable
db.ago(db.days(7) + db.hours(12)) // 7.5 days ago

// Use in queries
Invoices.filter(i => i.dueDate < db.ago(db.days(30)))
```

### Batch Queries

Execute multiple queries in a single HTTP round-trip:

```typescript
const [vendors, orders] = await db.batch(
  Vendors.filter(v => v.status === 'approved'),
  PurchaseOrders.filter(po => po.vendorId === vendorId),
);
```

---

## Migrations

### How Schema Changes Work

Migrations are additive only:
- **New tables** — `CREATE TABLE` DDL applied automatically
- **New columns** — `ALTER TABLE ADD COLUMN` applied automatically
- **No destructive changes** — column drops, type changes, and renames
  are not supported in the automatic migration path

On `git push`, the platform:
1. Parses your table definition files (TypeScript AST)
2. Diffs against the current live database schema
3. Generates DDL (CREATE TABLE, ALTER TABLE ADD COLUMN)
4. Applies to a staging copy of the database
5. Promotes the staging copy to live

### In Development

The CLI syncs schema changes to the dev database via
`POST /dev/manage/sync-schema`. Same additive constraints — new
tables and new columns only.

---

## Dev Database Operations

### Reset from Live

Overwrite the dev database with a fresh copy of production data.
Preserves database and table IDs (no client reload needed):

```
POST /_internal/v2/apps/{appId}/dev/manage/reset
```

### Truncate

Keep the schema, delete all row data. Used by scenarios for a clean
canvas before seeding:

```
POST /_internal/v2/apps/{appId}/dev/manage/reset
Body: { "mode": "truncate" }
```

Both operations preserve IDs — the frontend and SDK can continue
using existing database references without reloading.

---

## User Type Handling

Columns of type `User` (the branded type from the SDK) store values
with a `@@user@@` prefix in SQLite. The SDK handles this transparently
— your code always works with clean UUID strings. You never see the
prefix.
