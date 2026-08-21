/**
 * Tool registry for the visual design expert sub-agent.
 */

import type { ToolDefinition } from '../../../api.js';
import {
  type ToolExecutionContext,
  deriveContext,
} from '../../../tools/index.js';
import { COMMON_READ_TOOLS } from '../../common/tools.js';

import * as searchGoogle from './searchGoogle.js';
import * as scrapeWebUrl from './scrapeWebUrl.js';
import * as analyzeDesign from './analyzeDesign.js';
import * as analyzeImage from './analyzeImage.js';
import * as generateImages from './images/generateImages.js';
import * as editImages from './images/editImages.js';
import * as renderImage from './images/renderImage.js';
import * as polishCopy from './polishCopy.js';
import * as loadSkill from './loadSkill.js';
import {
  screenshotDefinition,
  executeScreenshot,
} from '../../../tools/code/screenshot.js';

const tools = {
  searchGoogle,
  scrapeWebUrl,
  analyzeDesign,
  analyzeImage,
  // Same tool the main agent offers, imported rather than reimplemented — the
  // two used to be near-identical copies and had already drifted apart. Its core
  // already takes (input, onLog, context), which is this registry's convention.
  screenshot: { definition: screenshotDefinition, execute: executeScreenshot },
  generateImages,
  editImages,
  renderImage,
  polishCopy,
  loadSkill,
} as const;

export const DESIGN_EXPERT_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
  ...Object.values(tools).map((t) => t.definition),
];

export async function executeDesignExpertTool(
  name: string,
  input: Record<string, any>,
  context?: ToolExecutionContext,
  toolCallId?: string,
  onLog?: (line: string) => void,
): Promise<string> {
  const tool = tools[name as keyof typeof tools];
  if (!tool) {
    return `Error: unknown tool "${name}"`;
  }
  const childContext =
    context && toolCallId ? deriveContext(context, toolCallId) : context;
  return tool.execute(input, onLog, childContext);
}
