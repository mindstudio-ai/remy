/** LSP diagnostics tool — type errors and warnings with suggested fixes. */

import type { Tool } from '../index.js';
import { lspRequest } from '../_helpers/lsp.js';

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: string;
  message: string;
  code: number;
}

interface CodeAction {
  title: string;
  kind?: string;
}

export const lspDiagnosticsTool: Tool = {
  definition: {
    name: 'lspDiagnostics',
    description:
      'Get TypeScript diagnostics (type errors, warnings) for a file, with suggested fixes when available. Use this after editing a file to check for errors.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path relative to workspace root.',
        },
      },
      required: ['file'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/diagnostics', { file: input.file });
    const diags: Diagnostic[] = data.diagnostics || [];

    if (diags.length === 0) {
      return 'No diagnostics — file is clean.';
    }

    // For each diagnostic, try to fetch code actions (quick fixes)
    const lines: string[] = [];
    for (const d of diags) {
      let line = `${d.severity}: ${d.file}:${d.line}:${d.column} — ${d.message}`;

      try {
        const actionsData = await lspRequest('/code-actions', {
          file: d.file,
          startLine: d.line,
          startColumn: d.column,
          endLine: d.endLine ?? d.line,
          endColumn: d.endColumn ?? d.column,
          diagnostics: [d],
        });
        const actions: CodeAction[] = actionsData.actions || [];
        if (actions.length > 0) {
          const fixes = actions.map((a) => a.title).join('; ');
          line += `\n  Quick fixes: ${fixes}`;
        }
      } catch {
        // Code actions endpoint may not be available — that's fine,
        // just return diagnostics without fixes
      }

      lines.push(line);
    }

    return lines.join('\n');
  },
};
