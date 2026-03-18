# Backend SDK (`@mindstudio-ai/agent`)

TypeScript SDK for backend methods. Provides `db` (database operations) and `auth` (role-based access control) namespaces. Under the hood, a thin HTTP client that routes all operations through the platform API using a `CALLBACK_TOKEN` that encodes execution context.

The SDK is intentionally thin; all business logic lives in the platform. The SDK is just a typed interface to platform capabilities. This means updates to database routing, caching, or auth logic happen on the platform side without SDK version bumps.

Source: `/Users/sean/Dropbox/Projects/youai/mindstudio-agent/src/`

---

## How It Works

### Authentication Resolution (priority order)

1. `CALLBACK_TOKEN` env var — inside MindStudio execution (always wins)
2. `apiKey` constructor argument
3. `MINDSTUDIO_API_KEY` env var
4. `~/.mindstudio/config.json`

### Base URL Resolution (priority order)

1. Constructor `baseUrl`
2. `MINDSTUDIO_BASE_URL` env var
3. `REMOTE_HOSTNAME` env var
4. `~/.mindstudio/config.json`
5. `https://v1.mindstudio-api.com`

### CALLBACK_TOKEN Flow

The token is the routing key for everything:

1. Platform generates a hook authorization token when dispatching a method execution (encodes appId, appVersionId, userId, orgId)
2. Token is set as `CALLBACK_TOKEN` env var in the sandbox process
3. SDK reads it on first use, sends as `Authorization` header
4. All `db` operations → `POST /_internal/v2/db/query` with the token
5. Platform validates → extracts `appVersionId` → routes to the correct database version

In dev mode, the tunnel sets `CALLBACK_TOKEN` in the child process environment. The token points at the dev release's database. The SDK doesn't know or care whether it's in dev or production; the token handles routing.

**Why CALLBACK_TOKEN instead of API key:** The API key identifies the organization. The callback token identifies the *execution context*: which release, which database version, which user. Without it, every SDK call would need to specify these explicitly. The token makes the SDK simple: just call `db.push()` and the platform figures out where the data goes.

### Context Hydration

The SDK needs auth context (role assignments, databases) before it can execute queries. Two paths:

- **Sandbox mode:** preloaded from `globalThis.ai` (set by the executor bootstrap script). Synchronous, no HTTP needed.
- **External mode:** lazy-loaded via `GET /helpers/app-context` on first use. Cached for the instance lifetime.

---

## `db` Namespace

### Defining Tables

```typescript
import { db } from '@mindstudio-ai/agent';

interface Vendor {
  name: string;
  contactEmail: string;
  status: 'pending' | 'approved' | 'rejected';
}

const Vendors = db.defineTable<Vendor>('vendors');
```

`defineTable<T>(name, options?)` returns a `Table<T>`, a lazy handle. No HTTP until a query executes. Options: `{ database?: string }` for apps with multiple databases.

### System Columns

Every table has these columns automatically. They're managed by SQLite triggers; application code never sets them:

| Column | Type | Behavior |
|--------|------|----------|
| `id` | TEXT (UUID) | Auto-generated on insert |
| `created_at` | INTEGER (unix ms) | Set on insert |
| `updated_at` | INTEGER (unix ms) | Updated on every write |
| `last_updated_by` | TEXT | Set from auth context |

System columns are stripped from write inputs automatically. Both `snake_case` and `camelCase` variants are supported.

### Reads

**Direct reads:**
```typescript
const vendor = await Vendors.get(id);           // by ID, returns T | null
const first = await Vendors.findOne(v => v.status === 'approved');
const count = await Vendors.count();
const any = await Vendors.some(v => v.status === 'pending');
const all = await Vendors.every(v => v.status !== 'rejected');
const empty = await Vendors.isEmpty();
const cheapest = await Vendors.min(v => v.totalCents);
const grouped = await Vendors.groupBy(v => v.status);
```

**Chainable queries:**
```typescript
const results = await Vendors
  .filter(v => v.status === 'approved')
  .sortBy(v => v.name)
  .skip(10)
  .take(5);
```

Query methods: `.reverse()`, `.take(n)`, `.skip(n)`, `.first()`, `.last()`, `.count()`, `.some()`, `.every()`, `.groupBy(accessor)`

### Writes

All writes use `RETURNING *` and return the full row after mutation:

```typescript
const vendor = await Vendors.push({ name: 'Acme', status: 'pending' });
// vendor.id is populated, created_at is set

const updated = await Vendors.update(vendor.id, { status: 'approved' });
// updated.updated_at is bumped

await Vendors.remove(vendor.id);

const count = await Vendors.removeAll(v => v.status === 'rejected');

await Vendors.clear(); // delete all rows
```

Batch insert:
```typescript
const vendors = await Vendors.push([
  { name: 'Acme', status: 'pending' },
  { name: 'Globex', status: 'pending' },
]);
```

### Predicate Compiler

Filter predicates are JavaScript arrow functions that get compiled to SQL WHERE clauses:

```typescript
// Compiles to: WHERE status = 'approved' AND total_cents > 10000
Vendors.filter(v => v.status === 'approved' && v.totalCents > 10000)
```

**Supported patterns:**
- Comparisons: `===`, `!==`, `<`, `>`, `<=`, `>=`
- Null checks: `=== null`, `!= null`
- Logical: `&&` (AND), `||` (OR), `!expr` (NOT)
- Boolean fields: `v.active` (truthy), `!v.deleted` (falsy)
- `Array.includes`: `['a','b'].includes(v.field)` → `IN ('a','b')`
- `String.includes`: `v.name.includes('acme')` → `LIKE '%acme%'`
- Nested JSON: `v.address.city` → `json_extract(address, '$.city')`
- Closure variables: captured and resolved via Proxy

**Fallback:** Any pattern that can't be compiled to SQL (complex closures, function calls, etc.) triggers a fallback: fetch all rows, filter in JavaScript. A warning is logged.

### Time Helpers

```typescript
db.now()              // current unix timestamp (ms)
db.days(n)            // n days in ms
db.hours(n)           // n hours in ms
db.minutes(n)         // n minutes in ms
db.ago(duration)      // now - duration
db.fromNow(duration)  // now + duration

// Composable:
db.ago(db.days(7) + db.hours(12))
```

### Batch Queries

Execute multiple queries in a single HTTP round-trip:

```typescript
const [vendors, orders] = await db.batch(
  Vendors.filter(v => v.status === 'approved'),
  PurchaseOrders.filter(po => po.vendorId === vendorId),
);
```

### User Type Handling

Columns of type `user` store values with a `@@user@@` prefix in SQLite (e.g., `@@user@@550e8400-...`). The SDK handles this transparently; application code always works with clean UUIDs.

---

## `auth` Namespace

```typescript
import { auth, Roles } from '@mindstudio-ai/agent';
```

### Properties

- `auth.userId` — current user's ID
- `auth.roles` — array of role names for the current user

### Methods

```typescript
auth.hasRole('admin')              // boolean — has ANY of the given roles
auth.hasRole('admin', 'manager')   // true if user has admin OR manager

auth.requireRole('admin')          // throws 403 if user lacks the role
auth.requireRole('admin', 'ap')    // throws if user has NONE of the roles

const userIds = await auth.getUsersByRole('admin')  // all users with this role
```

### Roles Proxy

```typescript
import { Roles } from '@mindstudio-ai/agent';

auth.requireRole(Roles.admin);     // Roles.admin === "admin"
auth.requireRole(Roles.anyString); // Roles.anyString === "anyString"
```

Provides autocomplete and typo prevention. Future: generated from `mindstudio.json` for compile-time safety.

### How Auth Context Flows

1. Method is invoked → platform loads role assignments for the app
2. Assignments are passed into the sandbox execution context
3. `globalThis.ai.auth` is populated with `{ userId, roleAssignments }`
4. SDK reads synchronously (no HTTP needed for role checks)
5. In dev mode: `roleOverride` from impersonation is applied on top

---

## Rate Limiting

| Context | Concurrency | Call cap |
|---------|-------------|---------|
| Internal (CALLBACK_TOKEN) | 10 | 500 per execution |
| API key | 20 | unlimited |

Queue-based concurrency management. Limits updated from response headers (`x-ratelimit-*`). Throws `call_cap_exceeded` when the internal token hits 500 calls (prevents runaway executions).

---

## Error Handling

```typescript
import { MindStudioError } from '@mindstudio-ai/agent';

// Thrown by SDK on failures:
// new MindStudioError(message, code, status, details?)
// - message: user-facing text
// - code: machine-readable (e.g., 'invalid_step_config')
// - status: HTTP status code
// - details: raw API error body
```

---

## Other Capabilities

The `@mindstudio-ai/agent` package also provides:

- `mindstudio.executeStep()` — invoke v1 workflow steps (AI generation, connectors, etc.)
- `mindstudio.runAgent()` — invoke other MindStudio apps
- `resolveUser(userId)` — get user display info (name, email, picture)
- `mindstudio.uploadFile()` — upload to CDN
- `mindstudio.listModels()` — discover available AI models
- `mindstudio.listConnectors()` — browse OAuth connector registry

These capabilities are what make the SDK more than just a database client. It's an interface to the entire MindStudio platform, including thousands of pre-built integrations and AI models.

---

## Design Rationale

**Why a thin SDK:** All logic lives in the platform. The SDK is a typed HTTP client. This means database routing, caching, auth, rate limiting, and billing logic can all be updated server-side without requiring SDK version bumps. The SDK's job is to provide a clean API surface, not to contain business logic.

**Why predicate compilation:** Developers write natural JavaScript (`v => v.status === 'approved'`), and the SDK compiles it to SQL for efficient server-side execution. The fallback (fetch all, filter in JS) ensures nothing breaks if a pattern can't be compiled; it just runs slower. This is the right tradeoff for developer experience: write natural code, get efficient queries.
