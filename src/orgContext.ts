/**
 * Build-time org context — fetched once at startup and held in memory so the
 * synchronous system-prompt builder can read it.
 *
 * Tells Remy, for the app it's working on, the owning org's name and whether
 * "Sign in with Remy" (delegated auth) is available / required for that org.
 * Best-effort: if the fetch fails or the app has no owning org, the cache stays
 * null and nothing is injected — Remy builds exactly as it did before.
 *
 * The cache holds the full envelope; renderOrgContextBlock surfaces the facts
 * Remy can act on — org name, delegated availability, and the delegated-only
 * constraint. The "how" (signInWithRemy() / handleRemyRedirect() wiring, the
 * "Continue with {Org}" label) lives in the auth docs, not here.
 */

import { fetchRemyContext, type RemyContext } from './api.js';
import type { ApiConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('orgContext');

let cached: RemyContext | null = null;

/** Fetch and cache org context. Never throws — startup must not block on it. */
export async function initOrgContext(config: ApiConfig): Promise<void> {
  try {
    cached = await fetchRemyContext(config);
    log.debug('org context loaded', {
      delegatedAvailable: cached?.auth?.delegatedAvailable ?? false,
      requireDelegatedOnly: cached?.auth?.requireDelegatedOnly ?? false,
      hasOrgName: !!cached?.org?.name,
    });
  } catch (err: any) {
    cached = null;
    log.debug('org context init failed', { error: err.message });
  }
}

/** Current cached context, or null if unavailable. */
export function getOrgContext(): RemyContext | null {
  return cached;
}

/**
 * Render the org-auth facts for the system-prompt tail. Facts only — no
 * instructions (interpretation lives in the auth docs). Returns '' when there's
 * no context, or nothing actionable to surface yet.
 */
export function renderOrgContextBlock(): string {
  const ctx = cached;
  const auth = ctx?.auth;
  if (!auth || (!auth.delegatedAvailable && !auth.requireDelegatedOnly)) {
    return '';
  }
  const lines: string[] = ['<org_auth_context>'];
  if (ctx?.org?.name && ctx?.org?.name !== 'Personal Workspace') {
    lines.push(`This app is owned by the organization "${ctx.org.name}".`);
  }
  if (auth.delegatedAvailable) {
    lines.push(
      '"Sign in with Remy" (platform-delegated sign-in) is an available auth type for this app: organization members can sign in without a verification code.',
    );
  }
  if (auth.requireDelegatedOnly) {
    lines.push(
      'This organization requires delegated sign-in: non-delegated human auth methods (email-code, sms-code) are blocked at the platform edge for its apps.',
    );
  }
  lines.push('</org_auth_context>');
  return lines.join('\n');
}
