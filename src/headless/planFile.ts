/**
 * Plan file (`.remy-plan.md`) side effects triggered by automated action
 * sentinels. Runs before building the system prompt so the injected
 * <pending_plan>/<approved_plan> note reflects the new state.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { hasSentinel } from '../automatedActions/sentinel.js';

const PLAN_FILE = '.remy-plan.md';

/** Apply any `.remy-plan.md` state mutation triggered by an automated action sentinel. */
export function applyPlanFileSideEffect(rawText: string): void {
  if (
    hasSentinel(rawText, 'approvePlan') ||
    hasSentinel(rawText, 'approveInitialPlan')
  ) {
    try {
      const plan = readFileSync(PLAN_FILE, 'utf-8');
      writeFileSync(
        PLAN_FILE,
        plan.replace(/^status:\s*pending/m, 'status: approved'),
        'utf-8',
      );
    } catch {}
  } else if (hasSentinel(rawText, 'rejectPlan')) {
    try {
      unlinkSync(PLAN_FILE);
    } catch {}
  }
}
