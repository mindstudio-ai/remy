/**
 * Tool registry for the visual design expert sub-agent.
 */

import type { ToolDefinition } from '../../../api.js';
import {
  type ToolExecutionContext,
  deriveContext,
} from '../../../tools/index.js';
import { COMMON_READ_TOOLS } from '../../common/tools.js';
import { runResearch } from '../../research/index.js';

import * as scrapeWebUrl from './scrapeWebUrl.js';
import * as analyzeDesign from './analyzeDesign.js';
import * as analyzeImage from './analyzeImage.js';
import * as generateImages from './images/generateImages.js';
import * as editImages from './images/editImages.js';
import * as renderImage from './images/renderImage.js';
import * as polishCopy from './polishCopy.js';
import * as loadSkill from './loadSkill.js';
import * as createWireframe from './createWireframe.js';
import {
  screenshotDefinition,
  executeScreenshot,
} from '../../../tools/code/screenshot.js';

// The researcher, offered as a nested tool: the designer has no inline web
// search — deep dives happen in the researcher's context, not here.
const research = {
  definition: {
    name: 'research',
    description:
      'Your researcher, for design questions your built-in catalogs and expertise do not settle: how leading products present a specific kind of data or interaction, current conventions or best practices for a pattern, general-purpose ideas and inspiration. It searches the web, reads the sources that matter, and returns a distilled report with citations and concrete specifics. Brief it neutrally: the question or topic, not the answer you expect.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What you need to find out, in natural language, with enough product context to make the findings relevant.',
        },
      },
      required: ['task'],
    },
  },
  execute: (
    input: Record<string, any>,
    _onLog?: (line: string) => void,
    context?: ToolExecutionContext,
  ): Promise<string> => {
    if (!context) {
      return Promise.resolve('Error: research requires execution context');
    }
    return runResearch(input.task as string, context);
  },
};

const tools = {
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
  // Appended last: tool order is part of the subagent's prompt-cache prefix.
  createWireframe,
  research,
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
    context && toolCallId ? deriveContext(context, toolCallId, onLog) : context;
  return tool.execute(input, onLog, childContext);
}
