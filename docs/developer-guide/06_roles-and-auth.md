# Roles & Auth

MindStudio apps use role-based access control. Roles are defined in the manifest, assigned to users in the editor, and enforced in methods.

The backend is the authority — methods enforce access control via `auth.requireRole()`. The frontend can read roles for conditional rendering, but enforcement always happens server-side.

---

## Defining Roles

In `mindstudio.json`:

```json
{
  "roles": [
    { "id": "requester", "name": "Requester", "description": "Can submit vendor requests and purchase orders." },
    { "id": "approver", "name": "Approver", "description": "Reviews and approves purchase orders." },
    { "id": "admin", "name": "Administrator", "description": "Full access to all app functions." },
    { "id": "ap", "name": "Accounts Payable", "description": "Processes invoices and payments." }
  ]
}
```

- `id` — kebab-case, used in code (`auth.requireRole('admin')`)
- `name` — display name shown in the editor
- `description` — what this role can do (useful for the AI agent and for users in the role assignment UI)

Roles are synced to the platform on deploy. Adding or removing roles in the manifest creates or deletes them on the next push.

---

## Role Assignments

Users are assigned to roles in the MindStudio editor. One user can have multiple roles. Role assignments are managed via the platform API:

```
GET  /roles/list                        — list all roles
GET  /roles/assignments                 — list all user-role mappings
POST /roles/set-user-roles { userId, roleNames[] }
POST /roles/get-users-by-role { roleName }
```

---

## Using Roles in Methods

```typescript
import { auth } from '@mindstudio-ai/agent';

export async function approveVendor(input: { vendorId: string }) {
  // Require the user to have the 'admin' role — throws 403 if not
  auth.requireRole('admin');

  // ...
}

export async function reviewPurchaseOrder(input: { poId: string }) {
  // Require ANY of the listed roles
  auth.requireRole('admin', 'approver');

  // ...
}

export async function getDashboard() {
  // Check without throwing
  const isAdmin = auth.hasRole('admin');

  // Current user's ID
  const userId = auth.userId;

  // Current user's roles
  const roles = auth.roles;  // ['admin', 'approver']

  // Get all users with a specific role
  const admins = await auth.getUsersByRole('admin');

  // ...
}
```

### `auth.requireRole(...roles)`

Throws a 403 error if the current user doesn't have **any** of the specified roles. Use this at the top of methods to gate access.

### `auth.hasRole(...roles)`

Returns `boolean`. Same logic as `requireRole` but doesn't throw. Use for conditional behavior within a method.

### `auth.userId`

The current user's UUID. Always available.

### `auth.roles`

Array of role names assigned to the current user.

### `auth.getUsersByRole(role)`

Returns an array of user IDs that have the specified role. Useful for things like "notify all admins."

---

## Using Roles in the Frontend

```typescript
import { auth } from '@mindstudio-ai/interface';

// Read-only user identity
auth.userId;            // current user's ID
auth.name;              // display name
auth.email;             // email address
auth.profilePictureUrl; // URL or null
```

The frontend SDK provides display-only auth context. Role checking for UI purposes (showing/hiding elements) is done by reading role data from the backend:

```typescript
const api = createClient<AppMethods>();

// Fetch role info from a method
const { isAdmin, pendingCount } = await api.getDashboard();

// Conditionally render
{isAdmin && <AdminPanel />}
```

The frontend is untrusted — anyone can modify JavaScript in the browser. The frontend shows or hides UI elements based on role data from the backend, but the backend is always the authority.

---

## Impersonation (Dev Mode)

During development, impersonate any role to test role-based behavior:

```
POST /dev/manage/impersonate
Body: { "roles": ["ap"] }
```

This sets a role override on the dev session. Subsequent method executions use the overridden roles instead of the user's actual assignments. The frontend reloads to show the app from the new perspective.

Clear impersonation:

```
POST /dev/manage/impersonate
Body: { "roles": [] }
```

Scenarios set impersonation automatically — each scenario declares which roles to impersonate after seeding. See [Scenarios](08_scenarios.md).

---

## End-to-End Example

1. **Define roles** in `mindstudio.json`:
   ```json
   { "id": "admin", "name": "Admin" }
   ```

2. **Assign users** in the editor (or via API)

3. **Enforce in a method:**
   ```typescript
   auth.requireRole('admin');
   ```

4. **Conditional render in frontend:**
   ```typescript
   const { isAdmin } = await api.getUserContext();
   {isAdmin && <DeleteButton />}
   ```

5. **Test in dev** via impersonation:
   ```
   POST /dev/manage/impersonate { "roles": ["admin"] }
   ```

6. **Or via a scenario** that seeds data and impersonates automatically
