/**
 * Build-time org context — fetched once at startup and held in memory so the
 * synchronous system-prompt builder can read it.
 *
 * Tells Remy, for the app it's working on, the owning org's name, whether
 * "Sign in with Remy" (delegated auth) is available / required, and whether the
 * org maintains shared brand/design foundations. Best-effort: if the fetch
 * fails or the app has no owning org, the cache stays null and nothing is
 * injected — Remy builds exactly as it did before.
 *
 * The cache holds the full envelope; renderOrgContextBlock surfaces the facts
 * Remy can act on — org name, delegated availability, the delegated-only
 * constraint, and a light pointer that org design foundations exist. How to
 * *act* on the facts lives in the resident auth core (compiled/auth.md); the
 * implementation detail (signInWithRemy() / handleRemyRedirect() wiring, the
 * "Continue with {Org}" label) lives in the `auth` skill; the design system
 * itself goes only to the design expert (designExpert/prompt.ts), never to the
 * main agent.
 */

import { fetchRemyContext, type RemyContext } from './api.js';
import type { ApiConfig } from './config.js';
import { filterModelPicks, setOrgDefaultModels } from './models/surfaces.js';
import { createLogger } from './logger.js';

const log = createLogger('orgContext');

let cached: RemyContext | null = null;

/** Fetch and cache org context. Never throws — startup must not block on it. */
export async function initOrgContext(config: ApiConfig): Promise<void> {
  try {
    cached = await fetchRemyContext(config);
    // Validate + publish org default model picks to the surfaces registry so
    // resolveModel and the picker payloads use them as the live per-surface
    // default. Invalid/unknown entries are dropped; absent ⇒ registry defaults.
    const orgDefaultModels = filterModelPicks(cached?.defaultModels);
    setOrgDefaultModels(orgDefaultModels);
    log.debug('org context loaded', {
      delegatedAvailable: cached?.auth?.delegatedAvailable ?? false,
      requireDelegatedOnly: cached?.auth?.requireDelegatedOnly ?? false,
      hasOrgName: !!cached?.org?.name,
      orgDefaultModels,
    });
  } catch (err: any) {
    cached = null;
    setOrgDefaultModels({});
    log.debug('org context init failed', { error: err.message });
  }
}

/** Current cached context, or null if unavailable. */
export function getOrgContext(): RemyContext | null {
  return cached;
}

/**
 * Render the org-context facts for the system-prompt tail. Auth facts are facts
 * only (interpretation lives in the resident auth core); the design-foundations line is a
 * light pointer — it deliberately does NOT hand the parent the design system
 * itself (the design expert holds and applies that), just enough that the parent
 * won't re-gather foundational visual/branding requirements the design expert
 * already owns. Returns '' when there's nothing actionable to surface.
 */
export function renderOrgContextBlock(): string {
  const ctx = cached;
  const auth = ctx?.auth;
  const hasAuth =
    !!auth && (auth.delegatedAvailable || !!auth.requireDelegatedOnly);
  const hasDesignSystem = !!ctx?.designSystem;
  if (!hasAuth && !hasDesignSystem) {
    return '';
  }
  const lines: string[] = ['<org_context>'];
  if (ctx?.org?.name && ctx?.org?.name !== 'Personal Workspace') {
    lines.push(`This app is owned by the organization "${ctx.org.name}".`);
  }
  if (auth?.delegatedAvailable) {
    lines.push(
      '"Sign in with Remy" (platform-delegated sign-in) is an available auth type for this app: organization members can sign in without a verification code.',
    );
  }
  if (auth?.requireDelegatedOnly) {
    lines.push(
      'This organization requires delegated sign-in: non-delegated human auth methods (email-code, sms-code) are blocked at the platform edge for its apps.',
    );
  }
  if (hasDesignSystem) {
    lines.push(
      "This organization maintains shared brand/design foundations. The design expert has access to these and applies them automatically. You don't need to gather foundational visual style or branding requirements from the user.",
    );
  }
  lines.push('</org_context>');
  return lines.join('\n');
}
