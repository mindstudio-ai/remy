/**
 * Tool registry for the visual design expert sub-agent.
 */

import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';

import * as searchGoogle from './searchGoogle.js';
import * as fetchUrl from './fetchUrl.js';
import * as analyzeDesign from './analyzeDesign.js';
import * as analyzeImage from './analyzeImage.js';
import * as screenshot from './screenshot.js';
import * as generateImages from './generateImages.js';
import * as editImages from './editImages.js';

const tools = {
  searchGoogle,
  fetchUrl,
  analyzeDesign,
  analyzeImage,
  screenshot,
  generateImages,
  editImages,
} as const;

export const DESIGN_EXPERT_TOOLS: ToolDefinition[] = Object.values(tools).map(
  (t) => t.definition,
);

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
  return tool.execute(input, onLog);
}
