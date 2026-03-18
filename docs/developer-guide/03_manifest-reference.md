# Manifest Reference (`mindstudio.json`)

The manifest declares everything the platform needs to know about your app — methods, tables, roles, interfaces, scenarios. It's read on every `git push` to determine what to compile and deploy.

---

## Full Example

```json
{
  "appId": "e452fcf2-06c5-49e8-b4f1-6353563f24b0",
  "name": "Procure-to-Pay",

  "roles": [
    { "id": "requester", "name": "Requester", "description": "Can submit vendor requests and purchase orders." },
    { "id": "approver", "name": "Approver", "description": "Reviews and approves purchase orders." },
    { "id": "admin", "name": "Administrator", "description": "Full access to all app functions." },
    { "id": "ap", "name": "Accounts Payable", "description": "Processes invoices and payments." }
  ],

  "tables": [
    { "name": "vendors", "path": "dist/methods/src/tables/vendors.ts", "export": "Vendors" },
    { "name": "purchase-orders", "path": "dist/methods/src/tables/purchase-orders.ts", "export": "PurchaseOrders" },
    { "name": "invoices", "path": "dist/methods/src/tables/invoices.ts", "export": "Invoices" }
  ],

  "methods": [
    {
      "id": "submit-vendor-request",
      "name": "Submit Vendor Request",
      "path": "dist/methods/src/submitVendorRequest.ts",
      "export": "submitVendorRequest"
    },
    {
      "id": "get-dashboard",
      "name": "Dashboard",
      "path": "dist/methods/src/getDashboard.ts",
      "export": "getDashboard"
    }
  ],

  "interfaces": [
    { "type": "web", "path": "dist/interfaces/web/web.json" },
    { "type": "api" },
    { "type": "cron", "path": "dist/interfaces/cron/interface.json" },
    { "type": "discord", "path": "dist/interfaces/discord/interface.json" }
  ],

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

---

## Fields

### `appId`

| | |
|---|---|
| Type | `string` (UUID) |
| Required | Yes |

The app's UUID, assigned when created on the platform. Found in the git remote URL: `https://git.mscdn.ai/{appId}.git`.

### `name`

| | |
|---|---|
| Type | `string` |
| Required | Yes |

Display name. Shown in the editor, workspace listings, and session context.

### `roles`

| | |
|---|---|
| Type | `Array<{ id, name?, description? }>` |
| Required | No (defaults to `[]`) |

Defines the app's roles for access control. Each role:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier (used in code: `auth.requireRole('admin')`) |
| `name` | `string` | No | Display name |
| `description` | `string` | No | What this role can do (shown in editor, useful context for the agent) |

Roles are synced to the platform on deploy. Users are assigned to roles in the editor. See [Roles & Auth](06_roles-and-auth.md).

### `tables`

| | |
|---|---|
| Type | `Array<{ name, path, export }>` |
| Required | No (defaults to `[]`) |

Declares database tables. Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Table name (matches `db.defineTable('name')`) |
| `path` | `string` | Yes | Path to the TypeScript file (relative to project root) |
| `export` | `string` | Yes | Named export from the file (e.g., `Vendors`) |

The platform parses the TypeScript to extract the schema. See [Tables & Database](04_tables-and-database.md).

### `methods`

| | |
|---|---|
| Type | `Array<{ id, name?, path, export }>` |
| Required | Yes (at least one) |

Declares backend methods. Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier (used in API URLs and frontend method map) |
| `name` | `string` | No | Display name |
| `path` | `string` | Yes | Path to the TypeScript file |
| `export` | `string` | Yes | Named export (the async function) |

See [Methods](05_methods.md).

### `interfaces`

| | |
|---|---|
| Type | `Array<{ type, path?, config?, enabled? }>` |
| Required | No (defaults to `[]`) |

Declares how users interact with the app. Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | One of: `web`, `api`, `discord`, `telegram`, `cron`, `webhook`, `email`, `mcp` |
| `path` | `string` | No | Path to the interface config file |
| `config` | `object` | No | Inline config (alternative to a file) |
| `enabled` | `boolean` | No | Default `true`. Set `false` to skip during build. |

See [Interfaces](07_interfaces.md) for the config schema for each type.

### `scenarios`

| | |
|---|---|
| Type | `Array<{ id, name?, description?, path, export, roles }>` |
| Required | No (defaults to `[]`) |

Declares seed scripts for testing. Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier |
| `name` | `string` | No | Display name |
| `description` | `string` | No | What state this scenario creates |
| `path` | `string` | Yes | Path to the TypeScript file |
| `export` | `string` | Yes | Named export (the async function) |
| `roles` | `string[]` | Yes | Roles to impersonate after seeding |

See [Scenarios](08_scenarios.md).
