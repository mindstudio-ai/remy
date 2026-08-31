# Analytics

Every app gets a traffic and error dashboard for free, with no setup and no third-party script. The interface SDK reports pageviews, uncaught errors, and unhandled promise rejections automatically, and custom events take one call. A backend method can read the app's own analytics back, so an admin view can show real traffic next to the app's own data.

---

## What's Tracked Automatically

Nothing to install or initialize. The dashboard covers:

- Visits, unique visitors, pageviews
- Top pages, referrers, UTM breakdowns
- Country-level geography
- Device, browser, and OS
- New vs. returning visitors
- Live online count

**Caught errors are yours to handle; uncaught errors are captured for you.** If you `try/catch`, show a toast or render a fallback. Let genuinely unexpected errors bubble — a React error boundary can render a fallback while the SDK reports the error.

**Don't install Sentry, Google Analytics, Plausible, Mixpanel, or anything similar** unless the user specifically asks for it. The platform dashboard already covers observability and analytics.

Disabling telemetry is a per-app dashboard setting, not something you change in code.

---

## Custom Events

```ts
import { analytics } from '@mindstudio-ai/interface';

analytics.track('vendor_submitted', { vendorType: 'restaurant' });
analytics.track('checkout_completed', { itemCount: 3, total: 47.99 });
```

Props must be flat primitives (`string | number | boolean`). Nested objects, arrays, `null`, and `undefined` are stripped.

Server-side caps: event name ≤200 characters, ≤10 props, keys ≤50 characters, values ≤500 characters.

---

## Reading Analytics from the App

Backend methods can query the app's own analytics through the agent SDK's `analytics` namespace — lifetime per-page metrics, live visitor count, traffic sources, and event stats. An in-app admin dashboard can then show real traffic numbers alongside the app's own tables.

Consult `askMindStudioSdk` for the exact call signature before writing one. The query *grammar* below is stable and shared; the method shape is what `askMindStudioSdk` is authoritative on.

### The query grammar

One primitive: metrics × dimensions × filters × time, deliberately shaped like the Plausible/GA4 family. Summary KPIs, timeseries, and every top-N list compose from it rather than being separate endpoints.

**Metrics**: `pageviews`, `visitors`, `visits`, `events`

**Dimensions**:

| Group | Dimensions |
|---|---|
| Page | `path` |
| Source | `referrerHost`, `sourceCategory` |
| Geography | `country`, `city` |
| Technology | `deviceType`, `browser`, `os`, `language` |
| Audience | `visitorType` |
| Campaign | `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent` |
| Events | `eventName` |

Plus the special `time` dimension for timeseries.

**Filters**: `is`, `is_not`, `contains`, each over a non-empty list of values. `is` matches any of them; `is_not` excludes all of them.

**Granularities**: `5m`, `hour`, `day`, `week`, `month`

### Windows and retention

The server routes each query automatically between a rollup table (lifetime history) and the per-event table (exact, higher fidelity), and clamps windows to whichever it used. Callers never need to know the retention rule to get a correct answer.

- Per-event data is retained for **90 days**. Queries inside that window read it.
- Rollups carry history for the life of the app, so "all time" questions keep working.
- `dateRange: "all"` treats granularity as a *minimum* and coarsens automatically, so a saved daily query doesn't start failing as an app's history grows.

Two dimensions have edge cases: `sourceCategory` exists only in the rollup, so a query that would need it on the per-event path is rejected with `unsupported_filter` rather than silently returning nothing. `city` filters take plain city names (matching any country) and always read the per-event table, though grouped city results come back split into `{ city, country }` keys.

### Limits

| Limit | Value |
|---|---|
| Time buckets per query | 1000 (explicit ranges exceeding it are rejected) |
| Rows per grouped result | 1000 |
| Queries per batch | 10 |

A batch runs N independent queries in one round trip, with results in request order. A dashboard page composed of KPIs plus a timeseries plus a few breakdowns is roughly nine reads — one batch instead of a burst of parallel requests competing with each other.

---

## The Operator Surface

Outside the app, the same data is reachable two ways:

- **The app dashboard** — the built-in analytics views.
- **`mindstudio-prod analytics`** — traffic queries from the CLI: lifetime metrics, sources, live counters. Useful when diagnosing a traffic change or checking engagement after a release.

Traffic charts in the dashboard overlay deploy markers, so you can line a traffic change up against the release that caused it. See [Development & Deployment](16_development-and-deployment.md).

---

## Privacy

Analytics is **cookie-banner-free**:

- Per-app scoping — no cross-app or cross-site profile
- IP addresses discarded after geo lookup; geography resolved to country level only
- Query strings server-scrubbed except for a UTM whitelist (`utm_*`, `ref`, `source`, `gclid`, `fbclid`, `msclkid`)
- No fingerprinting
- No third-party scripts

This is why an app using platform analytics does not need a GDPR cookie consent banner for it.

---

## Related

- [Interfaces](07_interfaces.md) — the web interface SDK that reports automatically
- [Methods](05_methods.md) — where analytics reads happen
- [Development & Deployment](16_development-and-deployment.md) — request logs, method metrics, and post-deploy diagnostics
