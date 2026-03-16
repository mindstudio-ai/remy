/**
 * LSP tools — call the sandbox's LSP HTTP sidecar for IDE-level intelligence.
 *
 * These tools are only registered when an LSP URL is configured (headless mode).
 * In interactive/local mode they're excluded from the tool list entirely.
 */

import type { Tool } from '../index.js';
import { log } from '../../logger.js';

let lspBaseUrl: string | null = null;

export function setLspBaseUrl(url: string): void {
  lspBaseUrl = url;
  log.info('LSP configured', { url });
}

export function isLspConfigured(): boolean {
  return lspBaseUrl !== null;
}

async function lspRequest(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  if (!lspBaseUrl) {
    throw new Error('LSP not available');
  }
  const url = `${lspBaseUrl}${endpoint}`;
  log.debug('LSP request', { endpoint, body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      log.error('LSP sidecar error', { endpoint, status: res.status });
      throw new Error(`LSP sidecar error: ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.startsWith('LSP sidecar')) {
      throw err;
    }
    log.error('LSP connection error', { endpoint, error: err.message });
    throw new Error(`LSP connection error: ${err.message}`);
  }
}

// --- diagnostics ---

const diagnosticsTool: Tool = {
  definition: {
    name: 'diagnostics',
    description:
      'Get TypeScript diagnostics (type errors, warnings) for a file. Use this after editing a file to check for errors.',
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
    const diags: Array<{
      file: string;
      line: number;
      column: number;
      severity: string;
      message: string;
      code: number;
    }> = data.diagnostics || [];

    if (diags.length === 0) {
      return 'No diagnostics — file is clean.';
    }

    return diags
      .map(
        (d) => `${d.severity}: ${d.file}:${d.line}:${d.column} — ${d.message}`,
      )
      .join('\n');
  },
};

// --- definition ---

const definitionTool: Tool = {
  definition: {
    name: 'definition',
    description:
      'Go to definition of a symbol at a position. Returns the file and line where the symbol is defined.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path relative to workspace root.',
        },
        line: { type: 'number', description: 'Line number (1-indexed).' },
        column: { type: 'number', description: 'Column number (1-indexed).' },
      },
      required: ['file', 'line', 'column'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/definition', {
      file: input.file,
      line: input.line,
      column: input.column,
    });
    const defs: Array<{ file: string; line: number; column: number }> =
      data.definitions || [];

    if (defs.length === 0) {
      return 'No definition found.';
    }

    return defs.map((d) => `${d.file}:${d.line}:${d.column}`).join('\n');
  },
};

// --- references ---

const referencesTool: Tool = {
  definition: {
    name: 'references',
    description:
      'Find all references to a symbol at a position. Returns every file and line where the symbol is used.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path relative to workspace root.',
        },
        line: { type: 'number', description: 'Line number (1-indexed).' },
        column: { type: 'number', description: 'Column number (1-indexed).' },
      },
      required: ['file', 'line', 'column'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/references', {
      file: input.file,
      line: input.line,
      column: input.column,
    });
    const refs: Array<{ file: string; line: number; column: number }> =
      data.references || [];

    if (refs.length === 0) {
      return 'No references found.';
    }

    return refs.map((r) => `${r.file}:${r.line}:${r.column}`).join('\n');
  },
};

// --- hover ---

const hoverTool: Tool = {
  definition: {
    name: 'hover',
    description:
      'Get the type signature and documentation for a symbol at a position.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path relative to workspace root.',
        },
        line: { type: 'number', description: 'Line number (1-indexed).' },
        column: { type: 'number', description: 'Column number (1-indexed).' },
      },
      required: ['file', 'line', 'column'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/hover', {
      file: input.file,
      line: input.line,
      column: input.column,
    });

    if (!data.type) {
      return 'No type information available.';
    }

    let result = data.type;
    if (data.documentation) {
      result += `\n\n${data.documentation}`;
    }
    return result;
  },
};

// --- symbols ---

const symbolsTool: Tool = {
  definition: {
    name: 'symbols',
    description:
      'Get the outline of a file — all functions, classes, interfaces, types, and variables with their line numbers.',
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
    const data = await lspRequest('/symbols', { file: input.file });
    const syms: Array<{ name: string; kind: string; line: number }> =
      data.symbols || [];

    if (syms.length === 0) {
      return 'No symbols found.';
    }

    return syms.map((s) => `${s.line}: ${s.kind} ${s.name}`).join('\n');
  },
};

// --- restartProcess ---

const restartProcessTool: Tool = {
  definition: {
    name: 'restartProcess',
    description:
      'Restart a managed sandbox process. Use this after running npm install or changing package.json to restart the dev server so it picks up new dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Process name to restart. Currently supported: "devServer".',
        },
      },
      required: ['name'],
    },
  },

  async execute(input) {
    const data = await lspRequest('/restart-process', { name: input.name });
    if (data.ok) {
      return `Restarted ${input.name}.`;
    }
    return `Error: unexpected response: ${JSON.stringify(data)}`;
  },
};

/** Returns LSP tools if configured, empty array otherwise. */
export function getLspTools(): Tool[] {
  if (!lspBaseUrl) {
    log.debug('LSP tools skipped — no URL configured');
    return [];
  }
  log.debug('LSP tools registered', { url: lspBaseUrl });
  return [
    diagnosticsTool,
    definitionTool,
    referencesTool,
    hoverTool,
    symbolsTool,
    restartProcessTool,
  ];
}
