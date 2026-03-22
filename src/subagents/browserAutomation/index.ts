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
import { BROWSER_AUTOMATION_PROMPT } from './prompt.js';
import { sidecarRequest } from '../../tools/_helpers/sidecar.js';

export const browserAutomationTool: Tool = {
  definition: {
    name: 'runAutomatedBrowserTest',
    description:
      'Run an automated browser test against the live preview. The test agent always starts on the main page, so include navigation instructions if the test involves a sub-page. The browser uses the current user roles and dev database state, so run a scenario first if you need specific data or roles. Use after writing or modifying frontend code, to reproduce user-reported issues, or to test end-to-end flows.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What to test, in natural language. Include how to navigate to the relevant page and what data/roles to expect.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: browser automation requires execution context (only available in headless mode)';
    }

    // Check if the browser preview is connected before spinning up the sub-agent
    try {
      const status = await sidecarRequest(
        '/browser-status',
        {},
        { timeout: 5000 },
      );
      if (!status.connected) {
        return 'Error: the browser preview is not connected. The user needs to open the preview before browser tests can run.';
      }
    } catch {
      return 'Error: could not check browser status. The dev environment may not be running.';
    }

    return runSubAgent({
      system: BROWSER_AUTOMATION_PROMPT,
      task: input.task,
      tools: BROWSER_TOOLS,
      externalTools: BROWSER_EXTERNAL_TOOLS,
      executeTool: async () => 'Error: no local tools in browser automation',
      apiConfig: context.apiConfig,
      model: context.model,
      signal: context.signal,
      parentToolId: context.toolCallId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
    });
  },
};
