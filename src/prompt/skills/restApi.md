---
name: REST API
what: A designed, documented REST surface over the app's methods — named routes, path and query params, resource groupings, and a generated OpenAPI spec. This is distinct from the method endpoints every app already has: those exist automatically and need nothing from you. This is for when the API itself is the product, or when something outside the app has to integrate against stable URLs rather than internal method names.
when: The moment the plan calls for a public or partner-facing API, or anything outside the app integrating against stable URLs — load it before designing that surface. Also before authoring `src/interfaces/api.md` or adding an `api` interface with designed routes, and when a method needs the raw HTTP request (headers, unparsed body).
---

# REST API Interfaces

REST endpoints for external consumers — other services, mobile apps, integrations. This is separate from the web frontend's internal RPC (`@mindstudio-ai/interface` calls `/_/methods` directly and does not use the API interface). The API interface lives at `/_/api/` and exposes only the methods you choose to route.

Use it for sync endpoints for other services, a public REST API, batch tools — anything where something outside the app's own frontend needs to call a method over HTTP.

**For provider webhooks (Stripe, GitHub, Shopify) there are two native paths**, and they are easy to confuse. This interface handles them with bearer auth and `input._request.rawBody`. The Webhook interface handles them with secret-in-URL routing and a top-level `input.rawBody` — usually the better fit for provider callbacks, since providers can't send a bearer token. Load the `webhooks` skill before choosing.

## Spec: `src/interfaces/api.md`

The human-readable spec. Frontmatter declares the API name and description; the body maps methods to REST routes using MSFM.

```yaml
---
name: Vendor Management API
description: API for managing vendors and purchase orders.
type: interface/api
---
```

Routes are declared as `VERB /path → methodExportName` under resource headings, with annotations for params and descriptions:

```markdown
## Vendors

### List vendors
GET /vendors → listVendors
~~~
Returns all vendors, optionally filtered by status.
query: status (string, optional) — filter by vendor status
~~~

### Create vendor
POST /vendors → submitVendorRequest
~~~
Submit a new vendor for approval.
body: name (string, required) — vendor name
      contactEmail (string, required) — billing contact
~~~

### Delete vendor
DELETE /vendors/:vendorId → deleteVendor
~~~
path: vendorId (string, required) — the vendor's unique identifier
~~~
```

## Compiled Output: `dist/interfaces/api/api.json`

```json
{
  "api": {
    "name": "Vendor Management API",
    "description": "API for managing vendors and purchase orders.",
    "routes": [
      {
        "method": "GET",
        "path": "/vendors",
        "handler": "list-vendors",
        "summary": "List vendors",
        "description": "Returns all vendors, optionally filtered by status.",
        "tag": "Vendors",
        "params": {
          "query": {
            "status": { "type": "string", "required": false, "description": "Filter by vendor status" }
          }
        }
      },
      {
        "method": "POST",
        "path": "/vendors",
        "handler": "submit-vendor-request",
        "summary": "Create vendor",
        "description": "Submit a new vendor for approval.",
        "tag": "Vendors",
        "params": {
          "body": {
            "name": { "type": "string", "required": true, "description": "Vendor name" },
            "contactEmail": { "type": "string", "required": true, "description": "Billing contact" }
          }
        }
      },
      {
        "method": "DELETE",
        "path": "/vendors/:vendorId",
        "handler": "delete-vendor",
        "summary": "Delete vendor",
        "description": "Permanently remove a vendor.",
        "tag": "Vendors",
        "params": {
          "path": {
            "vendorId": { "type": "string", "required": true, "description": "The vendor's unique identifier" }
          }
        }
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | API display name (used in generated OpenAPI spec) |
| `description` | API description |
| `routes[].method` | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `routes[].path` | URL path with `:param` placeholders for path params |
| `routes[].handler` | Method `id` from the manifest (kebab-case) |
| `routes[].summary` | Short description for the endpoint |
| `routes[].description` | Longer description |
| `routes[].tag` | Resource grouping (becomes a tag in OpenAPI) |
| `routes[].params` | Parameter declarations: `path`, `query`, and/or `body` objects |

Declare it in `mindstudio.json`:

```json
{ "type": "api", "path": "dist/interfaces/api/api.json" }
```

## Platform Behavior

Routes are mounted at `/_/api{path}` (e.g. `DELETE /_/api/vendors/abc123`).

- **Path params** are extracted and merged into the method's input: `/:vendorId` → `{ vendorId: "abc123" }`
- **Query params** are merged into input for GET requests: `?status=approved` → `{ status: "approved" }`
- **Request body** for POST/PUT/PATCH is the input directly (no `{ input: {...} }` wrapper)
- **Response** is the method output directly (no `{ output: {...} }` wrapper)
- **Auth** via `Authorization: Bearer sk_...` — an API key resolves to a user with full RBAC, so the method's own `auth.requireRole(...)`/`hasRole(...)` checks apply exactly as they would for that user
- **Streaming**: `Accept: text/event-stream` header returns SSE chunks
- **Raw request context**: Every API method receives `input._request` with `{ method, headers, rawBody }`. `rawBody` is the original unparsed body as a UTF-8 string — needed for signature verification, since providers HMAC the raw payload and a re-serialized body won't match. For most methods you don't need `_request` at all.
