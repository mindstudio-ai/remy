# Auth

MindStudio apps can have and manage their own users. Auth is opt-in: configure it in the manifest, define a user table, and build your own login UI. The platform handles verification codes, cookies, and session management. Apps without auth config use anonymous guest sessions (current default behavior).

**Auth is optional.** Many apps don't need it. Only add auth when the app needs to identify users or restrict access.

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

- **`auth.enabled`** — opt-in. No auth config = anonymous guest sessions.
- **`auth.methods`** — which verification methods the app supports. At least one required.
  - `email-code` — 6-digit code sent via email
  - `sms-code` — 6-digit code sent via SMS
- **`auth.table.name`** — name of the `defineTable` table that holds user records.
- **`auth.table.columns`** — maps platform-managed fields to column names in the developer's table.
  - `email` — required if `email-code` is in methods
  - `phone` — required if `sms-code` is in methods
  - `roles` — optional. Maps to a JSON array column for role assignments.
- **`roles`** — declares valid roles for the app. Same as before: `id`, `name`, optional `description`.

## Auth Table

The user table is a regular `defineTable` table. The platform manages the auth-mapped columns; all other columns are the developer's domain.

```typescript
import { db } from '@mindstudio-ai/agent';

export const Users = db.defineTable<{
  // Mapped to auth — platform keeps these in sync
  email: string;
  phone?: string;
  roles: string[];
  // Developer's own fields
  displayName: string;
  plan: 'free' | 'pro';
  avatarUrl?: string;
}>('users');
```

### Platform-Managed Column Behavior

- **`email` / `phone`** — read-only from code. Writing via `update()` or `push()` throws a `MindStudioError`. Use the auth API to change a user's email or phone.
- **`roles`** — read/write from both code and the dashboard. `Users.update(userId, { roles: ['admin'] })` works and syncs to the platform. Dashboard role changes sync back to the table.
- All other columns are fully the developer's.

## Frontend Auth (Interface SDK)

The developer builds their own login/signup UI. The SDK provides methods that handle the verification flow and session management.

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

`auth.getCurrentUser()` returns `AppUser | null`. `null` means unauthenticated.

### State (sync)

```typescript
auth.getCurrentUser()    // AppUser | null
auth.isAuthenticated()   // boolean
```

### Email Code Flow

```typescript
const { verificationId } = await auth.sendEmailCode('user@example.com');
// User enters the 6-digit code from their email
const user = await auth.verifyEmailCode(verificationId, '123456');
// user is now authenticated — auth.getCurrentUser() returns the AppUser
```

### SMS Code Flow

```typescript
const { verificationId } = await auth.sendSmsCode('+15551234567');
const user = await auth.verifySmsCode(verificationId, '123456');
```

### Email/Phone Changes (must be authenticated)

```typescript
await auth.requestEmailChange('newemail@example.com');
const user = await auth.confirmEmailChange('newemail@example.com', '123456');

await auth.requestPhoneChange('+15559876543');
const user = await auth.confirmPhoneChange('+15559876543', '123456');
```

### Logout

```typescript
await auth.logout();  // clears session
```

### Phone Helpers

```typescript
auth.phone.countries          // ~180 countries with { code, dialCode, name, flag }
                              // Key selects by country code (US, CA, BB), not dial code — multiple countries share +1
auth.phone.detectCountry()    // guess from timezone, e.g. 'US'
auth.phone.toE164('5551234567', 'US')  // '+15551234567'
auth.phone.format('+15551234567')      // '+1 (555) 123-4567'
auth.phone.isValid('+15551234567')     // true
```

### Email Helpers

```typescript
auth.email.isValid('user@example.com')  // true
```

## Backend Auth (Agent SDK)

```typescript
import { auth } from '@mindstudio-ai/agent';
```

### `auth.requireRole(...roles)`

Throws 401 (unauthenticated) if there is no current user. Throws 403 (forbidden) if the current user doesn't have **any** of the specified roles.

```typescript
auth.requireRole('admin');
auth.requireRole('admin', 'approver');  // any of these
```

### `auth.hasRole(...roles)`

Returns `boolean`. Same logic as `requireRole` but doesn't throw.

### `auth.userId`

The current user's ID (the row ID in the auth table), or `null` for unauthenticated requests. Check for null before using in database queries when the method might be called without auth.

### `auth.roles`

Array of role IDs assigned to the current user.

### `auth.getUsersByRole(role)`

Returns an array of user IDs with the specified role.

## Login Page Example

```tsx
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
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button onClick={handleSendCode}>Send code</button>
      </div>
    );
  }

  return (
    <div>
      <p>Enter the code we sent to {email}</p>
      <input placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
      <button onClick={handleVerify}>Verify</button>
    </div>
  );
}
```

## Backend Method Example

```typescript
import { auth } from '@mindstudio-ai/agent';
import { Users } from './tables/users';

export async function getDashboard() {
  const user = auth.userId ? await Users.get(auth.userId) : null;

  if (auth.hasRole('admin')) {
    const allUsers = await Users.toArray();
    return { user, allUsers, isAdmin: true };
  }

  return { user, isAdmin: false };
}

export async function promoteToAdmin(input: { userId: string }) {
  auth.requireRole('admin');
  await Users.update(input.userId, { roles: ['admin'] });
}
```

## Roles

Roles are declared in the manifest, stored as an array column on the user table, and enforced in backend methods. The platform manages role data across the user table and the dashboard.

- Declare roles in `mindstudio.json` with `id` and `name`
- The mapped `roles` column holds a JSON array of role ID strings: `["vendor", "admin"]`
- Writable from code: `Users.update(userId, { roles: ['admin'] })` — platform syncs automatically
- Writable from dashboard: MindStudio dashboard shows app users and their roles
- Backend enforcement: `auth.requireRole('admin')` works as before

## Apps Without Auth

Apps without `auth` in the manifest use anonymous guest sessions. No login, no user identity, no roles. This is the default and works fine for single-user apps, internal tools, and simple utilities.
