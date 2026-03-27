# Manifest Reference

`mindstudio.json` declares everything the platform needs to know about the app. It's read on every deploy to determine what to compile.

## Example

```json
{
  "appId": "e452fcf2-06c5-49e8-b4f1-6353563f24b0",
  "name": "Procure-to-Pay",

  "roles": [
    { "id": "requester", "name": "Requester", "description": "Can submit vendor requests and purchase orders." },
    { "id": "approver", "name": "Approver", "description": "Reviews and approves purchase orders." },
    { "id": "admin", "name": "Administrator", "description": "Full access to all app functions." }
  ],

  "tables": [
    { "name": "vendors", "path": "dist/methods/src/tables/vendors.ts", "export": "Vendors" },
    { "name": "purchase-orders", "path": "dist/methods/src/tables/purchase-orders.ts", "export": "PurchaseOrders" }
  ],

  "methods": [
    {
      "id": "submit-vendor-request",
      "name": "Submit Vendor Request",
      "path": "dist/methods/src/submitVendorRequest.ts",
      "export": "submitVendorRequest"
    }
  ],

  "interfaces": [
    { "type": "web", "path": "dist/interfaces/web/web.json" },
    { "type": "api" },
    { "type": "cron", "path": "dist/interfaces/cron/interface.json" }
  ],

  "scenarios": [
    {
      "id": "ap-overdue-invoices",
      "name": "AP: Overdue Invoices",
      "description": "AP user with two invoices past due date.",
      "path": "dist/methods/.scenarios/apOverdueInvoices.ts",
      "export": "apOverdueInvoices",
      "roles": ["ap"]
    }
  ]
}
```

## Fields

### `appId` (required)
`string` (UUID). The app's platform identifier. Found in the git remote URL: `https://git.mscdn.ai/{appId}.git`.

### `name` (required)
`string`. Display name shown in the editor and workspace.

### `roles`
`Array<{ id, name?, description? }>`. Defaults to `[]`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier (used in code: `auth.requireRole('admin')`) |
| `name` | `string` | No | Display name |
| `description` | `string` | No | What this role can do |

### `tables`
`Array<{ name, path, export }>`. Defaults to `[]`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Table name — snake_case, `[a-zA-Z0-9_]` only (must match `db.defineTable('name')`) |
| `path` | `string` | Yes | Path to the TypeScript file (relative to project root) |
| `export` | `string` | Yes | Named export from the file (e.g., `Vendors`) |

### `methods` (required, at least one)
`Array<{ id, name?, path, export }>`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier (used in API URLs and frontend method map) |
| `name` | `string` | No | Display name |
| `path` | `string` | Yes | Path to the TypeScript file |
| `export` | `string` | Yes | Named export (the async function) |

### `interfaces`
`Array<{ type, path?, config?, enabled? }>`. Defaults to `[]`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | One of: `web`, `api`, `discord`, `telegram`, `cron`, `webhook`, `email`, `mcp`, `agent` |
| `path` | `string` | No | Path to the interface config file |
| `config` | `object` | No | Inline config (alternative to a file) |
| `enabled` | `boolean` | No | Default `true`. Set `false` to skip during build. |

### `scenarios`
`Array<{ id, name?, description?, path, export, roles }>`. Defaults to `[]`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier |
| `name` | `string` | No | Display name |
| `description` | `string` | No | What state this scenario creates |
| `path` | `string` | Yes | Path to the TypeScript file |
| `export` | `string` | Yes | Named export (the async function) |
| `roles` | `string[]` | Yes | Roles to impersonate after seeding |
