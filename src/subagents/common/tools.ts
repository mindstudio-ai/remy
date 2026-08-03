/**
 * Shared read-only tool definitions for subagents.
 *
 * These are the *same* definition objects the main agent registers, so their
 * schemas can never drift from the source tools. They route through the main
 * executeTool with no custom logic (see COMMON_READ_TOOL_NAMES).
 */

import type { ToolDefinition } from '../../api.js';
import { readFileTool } from '../../tools/code/readFile.js';
import { listDirTool } from '../../tools/code/listDir.js';
import { grepTool } from '../../tools/code/grep.js';
import { globTool } from '../../tools/code/glob.js';

export const COMMON_READ_TOOLS: ToolDefinition[] = [
  readFileTool.definition,
  listDirTool.definition,
  grepTool.definition,
  globTool.definition,
];

/** Set of common read tool names, for routing in executeTool callbacks. */
export const COMMON_READ_TOOL_NAMES = new Set(
  COMMON_READ_TOOLS.map((t) => t.name),
);
