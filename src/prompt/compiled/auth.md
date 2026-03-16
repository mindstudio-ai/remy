# Roles & Auth

MindStudio apps use role-based access control. Roles are defined in the manifest, assigned to users in the editor, and enforced in methods. The backend is the authority — methods enforce access control via `auth.requireRole()`. The frontend can read roles for conditional rendering, but enforcement always happens server-side.

**Roles are optional.** Many apps don't need them — single-user apps, internal tools, simple utilities. If the app doesn't have multiple user types with different permissions, skip roles entirely. Only add them when the app explicitly needs to distinguish who can do what.

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
- `description` — what this role can do (useful for the agent and for users in the role assignment UI)

Roles are synced to the platform on deploy. Adding or removing roles in the manifest creates or deletes them on the next push.

## Backend Auth API

```typescript
import { auth } from '@mindstudio-ai/agent';
```

### `auth.requireRole(...roles)`

Throws a 403 error if the current user doesn't have **any** of the specified roles. Use at the top of methods to gate access.

```typescript
auth.requireRole('admin');                // single role
auth.requireRole('admin', 'approver');    // any of these
```

### `auth.hasRole(...roles)`

Returns `boolean`. Same logic as `requireRole` but doesn't throw. Use for conditional behavior within a method.

### `auth.userId`

The current user's UUID. Always available.

### `auth.roles`

Array of role names assigned to the current user.

### `auth.getUsersByRole(role)`

Returns an array of user IDs that have the specified role. Useful for things like "notify all admins."

## Frontend Auth

```typescript
import { auth } from '@mindstudio-ai/interface';

auth.userId;            // current user's ID
auth.name;              // display name
auth.email;             // email address
auth.profilePictureUrl; // URL or null
```

The frontend SDK provides display-only auth context. Role checking for UI purposes (showing/hiding elements) is done by reading role data from the backend:

```typescript
const { isAdmin, pendingCount } = await api.getDashboard();
{isAdmin && <AdminPanel />}
```

The frontend is untrusted — anyone can modify JavaScript in the browser. Access control must be enforced server-side in methods. The frontend shows or hides UI based on role data from the backend, but the backend is the authority.
