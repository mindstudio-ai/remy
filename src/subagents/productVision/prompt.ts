/**
 * System prompt assembly for the product vision sub-agent.
 *
 * Loads the base prompt from prompt.md and injects the current spec
 * files and roadmap state as XML context.
 */

import { readAsset } from '../../assets.js';
import { loadSpecIndex, loadRoadmapIndex } from './executor.js';
import { loadPlatformBrief } from '../common/context.js';

const BASE_PROMPT = readAsset('subagents/productVision', 'prompt.md');

/** Build the system prompt with lightweight spec/roadmap indexes. */
export function getProductVisionPrompt(): string {
  const specIndex = loadSpecIndex();
  const roadmapIndex = loadRoadmapIndex();

  const parts = [BASE_PROMPT, loadPlatformBrief()];
  parts.push('<!-- cache_breakpoint -->');
  if (specIndex) {
    parts.push(specIndex);
  }
  if (roadmapIndex) {
    parts.push(roadmapIndex);
  }

  return parts.join('\n\n');
}
