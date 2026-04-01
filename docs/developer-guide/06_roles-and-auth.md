# Auth & Roles

MindStudio apps can have and manage their own users. Auth is opt-in: configure it in the manifest, define a user table, and build your own login UI. The platform handles verification codes (email/SMS), cookie-based sessions, and role enforcement.

Apps without auth config use anonymous guest sessions. Auth is optional — only add it when the app needs to identify users or restrict access.

---

## Manifest Config

```json
{
  "auth": {
    "enabled": true,
    "methods": ["email-code", "sms-code"],
    "table": {
      "name": "users",
      "columns": {
        "email": "email",
        "phone": "phone",
        "roles": "roles"
      }
    }
  },
  "roles": [
    { "id": "vendor", "name": "Vendor" },
    { "id": "buyer", "name": "Buyer" },
    { "id": "admin", "name": "Admin" }
  ]
}
```

### Auth Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auth.enabled` | `boolean` | Yes | `true` to enable auth |
| `auth.methods` | `string[]` | Yes | `"email-code"` and/or `"sms-code"`. At least one. |
| `auth.table.name` | `string` | Yes | Name of the `defineTable` table for user records |
| `auth.table.columns.email` | `string` | If email-code | Column name for email (read-only from code) |
| `auth.table.columns.phone` | `string` | If sms-code | Column name for phone (read-only from code) |
| `auth.table.columns.roles` | `string` | No | Column name for roles array (bidirectional sync) |

### Roles

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Kebab-case identifier (used in code: `auth.requireRole('admin')`) |
| `name` | `string` | No | Display name |
| `description` | `string` | No | What this role can do |

---

## Auth Table

The user table is defined with `defineTable` like any other table. The platform manages the auth-mapped columns; everything else is yours.

```typescript
import { db } from '@mindstudio-ai/agent';

export const Users = db.defineTable<{
  // Mapped to auth — platform keeps these in sync
  email: string;
  phone?: string;
  roles: string[];
  // Developer's own fields
  displayName: string;
  companyName?: string;
  plan: 'free' | 'pro';
  avatarUrl?: string;
  onboardedAt?: number;
}>('users');
```

### Platform-Managed Column Behavior

- **`email` / `phone`** — read-only from code. Writing via `push()`, `update()`, or `upsert()` throws a `MindStudioError` ("Cannot write to email — this column is managed by auth. Use the auth API to change a user's email/phone."). The platform syncs these on auth events.
- **`roles`** — read/write from both code and the dashboard. `Users.update(userId, { roles: ['admin'] })` works and the platform syncs the change automatically. Dashboard role changes sync back to the table.
- All other columns are fully the developer's domain. Read, write, query as normal.

---

## Frontend Auth (Interface SDK)

The developer builds their own login/signup UI. The SDK provides methods that handle verification and session management. All auth state changes (verify, logout) update the SDK's internal config immediately — no page refresh needed.

```typescript
import { auth } from '@mindstudio-ai/interface';
```

### User Shape

```typescript
interface AppUser {
  id: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  createdAt: string;
}
```

### State (sync — reads from cached config)

```typescript
auth.getCurrentUser()    // AppUser | null (null = unauthenticated)
auth.isAuthenticated()   // boolean
```

### Email Code Flow

```typescript
const { verificationId } = await auth.sendEmailCode('user@example.com');
// Platform sends a 6-digit code to the email
// User enters the code in your UI
const user = await auth.verifyEmailCode(verificationId, '123456');
// Session is set — auth.getCurrentUser() now returns the AppUser
```

### SMS Code Flow

```typescript
const { verificationId } = await auth.sendSmsCode('+15551234567');
// Phone must be E.164 format
const user = await auth.verifySmsCode(verificationId, '123456');
```

### Email/Phone Changes (must be authenticated)

```typescript
await auth.requestEmailChange('newemail@example.com');   // sends code to NEW email
const user = await auth.confirmEmailChange('newemail@example.com', '123456');

await auth.requestPhoneChange('+15559876543');
const user = await auth.confirmPhoneChange('+15559876543', '123456');
```

### Logout

```typescript
await auth.logout();  // clears cookie and session
```

### Phone Helpers (`auth.phone`)

Helpers for building phone input UIs with country code pickers:

```typescript
auth.phone.countries          // ~180 countries: { code, dialCode, name, flag }
auth.phone.detectCountry()    // guess from timezone, e.g. 'US'
auth.phone.toE164('5551234567', 'US')  // '+15551234567'
auth.phone.format('+15551234567')      // '+1 (555) 123-4567'
auth.phone.isValid('+15551234567')     // true (E.164 format check)
```

### Email Helpers (`auth.email`)

```typescript
auth.email.isValid('user@example.com')  // true (basic format check)
```

---

## Backend Auth (Agent SDK)

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

Returns `boolean`. Same logic as `requireRole` but doesn't throw. Use for conditional behavior.

### `auth.userId`

The current user's ID (the row ID in the auth table). Always available when auth is enabled.

### `auth.roles`

Array of role IDs assigned to the current user.

### `auth.getUsersByRole(role)`

Returns an array of user IDs with the specified role. Useful for "notify all admins."

---

## Login Page Example

```tsx
import { useState } from 'react';
import { auth } from '@mindstudio-ai/interface';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const handleSendCode = async () => {
    const { verificationId } = await auth.sendEmailCode(email);
    setVerificationId(verificationId);
    setCodeSent(true);
  };

  const handleVerify = async () => {
    await auth.verifyEmailCode(verificationId, code);
    window.location.href = '/dashboard';
  };

  if (!codeSent) {
    return (
      <div>
        <h1>Sign in</h1>
        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button onClick={handleSendCode}>Send code</button>
      </div>
    );
  }

  return (
    <div>
      <p>Enter the code we sent to {email}</p>
      <input
        placeholder="123456"
        value={code}
        onChange={e => setCode(e.target.value)}
      />
      <button onClick={handleVerify}>Verify</button>
    </div>
  );
}
```

---

## Backend Method Example

```typescript
import { auth } from '@mindstudio-ai/agent';
import { Users } from './tables/users';

export async function getDashboard() {
  const user = await Users.get(auth.userId);

  if (auth.hasRole('admin')) {
    const allUsers = await Users.toArray();
    return { user, allUsers, isAdmin: true };
  }

  return { user, isAdmin: false };
}

export async function promoteToAdmin(input: { userId: string }) {
  auth.requireRole('admin');
  await Users.update(input.userId, { roles: ['admin'] });
  // SDK detects roles column write and syncs to platform automatically
}
```

---

## Roles

Roles are a platform-managed concept stored on the developer's user table.

- **Declared in manifest** — `roles` array with `id` and `name`
- **Stored as array** — the mapped `roles` column holds `["vendor", "admin"]`
- **Writable from code** — `Users.update(userId, { roles: ['admin'] })` syncs automatically
- **Writable from dashboard** — MindStudio dashboard shows app users and their roles
- **Backend enforcement** — `auth.requireRole('admin')` reads from the platform's role cache

---

## Impersonation (Dev Mode)

During development, impersonate any role to test role-based behavior:

```
POST /dev/manage/impersonate
Body: { "roles": ["ap"] }
```

This sets a role override on the dev session. Subsequent method executions use the overridden roles. Clear impersonation:

```
POST /dev/manage/impersonate
Body: { "roles": [] }
```

Scenarios set impersonation automatically. Each scenario declares which roles to impersonate after seeding. See [Scenarios](08_scenarios.md).

---

## Apps Without Auth

Apps without `auth` in the manifest use anonymous guest sessions. No login, no user identity, no roles. This is the default and works fine for single-user apps, internal tools, and simple utilities.

---

## End-to-End Example

1. **Add auth config** to `mindstudio.json`:
   ```json
   {
     "auth": {
       "enabled": true,
       "methods": ["email-code"],
       "table": { "name": "users", "columns": { "email": "email", "roles": "roles" } }
     },
     "roles": [{ "id": "admin", "name": "Admin" }]
   }
   ```

2. **Define the user table** (`src/tables/users.ts`):
   ```typescript
   export const Users = db.defineTable<{
     email: string;
     roles: string[];
     displayName: string;
   }>('users');
   ```

3. **Build a login page** using `auth.sendEmailCode()` and `auth.verifyEmailCode()`

4. **Enforce roles in methods:**
   ```typescript
   auth.requireRole('admin');
   ```

5. **Conditional render in frontend:**
   ```typescript
   const { isAdmin } = await api.getUserContext();
   {isAdmin && <DeleteButton />}
   ```

6. **Test in dev** via impersonation or scenarios
