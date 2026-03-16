# Tables & Database

## Defining a Table

One file per table in `dist/methods/src/tables/`. Each table is a `defineTable<T>()` call with a typed interface. Table names must match `[a-zA-Z0-9_]` only (no hyphens, spaces, or special characters). Use `snake_case` for table names (e.g., `purchase_orders`, not `purchase-orders`).

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

One export per file. The export name is referenced in `mindstudio.json` and imported in methods. Only define your own columns in the interface — do not add `id`, `created_at`, `updated_at`, or `last_updated_by` (they're provided automatically, see below).

### Column Types

| TypeScript type | SQLite type | Notes |
|----------------|-------------|-------|
| `string` | TEXT | Default for most fields |
| `number` | REAL | Numeric values |
| `boolean` | INTEGER | Stored as 0/1 |
| `object` / `array` / JSON types | TEXT | Stored as JSON string, parsed on read |
| `User` (branded type) | TEXT | User ID with `@@user@@` prefix (transparent — your code works with clean UUIDs) |

### System Columns

Every table automatically has these columns. The SDK adds them to the TypeScript return type automatically — you can access them on any row returned from `get()`, `filter()`, `push()`, etc. without declaring them in your interface. They're also stripped from write inputs, so you never pass them to `push()` or `update()`.

| Column | Type | Behavior |
|--------|------|----------|
| `id` | `string` (UUID) | Auto-generated on insert if not provided |
| `created_at` | `number` (unix ms) | Set on insert, never changes |
| `updated_at` | `number` (unix ms) | Updated on every write |
| `last_updated_by` | `string` | Set from the current user's auth context |

These are always available on read results:

```typescript
const vendor = await Vendors.get('some-id');
vendor.id;          // string — always present
vendor.created_at;  // number — unix ms
vendor.name;        // string — your field

// Sort/filter by system columns works too
await Vendors.sortBy(v => v.created_at).reverse();
await Vendors.filter(v => v.id === someId);
```

## The `db` API

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
await Vendors.remove(vendor.id);                                    // by ID
const count = await Vendors.removeAll(v => v.status === 'rejected'); // by predicate
await Vendors.clear();                                               // delete all
```

### Filter Predicates

Predicates are arrow functions compiled to SQL WHERE clauses:

```typescript
Vendors.filter(v => v.status === 'approved')                          // equality
Vendors.filter(v => v.totalCents > 10000)                             // comparison
Vendors.filter(v => v.totalCents >= 5000 && v.totalCents <= 50000)    // range
Vendors.filter(v => v.paymentTerms !== null)                          // null check
Vendors.filter(v => v.status === 'approved' && v.totalCents > 10000)  // logical AND
Vendors.filter(v => v.status === 'approved' || v.status === 'pending') // logical OR
Vendors.filter(v => ['approved', 'pending'].includes(v.status))       // IN
Vendors.filter(v => v.name.includes('Acme'))                          // LIKE
Vendors.filter(v => v.address.city === 'New York')                    // nested JSON
const minAmount = 10000;
Vendors.filter(v => v.totalCents > minAmount)                         // captured variables
```

If a predicate can't be compiled to SQL (complex closures, function calls), the SDK falls back to fetching all rows and filtering in JavaScript. A warning is logged.

### Time Helpers

```typescript
db.now()                          // current timestamp (unix ms)
db.days(n)                        // n days in ms
db.hours(n)                       // n hours in ms
db.minutes(n)                     // n minutes in ms
db.ago(duration)                  // now - duration
db.fromNow(duration)              // now + duration
db.ago(db.days(7) + db.hours(12)) // composable — 7.5 days ago

// Use in queries
Invoices.filter(i => i.dueDate < db.ago(db.days(30)))
```

### Batch Queries

Execute multiple queries in a single round-trip:

```typescript
const [vendors, orders] = await db.batch(
  Vendors.filter(v => v.status === 'approved'),
  PurchaseOrders.filter(po => po.vendorId === vendorId),
);
```

## Migrations

Migrations are additive only:
- **New tables** — `CREATE TABLE` applied automatically
- **New columns** — `ALTER TABLE ADD COLUMN` applied automatically
- **No destructive changes** — column drops, type changes, and renames are not supported in the automatic migration path

On deploy, the platform:
1. Parses your table definition files (TypeScript AST — the interface IS the schema)
2. Diffs against the current live database schema
3. Generates DDL (CREATE TABLE, ALTER TABLE ADD COLUMN)
4. Applies to a staging copy of the database
5. Promotes the staging copy to live

The TypeScript interface is the single source of truth for the schema. Add a field to the interface, push, and the column exists. No migration files, no CLI commands.

**In development**, schema changes are synced automatically to the dev database. The dev database is a disposable snapshot — it can be reset to a fresh copy of production data or truncated to empty tables at any time. There's no risk of breaking anything by experimenting with schema changes in dev.
