/**
 * Browser automation sub-agent.
 *
 * Exports a tool that the main agent can call to run automated browser
 * tests against the live preview. The sub-agent takes DOM snapshots,
 * plans interactions, executes them, and reports back.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { runSubAgent } from '../runner.js';
import { BROWSER_TOOLS, BROWSER_EXTERNAL_TOOLS } from './tools.js';
import { getBrowserAutomationPrompt } from './prompt.js';
import { sidecarRequest } from '../../tools/_helpers/sidecar.js';
import { acquireBrowserLock } from '../../tools/_helpers/browserLock.js';
import {
  captureAndAnalyzeScreenshot,
  buildScreenshotAnalysisPrompt,
} from '../../tools/_helpers/screenshot.js';
import { runMindstudioCli } from '../common/runMindstudioCli.js';
import { resolveModel } from '../../models/surfaces.js';
import { createLogger } from '../../logger.js';

const log = createLogger('browser-automation');

/**
 * Structured result from running the browser automation sub-agent.
 *
 * Programmatic callers (e.g. the screenshot tool) read `screenshot` directly
 * instead of parsing prose. The public `browserAutomationTool` wrapper
 * synthesizes a markdown string from this for the model.
 */
export interface BrowserAutomationResult {
  text: string;
  screenshot?: { url: string; styleMap?: string };
}

/**
 * Run the browser automation sub-agent and return its structured output.
 * Acquires the shared browser lock for the duration of the run.
 *
 * `opts.capture` selects which final screenshot the programmatic caller
 * (the screenshot tool) wants surfaced — viewport or full-page. The
 * sub-agent may take either kind along the way; this picks the one the
 * caller asked for, falling back to whichever was actually captured.
 */
export async function runBrowserAutomation(
  task: string,
  context: ToolExecutionContext,
  opts?: { capture?: 'viewport' | 'fullPage' },
): Promise<BrowserAutomationResult> {
  const release = await acquireBrowserLock();
  try {
    // Viewport captures happen as `screenshotViewport` steps inside
    // `browserCommand` results (an external tool), which the runner can't stash
    // as an artifact. Harvest the last one here so it can be surfaced below.
    let lastBrowserCommandViewport:
      | { url: string; styleMap?: string }
      | undefined;
    const result = await runSubAgent({
      system: getBrowserAutomationPrompt(),
      task,
      tools: BROWSER_TOOLS,
      externalTools: BROWSER_EXTERNAL_TOOLS,
      executeTool: async (name, _input, _toolCallId, onLog) => {
        if (name === 'setupBrowser') {
          try {
            const result = await sidecarRequest(
              '/setup-browser',
              {
                auth: _input.auth,
                path: _input.path,
              },
              { timeout: 15000 },
            );
            return JSON.stringify(result);
          } catch (err: any) {
            return `Error setting up browser: ${err.message}`;
          }
        }
        if (name === 'screenshotFullPage') {
          try {
            return await captureAndAnalyzeScreenshot({
              path: _input.path as string | undefined,
              fullPage: true,
              onLog,
              model: resolveModel(
                'imageAnalysis',
                context.models,
                context.model,
              ),
            });
          } catch (err: any) {
            return `Error taking screenshot: ${err.message}`;
          }
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

        // Auto-analyze screenshotViewport results in browserCommand results
        if (name === 'browserCommand') {
          try {
            const parsed = JSON.parse(result);
            const screenshotSteps = (parsed.steps || []).filter(
              (s: any) => s.command === 'screenshotViewport' && s.result?.url,
            );
            if (screenshotSteps.length > 0) {
              // Surface the last viewport capture from this batch (last write
              // wins across batches) — this is what runBrowserAutomation returns.
              const lastStep = screenshotSteps[screenshotSteps.length - 1];
              lastBrowserCommandViewport = {
                url: lastStep.result.url,
                styleMap: lastStep.result.styleMap,
              };
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
                let ai = 0;
                for (const step of parsed.steps) {
                  if (
                    step.command === 'screenshotViewport' &&
                    step.result?.url &&
                    ai < analyses.length
                  ) {
                    step.result.analysis =
                      analyses[ai]?.output?.analysis ||
                      analyses[ai]?.output ||
                      '';
                    ai++;
                  }
                }
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
      captureArtifacts: ['screenshotFullPage'],
    });

    context.subAgentMessages?.set(context.toolCallId, result.messages);

    // Surface the screenshot the caller asked for; fall back to whichever
    // kind the sub-agent actually captured so a result is never dropped.
    // Full-page comes from the standalone-tool artifact; viewport is harvested
    // from the browserCommand screenshotViewport step above.
    const fullPage = result.artifacts?.screenshotFullPage;
    const viewport = lastBrowserCommandViewport;
    const preferred =
      opts?.capture === 'viewport'
        ? (viewport ?? fullPage)
        : (fullPage ?? viewport);
    return {
      text: result.text,
      ...(preferred?.url
        ? { screenshot: { url: preferred.url, styleMap: preferred.styleMap } }
        : {}),
    };
  } finally {
    release();
  }
}

export const browserAutomationTool: Tool = {
  clearable: true,
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
