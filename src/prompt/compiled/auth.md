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
        "roles": "roles",
        "apiKey": "apiKey"
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
  - `api-key` — programmatic access via `Authorization: Bearer sk_...` header. Resolves to a user with full RBAC.
- **`auth.table.name`** — name of the `defineTable` table that holds user records.
- **`auth.table.columns`** — maps platform-managed fields to column names in the developer's table.
  - `email` — required if `email-code` is in methods
  - `phone` — required if `sms-code` is in methods
  - `roles` — optional. Maps to a JSON array column for role assignments.
  - `apiKey` — optional. Required if `api-key` is in methods. Platform stores masked value (`sk_...xxxx`) for display; one key per user.
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
  apiKey?: string;       // masked value (sk_...xxxx), read-only from code
  // Developer's own fields
  displayName: string;
  plan: 'free' | 'pro';
  avatarUrl?: string;
}>('users');
```

### Platform-Managed Column Behavior

- **`email` / `phone` / `apiKey`** — read-only from code. Writing via `update()` or `push()` throws a `MindStudioError`. Use the auth API to change a user's email or phone, and `auth.createApiKey()` / `auth.revokeApiKey()` for API keys.
- **`roles`** — read/write from both code and the dashboard. `Users.update(userId, { roles: ['admin'] })` works and syncs to the platform. Dashboard role changes sync back to the table.
- All other columns are fully the developer's. When auth creates a user row, only the managed columns (email/phone, roles) are populated. All user-defined columns start as null until the user completes onboarding — type them as optional and guard against null.

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
  apiKey: string | null;    // masked value (sk_...xxxx), null if no key
  createdAt: string;
}
```

`auth.getCurrentUser()` returns `AppUser | null`. `null` means unauthenticated.

### State

```typescript
auth.getCurrentUser()         // AppUser | null
auth.currentUser              // AppUser | null (sync getter, same as getCurrentUser())
auth.isAuthenticated()        // boolean
auth.onAuthStateChanged(cb)   // fires immediately with current user, then on every
                              // auth transition (verify, confirm, logout).
                              // Returns an unsubscribe function.
```

Use `onAuthStateChanged` in React instead of reading `currentUser` once at render time:

```typescript
function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  useEffect(() => auth.onAuthStateChanged(setUser), []);
  return user;
}
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

### API Keys

For apps with `api-key` in their auth methods. API keys resolve to a user with the same `auth.userId`, `auth.roles`, and `requireRole()` enforcement as a cookie session.

```typescript
// Generate a key for the current user (must be logged in)
const { key } = await auth.createApiKey();
// key = "sk_..." — show once, not stored. user.apiKey updates to masked value.

// Revoke current user's key
await auth.revokeApiKey();
// user.apiKey becomes null
```

Both methods fire `onAuthStateChanged` since they modify the user object. One key per user — creating a new key replaces the old one.

Consumers use the key as a Bearer token: `Authorization: Bearer sk_...`. The platform resolves it to the user, populates the auth context, and executes the method normally. Invalid or revoked key: 401.

### Error Codes

All auth methods throw on failure with a `code` property:

| Code | HTTP | Meaning |
|------|------|---------|
| `rate_limited` | 429 | Too many requests |
| `invalid_code` | 400 | Wrong verification code |
| `verification_expired` | 400 | Code has expired |
| `max_attempts_exceeded` | 400 | Too many failed attempts |
| `not_authenticated` | 401 | No active session |
| `invalid_session` | 401 | Session expired or invalid |
| `not_supported` | 400 | Feature not enabled for this app (e.g. API keys without `api-key` in methods) |

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

### System Role (Platform Triggers)

When the platform invokes a method on behalf of the app (cron, webhook, email, Discord, Telegram), the execution runs as a system user with `auth.roles: ['system']`. Use `auth.requireRole('system')` to restrict methods to platform triggers only:

```typescript
export async function regenerateCache(input: {}) {
  auth.requireRole('system');
  // Only cron, webhooks, and users with 'system' role can reach this
}
```

Web frontend calls (`/_/methods`), API interface calls (`/_/api`), and agent chat all run as the authenticated user — they don't get the system role unless the user has been explicitly assigned it. You can assign `system` to app users via the dashboard or SDK if they need to manually trigger these methods.

## Login Page Example

```tsx
import { useState, useEffect } from 'react';
import { auth } from '@mindstudio-ai/interface';
import { useLocation } from 'wouter';

function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  useEffect(() => auth.onAuthStateChanged(setUser), []);
  return user;
}

function LoginPage() {
  const user = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [error, setError] = useState('');

  // Redirect when authenticated (fires via onAuthStateChanged after verify)
  useEffect(() => { if (user) navigate('/dashboard'); }, [user]);

  const handleSendCode = async () => {
    try {
      const { verificationId } = await auth.sendEmailCode(email);
      setVerificationId(verificationId);
      setError('');
    } catch (err: any) {
      setError(err.code === 'rate_limited' ? 'Too many attempts. Try again later.' : err.message);
    }
  };

  const handleVerify = async () => {
    try {
      await auth.verifyEmailCode(verificationId, code);
      // onAuthStateChanged fires, useAuth updates, redirect happens
    } catch (err: any) {
      if (err.code === 'invalid_code') setError('Wrong code. Try again.');
      else if (err.code === 'verification_expired') setError('Code expired. Request a new one.');
      else if (err.code === 'max_attempts_exceeded') setError('Too many attempts. Request a new code.');
      else setError(err.message);
    }
  };

  if (!verificationId) {
    return (
      <div>
        <h1>Sign in</h1>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button onClick={handleSendCode}>Send code</button>
        {error && <p>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p>Enter the code we sent to {email}</p>
      <input placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
      <button onClick={handleVerify}>Verify</button>
      <button onClick={() => setVerificationId('')}>Resend</button>
      {error && <p>{error}</p>}
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

## Designing Auth in Web Interfaces
The most imporant user experience consideration with auth is that authentication moments must feel natural and intuitive - they should not feel jarring or surprising. Take care to integrate them into the entire experience when building.

For the overwhelming majority of apps, a user should never land on auth at the root of an app when opening it for the first time (except in cases where the app is, e.g., an internal tool or some other protected experience - and even then it should feel more like a welcome/splash screen than an error state). Users should be able to explore public resources, or at least encounter some kind of landing/introduction moment, before they get hit with a signup/login screen. Make auth feel like a natural moment in the user's journey.

Login and signup screens set the tone for the user's entire experience with the app and are important to get right - they should feel like exciting entry points into the next level of the user journy. A janky login form with misaligned inputs and no feedback dminishes excitement and undermines trust before the user even gets in.

Consult the `visualDesignExpert` to help you work through authentication at a high level, including when and where to show auth, and the design of specific screens.

### Rules for Building Auth Screens
**Auth modes:** Think about which mode(s) makes the most sense for the type of app you are building. Consumer apps likely to be used on mobile should probably tend toward SMS auth as the default - business apps used on desktop make more sense to use email verification - or allow both, there's no harm in giving the user choice!

**Verification code input:** The 6-digit code entry is the critical moment. Prefer to design it as individual digit boxes (not a single text input), with auto-advance between digits, a beautiful animation and auto-submit on paste, and clear visual feedback. The boxes should be large enough to tap easily on mobile. Show a subtle animation on successful verification. Error states should be inline and immediate, not a separate alert. Make sure there is no layout shift when loading in the success/error states - loading spinners must never pop in below the input and shift the content, for example.

**The send/resend flow:** After the user enters their email or phone and taps "Send code," show clear confirmation that the code was sent ("Check your email" with the address displayed). Include a resend option with a cooldown timer (e.g., "Resend in 30s"). The transition from "enter email/phone" to "enter code" should feel smooth, not like a page reload. Always make sure the user can cancel and exit the flow (e.g., they had a typo in their email, or remembered they used a different email to sign up).

**The overall login page:** This is a branding moment. Use the app's full visual identity — colors, typography, any logos, hero imagery, or illustration. A centered card on a branded background is a classic pattern. Don't make it look like a generic SaaS login template. The login page must feel like it belongs to this specific app. Consult the `visualDesignExpert` for guidance on how to really make this shine.

**Post-login transition:** After successful verification, the transition into the app should feel seamless and instant. Avoid a blank loading screen — if data needs to load, show the app shell with skeleton states. Always make sure the user has a way of logging out.
