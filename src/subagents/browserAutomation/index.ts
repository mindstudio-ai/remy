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
import {
  acquireBrowserLock,
  checkBrowserConnected,
} from '../../tools/_helpers/browserLock.js';
import {
  captureAndAnalyzeScreenshot,
  buildScreenshotAnalysisPrompt,
} from '../../tools/_helpers/screenshot.js';
import { runCli } from '../common/runCli.js';
import { createLogger } from '../../logger.js';

const log = createLogger('browser-automation');

export const browserAutomationTool: Tool = {
  clearable: true,
  definition: {
    name: 'runAutomatedBrowserTest',
    description:
      'Run an automated browser test against the live preview. Describe what to test — the agent figures out how. Use after meaningful changes frontend code, to reproduce user-reported issues, or to test end-to-end flows. Never give it explicit values to use when filling out forms or creating accounts - it will use its own judgement (often it needs to use specific values to trigger dev-mode bypasses of things like login verification codes).',
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

    const release = await acquireBrowserLock();
    try {
      // Check if the browser preview is connected before spinning up the sub-agent
      const browserStatus = await checkBrowserConnected();
      if (!browserStatus.connected) {
        return `Error: ${browserStatus.error}`;
      }

      // Reset browser to clean state before the test
      try {
        await sidecarRequest('/reset-browser', {}, { timeout: 5000 });
      } catch {
        // Non-fatal — proceed with the test
      }

      const result = await runSubAgent({
        system: getBrowserAutomationPrompt(),
        task: input.task,
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
                onLog,
              });
            } catch (err: any) {
              return `Error taking screenshot: ${err.message}`;
            }
          }
          return `Error: unknown local tool "${name}"`;
        },
        apiConfig: context.apiConfig,
        model: context.model,
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
                const batchInput = screenshotSteps.map((s: any) => ({
                  stepType: 'analyzeImage',
                  step: {
                    imageUrl: s.result.url,
                    prompt: buildScreenshotAnalysisPrompt({
                      styleMap: s.result.styleMap,
                    }),
                  },
                }));
                const batchResult = await runCli(
                  `mindstudio batch --no-meta ${JSON.stringify(JSON.stringify(batchInput))}`,
                  { timeout: 200_000 },
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
      });

      // Reset browser after the test so the next session starts clean
      try {
        await sidecarRequest('/reset-browser', {}, { timeout: 5000 });
      } catch {
        // Non-fatal
      }

      context.subAgentMessages?.set(context.toolCallId, result.messages);
      return result.text;
    } finally {
      release();
    }
  },
};
