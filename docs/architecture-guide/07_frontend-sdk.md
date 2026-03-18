# Frontend SDK (`@mindstudio-ai/interface`)

TypeScript SDK for web interfaces. Provides typed RPC to backend methods, file operations, and read-only auth context. Reads configuration from `window.__MINDSTUDIO__`, a global injected by the platform (in production) or the tunnel proxy (in development).

The SDK is deliberately minimal — it provides the connection between the frontend and the backend contract (methods), and nothing more. The frontend is an interface (a projection of the contract into a modality), and the SDK is what makes that projection work.

Source: `/Users/sean/Dropbox/Projects/youai/mindstudio-interface/src/`

---

## `window.__MINDSTUDIO__`

The bootstrap global that configures the SDK. Injected into HTML by:
- The tunnel proxy (in development) — before `</head>`
- The static CDN hosting (in production) — same injection point

```typescript
interface MindStudioConfig {
  token: string;           // ms_iface_ session token
  appId: string;           // app UUID
  releaseId: string;       // current release ID
  apiBaseUrl: string;      // e.g., "https://api.mindstudio.ai"
  user: {
    id: string;
    name: string;
    email: string | null;
    profilePictureUrl: string | null;
  };
  methods: Record<string, string>;  // { exportName: methodId }
}
```

The `methods` map is embedded at page load from the release manifest. This is how the SDK maps `api.submitVendor(...)` to `POST /methods/{methodId}/invoke` — the method ID is resolved at build time, not at call time.

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
2. `POST {apiBaseUrl}/_internal/v2/apps/{appId}/methods/{methodId}/invoke`
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

File operations:

### `platform.requestFile(options?)`

Opens the MindStudio asset library / file picker:

```typescript
import { platform } from '@mindstudio-ai/interface';

const { url } = await platform.requestFile({ type: 'image' });
```

Uses a postMessage callback pattern — the SDK posts a request to the parent frame, the parent opens a modal, the user picks a file, and the result comes back via postMessage.

Options: `{ type?: 'image' | 'video' | 'audio' | 'document' }`

Throws `file_picker_cancelled` if the user cancels.

### `platform.uploadFile(file)`

Direct file upload:

```typescript
const url = await platform.uploadFile(fileInput.files[0]);
```

`POST {apiBaseUrl}/_internal/v2/apps/{appId}/upload` with FormData. Returns a CDN URL.

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

All properties are synchronous — read from `window.__MINDSTUDIO__.user` via a lazy Proxy.

**Display only.** Role checking is a backend concern — the frontend can read roles for UI purposes (showing/hiding elements), but enforcement happens in methods via `auth.requireRole()`. This is intentional: the frontend is untrusted, so access control must be enforced server-side.

---

## Design Rationale

**Why typed RPC over REST:** `api.submitVendor(input)` gives type safety end-to-end. The developer writes a method with typed input/output in the backend, and the frontend gets matching types via the generic parameter. The platform handles routing, auth, and billing. The alternative — hand-rolled fetch calls with manual URL construction and type casting — is error-prone and tedious.

**Why display-only auth on the frontend:** The frontend is an interface — a projection of the contract. It shows things based on who the user is (conditional rendering by role), but it doesn't enforce access control. That's the backend's job. Keeping auth display-only on the frontend eliminates a category of security bugs where frontend-only checks are the sole barrier.

**Why `onToken` receives accumulated text:** Different from most SSE patterns where you get individual chunks. The accumulated approach means the consumer can just `setText(token)` without managing a buffer. Simpler for the common case (showing a preview of AI-generated content).
