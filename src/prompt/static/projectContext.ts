/**
 * Project-level context — reads from the working directory at runtime.
 *
 * loadProjectRoot feeds the static (cached) part of the system prompt;
 * loadAppIdentity and loadPlanStatus feed the small dynamic tail below its
 * cache breakpoint. Deliberately NOT included anywhere: inventory dumps
 * (full manifest, spec-file listings, directory listings) — the agent
 * discovers structure on demand with readFile/listSpecFiles/glob. The tail
 * sits ahead of the whole conversation in the provider's cache prefix, so
 * anything here must change rarely; inventories churn on every edit and
 * would re-write the full history each time.
 */

import fs from 'node:fs';
import { PROJECT_ROOT } from '../../projectRoot.js';

/**
 * State where the project lives and that every tool already starts there.
 *
 * Without this the agent has to infer the root from the relative paths it
 * sees, and a plausible-looking guess can land in a real directory that
 * isn't the project — a container often has several.
 */
export function loadProjectRoot(): string {
  return `\n## Project Root\n\`${PROJECT_ROOT}\`\n\nFile paths are relative to this directory. Every tool operates here and bash commands run it it.`;
}

/**
 * App identity from the manifest — name and description only, so the agent
 * knows what app it's working on without the full mindstudio.json inlined.
 * These fields change rarely, keeping the state block's hash stable.
 * Returns empty string when the manifest is missing or unparsable.
 */
export function loadAppIdentity(): string {
  try {
    const manifest = JSON.parse(fs.readFileSync('mindstudio.json', 'utf-8'));
    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    if (!name) {
      return '';
    }
    const description =
      typeof manifest.description === 'string'
        ? manifest.description.trim()
        : '';
    return `\n## App\n"${name}"${description ? ` — ${description}` : ''}\n\nFull manifest: \`mindstudio.json\` (read it when you need the app's structure, tables, methods, roles, auth settings, interfaces, and everything else).`;
  } catch {
    return '';
  }
}

/**
 * Load plan status from .remy-plan.md if it exists.
 * Returns a behavioral prompt section based on the plan's frontmatter status.
 *
 * The pending note is onboarding-aware. During `intake` the plan on disk is
 * the *initial* plan, and it is approved out-of-band (the user presses "Start
 * Building", which arrives as an `approveInitialPlan` automated action driving
 * the whole build chain) — NOT by the agent reading a chat "ok" and calling
 * updatePlanStatus itself. Every other phase uses the normal chat-approval
 * flow. Passing the onboarding state lets us give the right instruction instead
 * of one generic note that tells the agent to self-approve during intake too.
 */
export function loadPlanStatus(onboardingState?: string): string {
  try {
    const content = fs.readFileSync('.remy-plan.md', 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    const status = match?.[1]?.match(/^status:\s*(.+)$/m)?.[1]?.trim();

    if (status === 'pending' && onboardingState === 'intake') {
      return `\n<pending_initial_plan>\nThis is your initial plan, proposed via writePlan and awaiting the user's decision. The user approves it by pressing "Start Building" — you'll get an approveInitialPlan message when they do, and it will tell you to begin. Until then, stay in intake: keep discussing, and revise with writePlan if the user asks. Don't start building on your own, even if the user says "looks good" in chat.\n</pending_initial_plan>`;
    }
    if (status === 'pending') {
      return `\n<pending_plan>\nYou have a pending implementation plan in .remy-plan.md awaiting user approval. Do NOT begin implementing the plan until the user approves it. You may continue chatting, answering questions, and revising the plan if asked. To revise, call writePlan again with updated content. When the user approves the plan (via chat or any other signal), call updatePlanStatus with status "approved" before beginning any implementation work.\n</pending_plan>`;
    }
    if (status === 'approved') {
      return `\n<approved_plan>\nThe user has approved your implementation plan in .remy-plan.md. You may reference it during implementation. Delete the file when you have finished all planned work.\n</approved_plan>`;
    }
    return '';
  } catch {
    return '';
  }
}
