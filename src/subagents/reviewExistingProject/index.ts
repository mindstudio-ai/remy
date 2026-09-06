/**
 * Existing Project Review sub-agent.
 *
 * The team's reviewer for anything a user brings from a prior attempt: a zip
 * of a codebase from another coding agent, an export from a builder, a folder
 * of specs and docs, a public repo URL. It unpacks the upload in scratch
 * space, strips the noise, lands the trimmed tree beside the upload in
 * src/.user-uploads/, and returns a short review — what the project was trying
 * to be, the materials worth carrying forward (with paths), what to ignore,
 * state signals, and the questions only the user can answer.
 *
 * The prior attempt is evidence of intent, not a spec. The review mines it for
 * what the user cares about, domain content, and real data, and inherits none
 * of the previous tool's architecture, tests, or priorities. Stateless per
 * invocation, foreground only, default 'run' cache policy — the same shape as
 * the researcher.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { readAsset } from '../../assets.js';
import { runSubAgent } from '../runner.js';
import { loadSpecIndex, loadPlatformBrief } from '../common/context.js';
import { executeTool, deriveContext } from '../../tools/index.js';
import { REVIEW_TOOLS } from './tools.js';
import { validateUploadPaths } from './validatePaths.js';
import { resolveModel } from '../../models/surfaces.js';

const BASE_PROMPT = readAsset('subagents/reviewExistingProject', 'prompt.md');

interface ReviewInput {
  paths?: string[];
  context?: string;
  repoUrl?: string;
}

function buildTask(input: ReviewInput): string {
  const parts: string[] = [];
  const paths = (input.paths ?? []).filter(
    (p) => typeof p === 'string' && p.trim(),
  );
  if (paths.length > 0) {
    parts.push(
      `Uploads (local paths):\n${paths.map((p) => `- ${p.trim()}`).join('\n')}`,
    );
  }
  if (input.repoUrl?.trim()) {
    parts.push(`Repository URL: ${input.repoUrl.trim()}`);
  }
  if (input.context?.trim()) {
    parts.push(`Context from the conversation: ${input.context.trim()}`);
  }
  return parts.join('\n\n');
}

export async function runReviewExistingProject(
  input: ReviewInput,
  context: ToolExecutionContext,
): Promise<string> {
  const task = buildTask(input);
  if (!task) {
    return 'Error: reviewExistingProject needs at least one upload path or a repository URL.';
  }

  const specIndex = loadSpecIndex();
  const parts = [BASE_PROMPT, loadPlatformBrief()];
  parts.push('<!-- cache_breakpoint -->');
  if (specIndex) {
    parts.push(specIndex);
  }
  const system = parts.join('\n\n');

  const result = await runSubAgent({
    system,
    task,
    tools: REVIEW_TOOLS,
    externalTools: new Set<string>(),
    executeTool: (name, toolInput, toolCallId, onLog, sams) => {
      const childCtx = toolCallId
        ? {
            ...deriveContext(context, toolCallId, onLog),
            subAgentMessages: sams,
          }
        : context;
      // Reads + bash resolve through the main registry.
      return executeTool(name, toolInput, childCtx);
    },
    apiConfig: context.apiConfig,
    model: resolveModel('reviewExistingProject', context.models, context.model),
    subAgentId: 'reviewExistingProject',
    signal: context.signal,
    parentToolId: context.toolCallId,
    requestId: context.requestId,
    onEvent: context.onEvent,
    resolveExternalTool: context.resolveExternalTool,
    toolRegistry: context.toolRegistry,
    // Every quoted src/.user-uploads/ path in the review must exist on disk
    // (see validatePaths.ts) — the paths are the part the caller acts on.
    validateResult: (text) => validateUploadPaths(text),
  });
  context.subAgentMessages?.set(context.toolCallId, result.messages);
  return result.text;
}

export const reviewExistingProjectTool: Tool = {
  definition: {
    name: 'reviewExistingProject',
    description:
      'Your reviewer for anything a user brings from a prior/extant project or attempt at a project: a zip of a codebase from another coding agent, an export from a vibe coding platform, a folder of specs and docs, a public git URL. It unpacks the upload, strips the noise, lands the trimmed tree in src/.user-uploads/, and returns a short review: what the project was trying to be, the materials worth carrying forward with their paths, what to ignore, state signals, and the questions only the user can answer. Treat the review as evidence of what the user wants, never as a spec. Do not open the archive yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Local paths under src/.user-uploads/ to the uploaded archive(s) and/or loose files, exactly as given in the attachment header.',
        },
        context: {
          type: 'string',
          description:
            'One or two lines about the user and what they said they want. The reviewer cannot see the conversation.',
        },
        repoUrl: {
          type: 'string',
          description:
            'A public git repository URL to shallow-clone and review, instead of or alongside the uploads.',
        },
      },
      required: [],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: reviewExistingProject requires execution context';
    }
    return runReviewExistingProject(input as ReviewInput, context);
  },
};
