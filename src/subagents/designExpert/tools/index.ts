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
import * as screenshot from './screenshot.js';
import * as generateImages from './images/generateImages.js';
import * as editImages from './images/editImages.js';

const tools = {
  searchGoogle,
  scrapeWebUrl,
  analyzeDesign,
  analyzeImage,
  screenshot,
  generateImages,
  editImages,
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
