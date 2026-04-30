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

### Table Options

`defineTable<T>()` accepts an optional second argument with table-level configuration:

```typescript
export const Users = db.defineTable<User>('users', {
  unique: [['email']],
  defaults: { role: 'member', status: 'active' },
});
```

- **`unique`** — `(keyof T & string)[][]` — Column groups that form unique constraints. Each entry is a string array of column names. These are required for `upsert()` (see below). Schema sync on the platform creates the actual SQLite UNIQUE indexes.
  - Single column: `[['email']]`
  - Compound: `[['userId', 'orgId']]`
  - Multiple constraints: `[['email'], ['slug']]`
- **`defaults`** — `Partial<T>` — Default values applied client-side in `push()` and `upsert()` before building the INSERT. Explicit values in the input override defaults.

### Column Types

| TypeScript type | SQLite type | Notes |
|----------------|-------------|-------|
| `string` | TEXT | Default for most fields |
| `number` | REAL | Numeric values |
| `boolean` | INTEGER | Stored as 0/1 |
| `object` / `array` / JSON types | TEXT | Stored as JSON string, parsed on read |
| `User` (branded type) | TEXT | User ID with `@@user@@` prefix (transparent — your code works with clean UUIDs) |

### When to Use JSON Columns vs Separate Tables

Every table operation is a network round-trip — not a local SQLite query. There are no JOINs. Fetching related data across tables means multiple sequential or batched HTTP calls. Design your schema around how data is accessed, not traditional normalization rules. Remember that databases in these apps are usually quite small - often single or a handful of users - we need to optimize for speed, not normalization.

**Use a JSON column** when the data is always read and written with its parent. A product with a list of variant options, a form submission with its answers etc — these are single units that load together and save together. One row, one round-trip.

**Use a separate table** when you need to query the child data independently, when the child set could grow unbounded, or when children are updated individually without touching the parent.

Most 1:1 and 1:few relationships belong in JSON columns. Separate tables are for genuinely independent entities that happen to reference each other.

### System Columns

Every table automatically has these columns. The SDK adds them to the TypeScript return type automatically — you can access them on any row returned from `get()`, `filter()`, `push()`, etc. without declaring them in your interface. They're also stripped from write inputs, so you never pass them to `push()` or `update()`.

| Column | Type | Behavior |
|--------|------|----------|
| `id` | `string` (UUID) | Auto-generated on insert if not provided |
| `created_at` | `number` (unix ms) | Set on insert, never changes |
| `updated_at` | `number` (unix ms) | Updated on every write |
| `last_updated_by` | `string` | Set from the current user's auth context |

### Auth-Managed Columns

When a table is configured as the auth table in the manifest (`auth.table`), some columns have special behavior:

- **`email` / `phone`** (mapped columns) — read-only from code. Writing via `push()`, `update()`, or `upsert()` throws a `MindStudioError`. Use the auth API (`auth.requestEmailChange()` etc.) to change these.
- **`roles`** (mapped column) — read/write from both code and the dashboard. Writes sync automatically to the platform.
- All other columns on the auth table behave normally.

### Reading System Columns

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

`upsert(conflictKey, data)` generates `INSERT ... ON CONFLICT(...) DO UPDATE SET ...` using SQLite's `excluded.` syntax. All non-conflict columns are updated on conflict. Returns a `Mutation<T>` — works with `await` standalone or inside `db.batch()`, same as `push()` and `update()`.

The conflict key must match a declared `unique` constraint on the table. Throws `MindStudioError` with code `no_unique_constraint` if no match.

### Reading Records

All read methods return lazy `Query` objects — nothing executes until `await`. Every read method (including `get()`, `findOne()`, `count()`, etc.) is batchable via `db.batch()`.

```typescript
// By ID
const vendor = await Vendors.get('uuid-here');  // Vendor | null

// All rows
const allVendors = await Vendors.toArray();

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

// Aggregates — all return Query objects (batchable)
const count = await Vendors.count();
const any = await Vendors.some(v => v.status === 'pending');
const cheapest = await Vendors.min(v => v.totalCents);
const grouped = await Vendors.groupBy(v => v.status);

// These two return Promises directly (not batchable)
const all = await Vendors.every(v => v.status !== 'rejected');
const empty = await Vendors.isEmpty();
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
const { deleted } = await Vendors.remove(vendor.id);                 // { deleted: boolean }
const count = await Vendors.removeAll(v => v.status === 'rejected'); // number (count removed)
const cleared = await Vendors.clear();                               // number (count deleted)
```

### Filter Predicates

Predicates are arrow functions compiled to SQL WHERE clauses. Two forms — closure (literal-only) and bindings (when the predicate references an outer-scope value):

```typescript
// Closure form — works for literals only:
Vendors.filter(v => v.status === 'approved');

// Bindings form — required when the predicate references an outer-scope
// value (input.*, auth.*, foreign keys collected earlier, etc.). Without
// bindings, the predicate falls back to fetching every row and filtering
// in JS — a warning is logged when this happens.
Vendors.filter(
  (v, $) => v.companyId === $.companyId,
  { companyId: input.companyId }, // bindings: lifts closure var so filter compiles to SQL
);
```

Both produce identical results. The bindings form is faster on tables of any size and dramatically faster on large tables.

#### Patterns

```typescript
// Equality / inequality
Companies.filter((c, $) => c.ownerId === $.ownerId, { ownerId: auth.userId }); // bindings: lifts closure var so filter compiles to SQL

// Comparison / range
Investments.filter((i, $) => i.amountInvested >= $.minAmount, { minAmount: 10000 }); // bindings: lifts closure var so filter compiles to SQL

// Mixed bindings + literal — freely combinable
Investments.filter(
  (i, $) => i.companyId === $.companyId && i.status === 'active',
  { companyId: input.companyId }, // bindings: lifts closure var so filter compiles to SQL
);

// IN clause — array binding
ContactRelationships.filter(
  (r, $) => $.contactIds.includes(r.contactId),
  { contactIds: ['a', 'b', 'c'] }, // bindings: lifts closure var so filter compiles to SQL
);

// LIKE clause — string binding
SimpleRecords.filter(
  (r, $) => r.slug.includes($.prefix),
  { prefix: 'lat-' }, // bindings: lifts closure var so filter compiles to SQL
);

// Nested keys
Orders.filter(
  (o, $) => o.companyId === $.user.companyId,
  { user: { companyId: input.companyId } }, // bindings: lifts closure var so filter compiles to SQL
);

// removeAll with bindings — single DELETE WHERE … instead of fetch-all-then-delete-by-id
SimpleRecords.removeAll(
  (r, $) => r.slug.includes($.prefix),
  { prefix: 'lat-' }, // bindings: lifts closure var so removeAll compiles to SQL
);
```

#### What compiles to SQL

- Literals: equality, comparisons, range, null checks, `&&`/`||`/`!`, `.includes()` for arrays and strings, nested JSON access (`v.address.city === 'New York'`).
- Outer-scope values when passed via bindings (same shapes as above).

#### What falls back to JS

- Closure references without a bindings argument: `o => o.x === input.x`.
- Two-param predicate without a bindings argument: `(o, $) => …` but no `{…}` second arg.
- Mixed predicate where some closure refs aren't lifted (e.g. `(o, $) => o.companyId === $.companyId && o.status === stale` where `stale` is from outer scope). Falls back for the *whole* predicate — lift everything outer-scope into bindings.
- Bindings keys missing or `undefined` (predicate references `$.foo` but bindings has no `foo`). The SDK does not silently substitute NULL.
- Bindings value is a non-scalar/non-array (e.g. `$.user` is `{...}`). Read scalar leaves only.
- `.startsWith()`, regex, computed expressions like `o.a + o.b > 100`.

A warning is logged whenever a predicate falls back to JS. Avoid these patterns on large tables.

#### When to use bindings — and when to skip

Use bindings whenever a predicate compares against `input.*`, `auth.*`, request params, foreign keys collected earlier, or any other function-scope value, and the table can grow beyond a few hundred rows. Always use them inside `db.batch(...)` where table size could grow over time.

Skip bindings when the predicate only references the row plus string/number literals — those already compile to SQL with no help. Also fine to skip on small fixed-size tables (under ~100 rows) where the JS fallback is fast enough not to matter.

#### Inline-comment requirement

When you write a bindings argument, include a brief inline comment on the bindings object explaining its purpose. Without the comment, downstream coding agents read the bindings object as boilerplate and "simplify" it back to closure form — silently regressing performance. The canonical phrasing is `// bindings: lifts closure var so filter compiles to SQL`. Exact wording isn't critical; what matters is naming the failure mode.

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

### Error Handling on Queries

Both `Query<T>` and `Mutation<T>` support `.then()` and `.catch()` directly:

```typescript
const user = await Users.upsert('email', data).catch(err => {
  if (err.code === 'no_unique_constraint') { /* ... */ }
  throw err;
});
```

Write methods throw `MindStudioError` with specific codes:
- `push()` → `'insert_failed'` (500) if the insert returns no row
- `update()` → `'row_not_found'` (404) if the ID doesn't exist
- `upsert()` → `'missing_conflict_key'` (400) if the conflict column is missing from the data, `'no_unique_constraint'` (400) if no matching unique constraint is declared

### Batching

`db.batch()` combines multiple operations into a single HTTP round-trip. Every `await` on a table operation is a network call, so batching is critical for performance. Use it whenever you have multiple reads, writes, or a mix of both. `upsert()` works in batches just like `push()` and `update()`:

```typescript
// Reads: fetch related data in one call instead of sequential awaits.
// Note the bindings on PurchaseOrders — without it, that filter would
// fall back to JS because vendorId is a closure capture. Hoisting a
// shared `$` lets every filter in the batch reuse it.
const $ = { vendorId }; // bindings: lifts closure var so filters compile to SQL
const [vendors, orders, invoiceCount] = await db.batch(
  Vendors.filter(v => v.status === 'approved'),                    // literal — no bindings needed
  PurchaseOrders.filter((po, $) => po.vendorId === $.vendorId, $), // bindings
  Invoices.count(i => i.status === 'pending'),                     // literal — no bindings needed
);

// Writes: batch multiple updates instead of awaiting each one in a loop
const mutations = items.map(item =>
  Orders.update(item.id, { status: 'approved' })
);
await db.batch(...mutations);

// Mixed: writes execute in order, reads observe prior writes
const [_, newOrder, pending] = await db.batch(
  Orders.update(id, { status: 'approved' }),
  Orders.push({ item: 'Laptop', amount: 999, status: 'pending', requestedBy: userId }),
  Orders.filter(o => o.status === 'pending').take(10),
);
```

**Always batch instead of sequential awaits.** A loop with `await Table.update()` inside makes N separate HTTP calls. Mapping to mutations and passing them to `db.batch()` makes one.

**Note:** Almost all read methods return batchable `Query` objects — including `get()`, `findOne()`, `count()`, `some()`, `min()`, `max()`, and `groupBy()`. The exceptions are `every()` and `isEmpty()`, which return Promises directly and cannot be batched.

## Migrations

No migration files. Migrations are automatic:
- **New tables** — `CREATE TABLE` applied automatically
- **New columns** — `ALTER TABLE ADD COLUMN` applied automatically
- **Dropped columns** — `ALTER TABLE DROP COLUMN` applied automatically when a column is removed from the interface
- **Dropped tables** — `DROP TABLE` applied automatically when a table file is removed from the manifest
- **Type changes and renames** — not supported in the automatic migration path

On deploy, the platform:
1. Parses your table definition files (TypeScript AST — the interface IS the schema)
2. Diffs against the current live database schema
3. Generates DDL (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `DROP TABLE`)
4. Applies to a staging copy of the database
5. Promotes the staging copy to live

The TypeScript interface is the single source of truth for the schema. Add a field to the interface, push, and the column exists. No migration files, no CLI commands.

**In development**, schema changes are synced automatically to the dev database. The dev database is a disposable snapshot — it can be reset to a fresh copy of production data or truncated to empty tables at any time. There's no risk of breaking anything by experimenting with schema changes in dev.
