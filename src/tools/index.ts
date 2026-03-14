/**
 * Tool registry — defines and dispatches all agent tools.
 *
 * Each tool exports a `definition` (JSON Schema sent to the LLM) and
 * an `execute` function (runs locally when the LLM calls the tool).
 *
 * Tools are the same whether running in the CLI or the sandbox C&C
 * server. In the sandbox, the C&C server could wrap these with Yjs
 * mutations for collaborative editing — but the tool interface stays
 * identical.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (input: Record<string, any>) => Promise<string>;
}

import { readFileTool } from './readFile.js';
import { writeFileTool } from './writeFile.js';
import { editFileTool } from './editFile.js';
import { bashTool } from './bash.js';
import { grepTool } from './grep.js';
import { globTool } from './glob.js';
import { listDirTool } from './listDir.js';
import { multiEditTool } from './multiEdit.js';
import { getLspTools } from './lsp.js';

export function getAllTools(): Tool[] {
  return [
    readFileTool,
    writeFileTool,
    editFileTool,
    multiEditTool,
    bashTool,
    grepTool,
    globTool,
    listDirTool,
    ...getLspTools(),
  ];
}

/** Tool definitions array — sent to the LLM in each request. */
export function getToolDefinitions(): ToolDefinition[] {
  return getAllTools().map((t) => t.definition);
}

/** Execute a tool by name. Returns the tool's string output. */
export function executeTool(
  name: string,
  input: Record<string, any>,
): Promise<string> {
  const tool = getAllTools().find((t) => t.definition.name === name);
  if (!tool) {
    return Promise.resolve(`Error: Unknown tool "${name}"`);
  }
  return tool.execute(input);
}
