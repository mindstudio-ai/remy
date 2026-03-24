# Tables & Database

## Defining a Table

Each table is a TypeScript file with a typed interface and a `defineTable<T>()` call:

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

One file per table, one export per file. The export name is what you reference in `mindstudio.json` and import in methods.

### Table Options

`defineTable<T>()` accepts an optional second argument:

```typescript
export const Users = db.defineTable<User>('users', {
  unique: [['email']],
  defaults: { role: 'member', status: 'active' },
});
```

- **`unique`** — `(keyof T & string)[][]` — Column groups that form unique constraints. Each entry is a string array of column names. Required for `upsert()` (see below). The platform creates the actual SQLite UNIQUE indexes during schema sync.
  - Single column: `[['email']]`
  - Compound: `[['userId', 'orgId']]`
  - Multiple constraints: `[['email'], ['slug']]`
- **`defaults`** — `Partial<T>` — Default values applied client-side in `push()` and `upsert()` before building the INSERT. Explicit values in the input override defaults.
- **`database`** — `string` — For apps with multiple databases.

### Column Types

| TypeScript type | SQLite type | Notes |
|----------------|-------------|-------|
| `string` | TEXT | Default for most fields |
| `number` | REAL | Numeric values |
| `boolean` | INTEGER | Stored as 0/1 |
| `object` / `array` / JSON types | TEXT | Stored as JSON string, parsed on read |
| `User` (branded type) | TEXT | User ID with `@@user@@` prefix (transparent) |

### System Columns

Every table gets these automatically. You don't define them; they're added by the platform and maintained by SQLite triggers:

| Column | Type | Behavior |
|--------|------|----------|
| `id` | TEXT (UUID) | Auto-generated on insert if not provided |
| `created_at` | INTEGER (unix ms) | Set on insert, never changes |
| `updated_at` | INTEGER (unix ms) | Updated on every write |
| `last_updated_by` | TEXT | Set from the current user's auth context |

System columns are automatically stripped from write inputs. You don't include them in `push()` or `update()` calls.

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

If the table has `defaults` configured, missing fields are filled in automatically. Explicit values override defaults.

### Upsert (Insert or Update)

```typescript
// Insert if no conflict on 'email', otherwise update the existing row
const user = await Users.upsert('email', {
  email: 'alice@acme.com',
  name: 'Alice',
  role: 'admin',
});

// Compound conflict key — pass an array
const membership = await Memberships.upsert(['userId', 'orgId'], {
  userId: user.id,
  orgId: org.id,
  role: 'member',
});
```

`upsert(conflictKey, data)` generates `INSERT ... ON CONFLICT(...) DO UPDATE SET ...` using SQLite's `excluded.` syntax. All non-conflict columns are updated on conflict. If all columns are conflict columns, falls back to `DO NOTHING`. Returns a `Mutation<T>` — works with `await` standalone or inside `db.batch()`.

The conflict key must match a declared `unique` constraint on the table. Throws `MindStudioError` with code `no_unique_constraint` if no match.

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

Predicates are arrow functions that compile to SQL WHERE clauses. They look like normal JavaScript but run as SQL:

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

If a predicate can't be compiled to SQL (complex closures, function calls), the SDK falls back to filtering in JavaScript. A warning is logged.

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

### Error Handling on Queries

Both `Query<T>` and `Mutation<T>` support `.then()` and `.catch()` directly:

```typescript
const user = await Users.upsert('email', data).catch(err => {
  if (err.code === 'no_unique_constraint') { /* ... */ }
  throw err;
});
```

### Batch Queries

Execute multiple queries in a single HTTP round-trip. All query and mutation types work in batches, including `upsert()`:

```typescript
const [vendors, orders] = await db.batch(
  Vendors.filter(v => v.status === 'approved'),
  PurchaseOrders.filter(po => po.vendorId === vendorId),
);
```

---

## Migrations

### How Schema Changes Work

No migration files. Migrations are automatic:
- **New tables** — `CREATE TABLE` applied automatically
- **New columns** — `ALTER TABLE ADD COLUMN` applied automatically
- **Dropped columns** — `ALTER TABLE DROP COLUMN` applied automatically when a column is removed from the interface
- **Dropped tables** — `DROP TABLE` applied automatically when a table file is removed from the manifest
- **Type changes and renames** — not supported in the automatic migration path

On `git push`, the platform:
1. Parses your table definition files (TypeScript AST)
2. Diffs against the current live database schema
3. Generates DDL (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `DROP TABLE`)
4. Applies to a staging copy of the database
5. Promotes the staging copy to live

### In Development

The CLI syncs schema changes to the dev database via `POST /dev/manage/sync-schema`. Same constraints as production.

---

## Dev Database Operations

### Reset from Live

Overwrite the dev database with a fresh copy of production data. Preserves database and table IDs (no client reload needed):

```
POST /_internal/v2/apps/{appId}/dev/manage/reset
```

### Truncate

Keep the schema, delete all row data. Used by scenarios for a clean canvas before seeding:

```
POST /_internal/v2/apps/{appId}/dev/manage/reset
Body: { "mode": "truncate" }
```

Both operations preserve IDs, so the frontend and SDK can continue using existing database references without reloading.

---

## User Type Handling

Columns of type `User` (the branded type from the SDK) store values with a `@@user@@` prefix in SQLite. The SDK handles this transparently. Your code works with clean UUID strings. You never see the prefix.
