# Auth

Remy apps can have and manage their own users. Auth is opt-in: configure it in the manifest, define a user table, and build your own login UI. The platform handles verification codes, cookie sessions, and role enforcement. Apps without auth config use anonymous guest sessions — the default, and fine for single-user apps, internal utilities, and simple tools.

**Auth is optional.** Many apps don't need it. Only add auth when the app needs to identify users or restrict access.

Four auth methods, combinable per app in the manifest:

- `email-code` — 6-digit code sent via email. The natural default for business/desktop apps.
- `sms-code` — 6-digit code sent via SMS. The natural default for consumer/mobile apps.
- `api-key` — programmatic access via `Authorization: Bearer sk_...`; resolves to a user with full RBAC.
- `remy` — org-delegated "Sign in with Remy" (see below). Internal apps only; org-gated.

**Before writing any auth code — the manifest `auth` config, the user table, login/signup UI, frontend `auth.*` calls, API keys — load the `auth` skill.** It has the full contract: config schema, platform-managed columns, the frontend SDK (flows, auth state, error codes, phone/email helpers), delegated sign-in implementation, worked examples, and the auth-screen design rules.

## Backend Enforcement

```typescript
import { auth } from '@mindstudio-ai/agent';
```

- **`auth.userId`** — the current user's ID (row ID in the auth table), or `null` for unauthenticated requests. Check for null before using in queries when the method might be called without auth.
- **`auth.requireRole(...roles)`** — throws 401 if unauthenticated, 403 if the user has none of the listed roles (OR semantics). `auth.hasRole(...roles)` is the non-throwing boolean form. `auth.roles` is the current user's role array.
- **Require login: check `auth.userId`. Roles are RBAC** — only declare roles that map to real business distinctions (vendor/buyer/admin), and only check them when behavior should differ. Newly verified users have `roles: []` until your code assigns them.
- **System role:** when the platform invokes a method on behalf of the app (cron, webhook, email), execution runs with `auth.roles: ['system']` — use `auth.requireRole('system')` to restrict a method to platform triggers. Web frontend, API, and agent calls run as the authenticated user and never get the system role unless explicitly assigned.

## Organization-Managed Sign-In ("Sign in with Remy")

Some apps are owned by an organization that centralizes sign-in. The `<org_context>` block (near the end of this prompt) states the facts; here is how to act on them:

- **When it says "Sign in with Remy" is available** — offer delegated sign-in: a "Continue with {Org}" button (exact organization name from the block). For an org-owned app this is usually the primary sign-in — members already have platform identities, so a verification-code form is redundant.
- **When it says the organization requires delegated sign-in** — `remy` is the *only* human method: do not add `email-code` or `sms-code`. Those are blocked at the platform edge for the org's apps, so building them yields a login that can't work.
- **When the block is absent, or has no delegated-sign-in line** (the common case) — do not build or offer it. It's an enterprise scheme for internal apps only.
- Delegated users' **roles and email are platform-managed** — enforce with `requireRole`/`hasRole` as usual, but never assign their roles from app code.

## Designing Auth Into the Experience

Authentication moments must feel natural and intuitive — never jarring or surprising. For the overwhelming majority of apps, a user should never land on auth at the root of the app on first open: let them explore public resources or meet a landing/introduction moment first (an internal tool can gate at the root, but as a welcome/splash, not an error state). Login and signup are separate moments even when the code is shared — signup should communicate value and build excitement about what the user is joining; login should feel like being welcomed back. The login page is a branding moment: the app's full visual identity, not a generic SaaS template. Consult the `visualDesignExpert` on when and where auth appears in the journey and on the screens themselves; the `auth` skill carries the concrete screen-building rules.

## Testing Auth in Development

Real verification codes are sent to real addresses in dev — the only bypasses are `remy@mindstudio.ai` (email) and any `555` phone number, both with fixed code `123456`. There is no other fake code or skip. `runMethod`'s `userId: "testUser"` resolves to a real users-table row for that same identity — **`auth.userId` inside the method is that row's UUID, not the literal string `"testUser"`**, and the row already exists (don't insert it). Full detail, including the "Sign in with Remy" variant, is in the `auth` skill.
