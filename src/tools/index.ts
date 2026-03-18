/**
 * Tool registry — defines and dispatches all agent tools.
 *
 * Each tool exports a `definition` (JSON Schema sent to the LLM) and
 * an `execute` function (runs locally when the LLM calls the tool).
 *
 * Tool availability is determined by whether the project has generated
 * code in dist/:
 *   - No code yet:  spec tools only (authoring)
 *   - Has code:     spec tools + code tools (iterating)
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (input: Record<string, any>) => Promise<string>;

  /** Streaming configuration. Omit for tools that don't stream. */
  streaming?: {
    /** Which input field contains the streamable content (default: 'content'). */
    contentField?: string;
    /**
     * Transform partial input into the streaming result string.
     * If omitted, raw content from contentField is emitted as-is.
     */
    transform?: (partial: Record<string, any>) => Promise<string> | string;
    /**
     * For tools that emit progressive tool_start events (like promptUser).
     * Return the input to emit, or null to skip this delta.
     * When provided, tool_start fires with partial:true on each emission,
     * and a final tool_start (no partial) fires on tool_use.
     */
    partialInput?: (
      partial: Record<string, any>,
      lastEmittedCount: number,
    ) => { input: Record<string, any>; emittedCount: number } | null;
  };
}

// Spec tools
import { readSpecTool } from './spec/readSpec.js';
import { writeSpecTool } from './spec/writeSpec.js';
import { editSpecTool } from './spec/editSpec.js';
import { listSpecFilesTool } from './spec/listSpecFiles.js';
import { setViewModeTool } from './spec/setViewMode.js';
import { promptUserTool } from './spec/promptUser.js';
import { clearSyncStatusTool } from './spec/clearSyncStatus.js';
import { presentSyncPlanTool } from './spec/presentSyncPlan.js';
import { presentPublishPlanTool } from './spec/presentPublishPlan.js';

// Code tools
import { readFileTool } from './code/readFile.js';
import { writeFileTool } from './code/writeFile.js';
import { editFileTool } from './code/editFile/index.js';
import { bashTool } from './code/bash.js';
import { grepTool } from './code/grep.js';
import { globTool } from './code/glob.js';
import { listDirTool } from './code/listDir.js';
import { editsFinishedTool } from './code/editsFinished.js';
import { isLspConfigured } from './_helpers/lsp.js';
import { lspDiagnosticsTool } from './code/lspDiagnostics.js';
import { restartProcessTool } from './code/restartProcess.js';

function getSpecTools(): Tool[] {
  return [readSpecTool, writeSpecTool, editSpecTool, listSpecFilesTool];
}

function getCodeTools(): Tool[] {
  const tools = [
    readFileTool,
    writeFileTool,
    editFileTool,
    bashTool,
    grepTool,
    globTool,
    listDirTool,
    editsFinishedTool,
  ];

  if (isLspConfigured()) {
    tools.push(lspDiagnosticsTool, restartProcessTool);
  }

  return tools;
}

/**
 * Get the tool set based on project state.
 *
 * - projectHasCode = false: spec tools (authoring)
 * - projectHasCode = true:  spec tools + code tools (iterating)
 */
export function getTools(projectHasCode: boolean): Tool[] {
  if (projectHasCode) {
    return [
      setViewModeTool,
      promptUserTool,
      clearSyncStatusTool,
      presentSyncPlanTool,
      presentPublishPlanTool,
      ...getSpecTools(),
      ...getCodeTools(),
    ];
  }
  return [
    setViewModeTool,
    promptUserTool,
    clearSyncStatusTool,
    presentSyncPlanTool,
    presentPublishPlanTool,
    ...getSpecTools(),
  ];
}

/** Tool definitions array — sent to the LLM in each request. */
export function getToolDefinitions(projectHasCode: boolean): ToolDefinition[] {
  return getTools(projectHasCode).map((t) => t.definition);
}

/** Look up a tool by name from ALL known tools. */
export function getToolByName(name: string): Tool | undefined {
  const allTools = [
    setViewModeTool,
    promptUserTool,
    clearSyncStatusTool,
    presentSyncPlanTool,
    presentPublishPlanTool,
    ...getSpecTools(),
    ...getCodeTools(),
  ];
  return allTools.find((t) => t.definition.name === name);
}

/**
 * Execute a tool by name. Returns the tool's string output.
 *
 * Looks up from ALL known tools — the projectHasCode flag only gates
 * what the LLM sees, not what can execute.
 */
export function executeTool(
  name: string,
  input: Record<string, any>,
): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) {
    return Promise.resolve(`Error: Unknown tool "${name}"`);
  }
  return tool.execute(input);
}
