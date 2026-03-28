/**
 * System prompt assembly for the product vision sub-agent.
 *
 * Loads the base prompt from prompt.md and injects the current spec
 * files and roadmap state as XML context.
 */

import { readAsset } from '../../assets.js';
import { loadSpecContext, loadRoadmapContext } from './executor.js';
import { loadPlatformBrief } from '../common/context.js';

const BASE_PROMPT = readAsset('subagents/productVision', 'prompt.md');

/** Build the system prompt with current spec and roadmap context. */
export function getProductVisionPrompt(): string {
  const specContext = loadSpecContext();
  const roadmapContext = loadRoadmapContext();

  const parts = [BASE_PROMPT, loadPlatformBrief()];
  parts.push('<!-- cache_breakpoint -->');
  if (specContext) {
    parts.push(specContext);
  }
  if (roadmapContext) {
    parts.push(roadmapContext);
  }

  return parts.join('\n\n');
}
