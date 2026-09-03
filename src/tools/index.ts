/**
 * Tool registry — defines and dispatches all agent tools.
 *
 * Each tool exports a `definition` (JSON Schema sent to the LLM) and
 * an `execute` function (runs locally when the LLM calls the tool).
 *
 * The full tool set is available in every onboarding state — deliberately
 * invariant so the provider's tools-tier cache prefix stays identical
 * across turns and sessions (see getToolDefinitions). Phase behavior is
 * steered by the prompt, not by hiding tools.
 */

import type { AgentEvent, ExternalToolResolver } from '../types.js';
import type { Message, ToolDefinition } from '../api.js';
import type { ToolRegistry } from '../toolRegistry.js';
import type { ApiConfig } from '../config.js';

export interface ToolExecutionContext {
  apiConfig: ApiConfig;
  /** Global fallback model from startup-time options. Used when the
   * session has no per-agent override for the relevant subAgentId. */
  model?: string;
  /** Per-agent model overrides snapshotted on the session. Subagent
   * tools should read `models?.[<theirSubAgentId>] ?? model`. */
  models?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
  toolCallId: string;
  /** Correlation ID from the headless protocol — threaded for structured logging. */
  requestId?: string;
  /** Current project onboarding phase. */
  onboardingState?: string;
  /** Sub-agent tools stash their message history here, keyed by toolCallId. */
  subAgentMessages?: Map<string, Message[]>;
  /** Remy's full conversation history — used by subagents to build persistent threads. */
  conversationMessages?: Message[];
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

/** Create a child context for delegating to another agent tool. */
export function deriveContext(
  parent: ToolExecutionContext,
  toolCallId: string,
  onLog?: (line: string) => void,
): ToolExecutionContext {
  // `onLog` is always overridden, never inherited: the parent's onLog is
  // bound to the parent tool's id (agent.ts emits tool_input_delta with it),
  // so a child tool streaming through it would render its live output inside
  // the parent's Result view. Pass the runner-provided child-scoped onLog, or
  // nothing — inheriting is always wrong.
  return { ...parent, toolCallId, onLog };
}

export interface Tool {
  definition: ToolDefinition;
  /** Tools that only ever run in the background — dispatched detached, returning
   * an immediate ack while work continues. Unlike the opt-in `background: true`
   * input flag (which the model chooses per call), this is inherent to the tool,
   * so the runtime treats every call as backgrounded regardless of input. */
  backgroundOnly?: boolean;
  /** How a background completion is delivered to the agent. 'wake' (default)
   * queues a background_results message that may start a turn when idle —
   * for tools whose results the agent deferred and must act on. 'passive'
   * parks the result in the headless holding pen; it never initiates a turn
   * and instead rides the next real turn as a hidden background_results
   * entry — for fire-and-forget bookkeeping tools like specSync. 'silent'
   * updates the tool block (UI detail view) and nothing else — the model is
   * never told, because the outcome reaches it by another mechanism (e.g.
   * compactConversation: the model sees the checkpoint itself). */
  backgroundNotify?: 'wake' | 'passive' | 'silent';
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
import { presentPublishPlanTool } from './spec/presentPublishPlan.js';
import { writePlanTool } from './spec/writePlan.js';
import { updatePlanStatusTool } from './spec/updatePlanStatus.js';

// General tools
import { markBuildCompleteTool } from './common/markBuildComplete.js';
import { promptUserTool } from './common/promptUser.js';
import { confirmDestructiveActionTool } from './common/confirmDestructiveAction.js';
import { askMindStudioSdkTool } from '../subagents/sdkConsultant/index.js';

import { setProjectMetadataTool } from './common/setProjectMetadata.js';
import { compactConversationTool } from './common/compactConversation.js';
import { loadSkillTool } from './common/loadSkill.js';

// Code tools
import { readFileTool } from './code/readFile.js';
import { writeFileTool } from './code/writeFile.js';
import { editFileTool } from './code/editFile/index.js';
import { bashTool } from './code/bash.js';
import { grepTool } from './code/grep.js';
import { globTool } from './code/glob.js';
import { listDirTool } from './code/listDir.js';
import { editsFinishedTool } from './code/editsFinished.js';
import { lspDiagnosticsTool } from './code/lspDiagnostics.js';
import { restartProcessTool } from './code/restartProcess.js';
import { runScenarioTool } from './code/runScenario.js';
import { runMethodTool } from './code/runMethod.js';
import { testJewelTool } from './code/testJewel.js';
import { queryDatabaseTool } from './code/queryDatabase.js';
import { screenshotTool } from './code/screenshot.js';
import { browserAutomationTool } from '../subagents/browserAutomation/index.js';
import { designExpertTool } from '../subagents/designExpert/index.js';
import { productVisionTool } from '../subagents/productVision/index.js';
import { codeSanityCheckTool } from '../subagents/codeSanityCheck/index.js';
import { copyEditorTool } from '../subagents/copyEditor/index.js';
import { specSyncTool } from '../subagents/specSync/index.js';
import { researchTool } from '../subagents/research/index.js';
import { reviewExistingProjectTool } from '../subagents/reviewExistingProject/index.js';
import { scrapeWebUrlTool } from './common/scrapeWebUrl.js';
import { buildOverviewTool } from './spec/writeBuildOverview.js';

/** All tools — static set sent to every request regardless of onboarding state.
 * Keeping the tool set identical across all sessions enables prompt cache
 * sharing across users (tools are the first cache prefix segment). */
const ALL_TOOLS: Tool[] = [
  // Common
  markBuildCompleteTool,
  promptUserTool,
  confirmDestructiveActionTool,
  askMindStudioSdkTool,
  scrapeWebUrlTool,
  setProjectMetadataTool,
  designExpertTool,
  productVisionTool,
  codeSanityCheckTool,
  copyEditorTool,
  specSyncTool, // no-ops until onboardingFinished; kept here so the tool list stays cache-stable
  buildOverviewTool,
  compactConversationTool,
  // Post-onboarding
  presentPublishPlanTool,
  writePlanTool,
  updatePlanStatusTool,
  // Spec
  readSpecTool,
  writeSpecTool,
  editSpecTool,
  listSpecFilesTool,
  // Code
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
  queryDatabaseTool,
  screenshotTool,
  browserAutomationTool,
  // LSP
  lspDiagnosticsTool,
  restartProcessTool,
  // Appended rather than grouped: position is part of the cache prefix, so a
  // new tool goes at the end to leave every existing session's prefix intact.
  loadSkillTool,
  testJewelTool,
  researchTool,
  reviewExistingProjectTool,
];

/**
 * Main-agent-facing tools that delegate to a sub-agent and return substantive
 * prose work-product (a design report, a QA result, etc.). Their results are
 * worth preserving when serializing the conversation for summarization, unlike
 * mechanical tool results (file reads/edits, grep, bash, screenshots).
 */
export const SUBAGENT_TOOL_NAMES = new Set([
  'visualDesignExpert',
  'productVision',
  'codeSanityCheck',
  'copyEditor',
  'specSync',
  'runAutomatedBrowserTest',
  'askMindStudioSdk',
  'research',
  'reviewExistingProject',
]);

/** Tool definitions array — sent to the LLM in each request. The set is
 * deliberately invariant (no onboarding-state gating): a stable tool list
 * keeps the provider's tools-tier cache prefix identical across turns,
 * sessions, and onboarding states. */
export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map((t) => t.definition);
}

/** Look up a tool by name. */
export function getToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.definition.name === name);
}

/**
 * Execute a tool by name. Returns the tool's string output.
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
