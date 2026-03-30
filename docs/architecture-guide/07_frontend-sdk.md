# Frontend SDK (`@mindstudio-ai/interface`)

TypeScript SDK for web interfaces. Provides typed RPC to backend methods, file operations, and read-only auth context. Reads configuration from `window.__MINDSTUDIO__`, a global injected by the platform (in production) or the tunnel proxy (in development).

The SDK is deliberately minimal; it provides the connection between the frontend and the backend contract (methods), and nothing more. The frontend is an interface (a projection of the contract into a modality), and the SDK is what makes that projection work.

Source: `/Users/sean/Dropbox/Projects/youai/mindstudio-interface/src/`

---

## `window.__MINDSTUDIO__`

The bootstrap global that configures the SDK. Injected into HTML by:
- The tunnel proxy (in development) — before `</head>`
- The static CDN hosting (in production) — same injection point

```typescript
interface MindStudioConfig {
  token: string;           // ms_iface_ session token
  releaseId: string;       // current release ID
  appId?: string;          // app UUID (optional — not needed for API calls)
  apiBaseUrl?: string;     // optional — SDK uses same-origin /_/ paths
  user: {
    id: string;
    name: string;
    email: string | null;
    profilePictureUrl: string | null;
  };
  methods: Record<string, string>;  // { exportName: methodId }
}
```

The `methods` map is embedded at page load from the release manifest. This is how the SDK maps `api.submitVendor(...)` to `POST /_/methods/{methodId}/invoke`. The method ID is resolved at build time, not at call time.

**Why a global instead of a constructor:** Zero configuration for the developer. The frontend code just imports the SDK and calls methods. The platform handles injection in both dev and production. The same code works everywhere without environment-specific setup.

---

## `createClient<T>()`

Typed RPC client for backend methods:

```typescript
import { createClient } from '@mindstudio-ai/interface';

interface AppMethods {
  submitVendor(input: { name: string }): Promise<{ vendorId: string }>;
  listVendors(): Promise<{ vendors: Vendor[] }>;
}

const api = createClient<AppMethods>();
const result = await api.submitVendor({ name: 'Acme' });
```

The generic parameter `T` maps method names to their input/output types. Without generics, all methods accept `any` and return `Promise<any>`.

### How It Works

The client is a Proxy. When you call `api.submitVendor(input)`:

1. Look up `submitVendor` in `config.methods` → get method UUID
2. `POST /_/methods/{methodId}/invoke`
3. Headers: `Authorization: Bearer {token}`
4. Body: `{ input }`
5. Return `response.output`

### Streaming

```typescript
const result = await api.generateReport(
  { month: 'march' },
  {
    stream: true,
    onToken: (text) => {
      // `text` is the ACCUMULATED response (replace, don't append)
      setPreview(text);
    },
    onStreamError: (error) => {
      console.warn('Stream error:', error);
    },
  },
);
// `result` is the final method output (after stream completes)
```

Uses SSE under the hood. Events: `{ type: 'token', text }`, `{ type: 'error', error }`, `{ type: 'done', output }`.

### Error Handling

```typescript
import { MindStudioInterfaceError } from '@mindstudio-ai/interface';

try {
  await api.submitVendor({ name: '' });
} catch (err) {
  if (err instanceof MindStudioInterfaceError) {
    err.message;  // user-facing text
    err.code;     // 'method_not_found', 'stream_incomplete', etc.
    err.status;   // HTTP status (optional)
  }
}
```

---

## `platform`

### `platform.uploadFile(file, options?)`

Upload a file to the MindStudio CDN. Returns a public CDN URL.

```typescript
import { platform } from '@mindstudio-ai/interface';

// Simple upload
const url = await platform.uploadFile(file);

// With progress tracking
const url = await platform.uploadFile(file, {
  onProgress: (fraction) => setProgress(fraction), // 0 to 1
});

// With abort support
const controller = new AbortController();
const url = await platform.uploadFile(file, {
  signal: controller.signal,
  onProgress: (f) => setProgress(f),
});
controller.abort(); // cancels both presign and upload
```

Uses a presigned S3 upload. When `onProgress` is provided, uses XHR for the upload step (only way to get upload progress in browsers). Without it, uses fetch. `signal` is wired through to both the presign call and the upload. Throws `AbortError` on cancellation.

---

## `auth`

Read-only user identity:

```typescript
import { auth } from '@mindstudio-ai/interface';

auth.userId;            // current user's ID
auth.name;              // display name
auth.email;             // email address
auth.profilePictureUrl; // URL or null
```

All properties are synchronous, read from `window.__MINDSTUDIO__.user` via a lazy Proxy.

**Display only.** Role checking is a backend concern. The frontend can read roles for UI purposes (showing/hiding elements), but enforcement happens in methods via `auth.requireRole()`. This is intentional: the frontend is untrusted, so access control must be enforced server-side.

---

## Design Rationale

**Why typed RPC over REST:** `api.submitVendor(input)` gives type safety end-to-end. The developer writes a method with typed input/output in the backend, and the frontend gets matching types via the generic parameter. The platform handles routing, auth, and billing. The alternative (hand-rolled fetch calls with manual URL construction and type casting) is error-prone and tedious.

**Why display-only auth on the frontend:** The frontend is an interface, a projection of the contract. It shows things based on who the user is (conditional rendering by role), but it doesn't enforce access control. That's the backend's job. Keeping auth display-only on the frontend eliminates a category of security bugs where frontend-only checks are the sole barrier.

**Why `onToken` receives accumulated text:** Different from most SSE patterns where you get individual chunks. The accumulated approach means the consumer can just `setText(token)` without managing a buffer. Simpler for the common case (showing a preview of AI-generated content).
