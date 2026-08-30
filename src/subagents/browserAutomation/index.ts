/**
 * Browser automation sub-agent.
 *
 * Exports a tool that the main agent can call to run automated browser
 * tests against the live preview. The sub-agent takes DOM snapshots,
 * plans interactions, executes them, and reports back.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import {
  executeTool as executeRegistryTool,
  deriveContext,
} from '../../tools/index.js';
import { runSubAgent } from '../runner.js';
import { BROWSER_TOOLS, BROWSER_EXTERNAL_TOOLS } from './tools.js';
import { COMMON_READ_TOOL_NAMES } from '../common/tools.js';
import { readSpecTool } from '../../tools/spec/readSpec.js';
import { getBrowserAutomationPrompt } from './prompt.js';
import { sidecarRequest } from '../../tools/_helpers/sidecar.js';
import { acquireBrowserLock } from '../../tools/_helpers/browserLock.js';
import { buildScreenshotAnalysisPrompt } from '../../tools/_helpers/screenshot.js';
import { runMindstudioCli } from '../common/runMindstudioCli.js';
import { resolveModel } from '../../models/surfaces.js';
import { createLogger } from '../../logger.js';

const log = createLogger('browser-automation');

/** `browserCommand` steps that produce an image — the only way this sub-agent
 *  captures anything. Both are analyzed and harvested the same way. */
const CAPTURE_COMMANDS = new Set(['screenshotViewport', 'screenshotFullPage']);

/**
 * Structured result from running the browser automation sub-agent.
 *
 * Programmatic callers (e.g. the screenshot tool) read `screenshot` directly
 * instead of parsing prose. The public `browserAutomationTool` wrapper
 * synthesizes a markdown string from this for the model.
 */
export interface BrowserAutomationResult {
  text: string;
  screenshot?: { url: string; styleMap?: string; analysis?: string };
}

/**
 * Run the browser automation sub-agent and return its structured output.
 * Acquires the shared browser lock for the duration of the run.
 *
 * `opts.capture` selects which final screenshot the programmatic caller
 * (the screenshot tool) wants surfaced — viewport or full-page. The
 * sub-agent may take either kind along the way; this picks the one the
 * caller asked for, falling back to whichever was actually captured.
 *
 * `opts.analysisPrompt` carries the caller's questions into each capture's
 * auto-analysis, so the one analysis serves both the sub-agent (inventory)
 * and the caller (answers) — the caller reuses it via `screenshot.analysis`
 * instead of analyzing the same image a second time.
 */
export async function runBrowserAutomation(
  task: string,
  context: ToolExecutionContext,
  opts?: { capture?: 'viewport' | 'fullPage'; analysisPrompt?: string },
): Promise<BrowserAutomationResult> {
  const release = await acquireBrowserLock();
  try {
    // Start every run from the app's default viewport so a prior run's
    // desktop/mobile switch (via the `setViewport` browserCommand step) never
    // leaks into this run's snapshots. Best-effort: if the browser is
    // unavailable the sub-agent reports the run inconclusive when it first tries
    // a command, so don't fail the run on the reset.
    try {
      // 25s > the sidecar's own 20s bound — each layer of the timeout ladder
      // must be strictly slower than the one it wraps, so the tunnel's real
      // error surfaces instead of an opaque abort here.
      await sidecarRequest(
        '/set-viewport',
        { mode: 'default' },
        { timeout: 25000 },
      );
    } catch {
      // Non-fatal — proceed with the run regardless.
    }

    // Captures happen as steps inside `browserCommand` results (an external
    // tool), which the runner can't stash as an artifact. Harvest the last one of
    // each kind here so they can be surfaced below.
    let lastCapture: {
      viewport?: { url: string; styleMap?: string; analysis?: string };
      fullPage?: { url: string; styleMap?: string; analysis?: string };
    } = {};
    const result = await runSubAgent({
      system: getBrowserAutomationPrompt(),
      task,
      tools: BROWSER_TOOLS,
      externalTools: BROWSER_EXTERNAL_TOOLS,
      executeTool: async (name, _input, toolCallId, onLog) => {
        if (name === 'setupBrowser') {
          try {
            // 30s > the sidecar's own 25s bound (timeout ladder — see above).
            const result = await sidecarRequest(
              '/setup-browser',
              {
                auth: _input.auth,
                path: _input.path,
              },
              { timeout: 30000 },
            );
            return JSON.stringify(result);
          } catch (err: any) {
            return `Error setting up browser: ${err.message}`;
          }
        }
        // Read tools (readFile/listDir/grep/glob + readSpec) route to the global
        // registry so the QA agent can fetch the full spec its prompt index points
        // to. Mirrors how specSync / productVision execute their read tools.
        if (
          COMMON_READ_TOOL_NAMES.has(name) ||
          name === readSpecTool.definition.name
        ) {
          return executeRegistryTool(
            name,
            _input,
            toolCallId ? deriveContext(context, toolCallId, onLog) : context,
          );
        }
        return `Error: unknown local tool "${name}"`;
      },
      apiConfig: context.apiConfig,
      model: resolveModel('browserAutomation', context.models, context.model),
      subAgentId: 'browserAutomation',
      signal: context.signal,
      parentToolId: context.toolCallId,
      requestId: context.requestId,
      onEvent: context.onEvent,
      resolveExternalTool: async (id, name, input) => {
        if (!context.resolveExternalTool) {
          return 'Error: no external tool resolver';
        }
        const result = await context.resolveExternalTool(id, name, input);

        // Auto-analyze any captures the batch produced
        if (name === 'browserCommand') {
          try {
            const parsed = JSON.parse(result);
            // Both capture kinds, analyzed and harvested identically. Full-page
            // steps used to fall through this filter, so they came back as a bare
            // URL with no description and were invisible to `opts.capture`.
            const screenshotSteps = (parsed.steps || []).filter(
              (s: any) => CAPTURE_COMMANDS.has(s.command) && s.result?.url,
            );
            if (screenshotSteps.length > 0) {
              // Last write wins across batches, per kind — this is what
              // runBrowserAutomation returns.
              for (const step of screenshotSteps) {
                const kind =
                  step.command === 'screenshotFullPage'
                    ? 'fullPage'
                    : 'viewport';
                lastCapture[kind] = {
                  url: step.result.url,
                  styleMap: step.result.styleMap,
                };
              }
              const visionOverride = {
                model: resolveModel(
                  'imageAnalysis',
                  context.models,
                  context.model,
                ),
              };
              const batchInput = screenshotSteps.map((s: any) => ({
                stepType: 'analyzeImage',
                step: {
                  imageUrl: s.result.url,
                  prompt: buildScreenshotAnalysisPrompt({
                    styleMap: s.result.styleMap,
                    additionalQuestions: opts?.analysisPrompt,
                  }),
                  visionModelOverride: visionOverride,
                },
              }));
              const batchResult = await runMindstudioCli(
                ['batch', JSON.stringify(batchInput)],
                { timeout: 200_000, caller: 'browserAutomation' },
              );
              try {
                const analyses = JSON.parse(batchResult);
                // Same predicate as the filter above, so the analyses line up
                // with the steps that produced them.
                screenshotSteps.forEach((step: any, i: number) => {
                  if (i >= analyses.length) {
                    return;
                  }
                  const analysis =
                    analyses[i]?.output?.analysis || analyses[i]?.output || '';
                  step.result.analysis = analysis;
                  // Attach to the harvested capture too (matched by URL, since
                  // `lastCapture` is last-write-wins per kind) so the caller can
                  // reuse this analysis instead of running its own.
                  const kind =
                    step.command === 'screenshotFullPage'
                      ? 'fullPage'
                      : 'viewport';
                  const harvested = lastCapture[kind];
                  if (
                    harvested &&
                    typeof analysis === 'string' &&
                    analysis &&
                    harvested.url === step.result.url
                  ) {
                    harvested.analysis = analysis;
                  }
                });
              } catch {
                log.debug('Failed to parse batch analysis result', {
                  batchResult,
                });
              }
              return JSON.stringify(parsed);
            }
          } catch {
            // Not JSON or no screenshots — return as-is
          }
        }
        return result;
      },
      toolRegistry: context.toolRegistry,
    });

    context.subAgentMessages?.set(context.toolCallId, result.messages);

    // Surface the kind the caller asked for; fall back to whichever the
    // sub-agent actually captured so a result is never dropped. Both come from
    // the same harvest above, so neither kind can go missing.
    const preferred =
      opts?.capture === 'viewport'
        ? (lastCapture.viewport ?? lastCapture.fullPage)
        : (lastCapture.fullPage ?? lastCapture.viewport);
    return {
      text: result.text,
      ...(preferred?.url ? { screenshot: preferred } : {}),
    };
  } finally {
    release();
  }
}

export const browserAutomationTool: Tool = {
  definition: {
    name: 'runAutomatedBrowserTest',
    description:
      'Run an automated browser test against the live preview. Describe what to test — the agent figures out how. Use after meaningful changes to frontend code, to reproduce user-reported issues, or to test end-to-end flows. Never give it explicit values to use when filling out forms or creating accounts — it will use its own judgement (often it needs specific values to trigger dev-mode bypasses of things like login verification codes).',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What to test, in natural language. Keep it brief — the agent reads the spec and figures out navigation, data setup, and test strategy on its own.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: browser automation requires execution context (only available in headless mode)';
    }
    const result = await runBrowserAutomation(input.task as string, context);
    // When a final-state screenshot was captured, append it as a markdown
    // image so the frontend renders it inline alongside the prose.
    if (result.screenshot) {
      return `${result.text}\n\n![Final state](${result.screenshot.url})`;
    }
    return result.text;
  },
};
