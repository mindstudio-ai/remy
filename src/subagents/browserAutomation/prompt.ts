/**
 * System prompt for the browser automation sub-agent.
 * Loads prompt.md and injects a lightweight spec index for context.
 */

import { readAsset } from '../../assets.js';
import { loadSpecIndex } from '../common/context.js';

const BASE_PROMPT = readAsset('subagents/browserAutomation', 'prompt.md');

/** Build the browser automation prompt with app context. */
export function getBrowserAutomationPrompt(): string {
  // Inject a lightweight spec index (frontmatter only) so the test agent knows
  // what the app is about — NOT the full app.md. Inlining the whole spec scaled
  // with app size: on a large app (hundreds of methods) it produced a ~160k-token
  // system prompt that made the model return an empty completion, so the QA agent
  // silently did nothing ("browser automation is down"). The QA agent verifies
  // against the live app through the browser, so the index is enough. Mirrors
  // productVision / designExpert, which already use this lightweight index.
  try {
    const specIndex = loadSpecIndex();
    const parts = [BASE_PROMPT, '<!-- cache_breakpoint -->'];
    if (specIndex) {
      parts.push(specIndex);
    }
    return parts.join('\n\n');
  } catch {
    return BASE_PROMPT;
  }
}
