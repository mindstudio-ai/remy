/**
 * Lets the design expert hand finished copy to the Copy Agent.
 *
 * Thin delegation to the top-level copyEditor subagent — the same pattern
 * screenshot.ts uses to reach browser automation. copyEditor is readonly and
 * never imports the design expert, so this delegation can't loop.
 */

import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import { copyEditorTool } from '../../copyEditor/index.js';

export const definition: ToolDefinition = {
  clearable: false,
  name: 'polishCopy',
  description:
    "Hand off any user-facing copy you've written — headlines, captions, labels, body text — and get back a sharper version: better built for its audience and free of the fingerprints that make writing read as AI. It elevates how the copy communicates without inventing facts or claims you didn't give it. Give it the text plus what it's for (where it appears, the audience).",
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          "The copy to polish, plus what it's for — where it appears, the audience, any brand voice.",
      },
    },
    required: ['task'],
  },
};

export async function execute(
  input: Record<string, any>,
  _onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  return copyEditorTool.execute(input, context);
}
