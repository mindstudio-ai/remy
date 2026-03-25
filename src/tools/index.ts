/**
 * Tool registry — defines and dispatches all agent tools.
 *
 * Each tool exports a `definition` (JSON Schema sent to the LLM) and
 * an `execute` function (runs locally when the LLM calls the tool).
 *
 * Tool availability is determined by the project's onboarding state:
 *   - intake / initialSpecAuthoring:  spec tools only (authoring)
 *   - initialCodegen / onboardingFinished:  spec tools + code tools
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

import type { AgentEvent, ExternalToolResolver } from '../types.js';
import type { Message } from '../api.js';
import type { ToolRegistry } from '../toolRegistry.js';

export interface ToolExecutionContext {
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
  toolCallId: string;
  /** Sub-agent tools stash their message history here, keyed by toolCallId. */
  subAgentMessages?: Map<string, Message[]>;
  /** Called for each log line emitted during tool execution (e.g., CLI stderr). */
  onLog?: (line: string) => void;
  /** Shared registry for tool lifecycle management (stop/restart). */
  toolRegistry?: ToolRegistry;
  /** Called when a backgrounded sub-agent completes. */
  onBackgroundComplete?: (
    toolCallId: string,
    name: string,
    result: string,
    subAgentMessages?: import('../api.js').Message[],
  ) => void;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (
    input: Record<string, any>,
    context?: ToolExecutionContext,
  ) => Promise<string>;

  /** Streaming configuration. Omit for tools that don't stream. */
  streaming?: {
    /** Which input field contains the streamable content (default: 'content'). */
    contentField?: string;
    /**
     * Transform partial input into the streaming result string.
     * If omitted, raw content from contentField is emitted as-is.
     * Return null to skip this delta (e.g., waiting for a complete line).
     */
    transform?: (
      partial: Record<string, any>,
    ) => Promise<string | null> | string | null;
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
import { clearSyncStatusTool } from './spec/clearSyncStatus.js';
import { presentSyncPlanTool } from './spec/presentSyncPlan.js';
import { presentPublishPlanTool } from './spec/presentPublishPlan.js';
import { presentPlanTool } from './spec/presentPlan.js';

// General tools
import { setProjectOnboardingStateTool } from './common/setProjectOnboardingState.js';
import { promptUserTool } from './common/promptUser.js';
import { confirmDestructiveActionTool } from './common/confirmDestructiveAction.js';
import { askMindStudioSdkTool } from '../subagents/sdkConsultant/index.js';
import { fetchUrlTool } from './common/fetchUrl.js';
import { searchGoogleTool } from './common/searchGoogle.js';
import { setProjectMetadataTool } from './common/setProjectMetadata.js';

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
import { runScenarioTool } from './code/runScenario.js';
import { runMethodTool } from './code/runMethod.js';
import { screenshotTool } from './code/screenshot.js';
import { browserAutomationTool } from '../subagents/browserAutomation/index.js';
import { designExpertTool } from '../subagents/designExpert/index.js';
import { productVisionTool } from '../subagents/productVision/index.js';
import { codeSanityCheckTool } from '../subagents/codeSanityCheck/index.js';

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
    runScenarioTool,
    runMethodTool,
    screenshotTool,
    browserAutomationTool,
  ];

  if (isLspConfigured()) {
    tools.push(lspDiagnosticsTool, restartProcessTool);
  }

  return tools;
}

/** Always-available tools (all onboarding states). */
function getCommonTools(): Tool[] {
  return [
    setProjectOnboardingStateTool,
    promptUserTool,
    confirmDestructiveActionTool,
    askMindStudioSdkTool,
    fetchUrlTool,
    searchGoogleTool,
    setProjectMetadataTool,
    designExpertTool,
    productVisionTool,
    codeSanityCheckTool,
  ];
}

/** Tools only available after onboarding is complete (onboardingFinished). */
function getPostOnboardingTools(): Tool[] {
  return [
    clearSyncStatusTool,
    presentSyncPlanTool,
    presentPublishPlanTool,
    presentPlanTool,
  ];
}

/**
 * Get the tool set based on onboarding state.
 *
 * - intake / initialSpecAuthoring: spec tools + common tools (authoring)
 * - initialCodegen: spec tools + code tools + common tools (building)
 * - onboardingFinished: everything (full development)
 */
export function getTools(onboardingState: string): Tool[] {
  switch (onboardingState) {
    case 'onboardingFinished':
      return [
        ...getCommonTools(),
        ...getPostOnboardingTools(),
        ...getSpecTools(),
        ...getCodeTools(),
      ];
    case 'initialCodegen':
      return [...getCommonTools(), ...getSpecTools(), ...getCodeTools()];
    default: // intake, initialSpecAuthoring
      return [...getCommonTools(), ...getSpecTools()];
  }
}

/** Tool definitions array — sent to the LLM in each request. */
export function getToolDefinitions(onboardingState: string): ToolDefinition[] {
  return getTools(onboardingState).map((t) => t.definition);
}

/** Look up a tool by name from ALL known tools. */
export function getToolByName(name: string): Tool | undefined {
  const allTools = [
    ...getCommonTools(),
    ...getPostOnboardingTools(),
    ...getSpecTools(),
    ...getCodeTools(),
  ];
  return allTools.find((t) => t.definition.name === name);
}

/**
 * Execute a tool by name. Returns the tool's string output.
 *
 * Looks up from ALL known tools — the onboarding state only gates
 * what the LLM sees, not what can execute.
 */
export function executeTool(
  name: string,
  input: Record<string, any>,
  context?: ToolExecutionContext,
): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) {
    return Promise.resolve(`Error: Unknown tool "${name}"`);
  }
  return tool.execute(input, context);
}
