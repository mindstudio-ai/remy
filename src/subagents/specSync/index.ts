/**
 * Spec-sync sub-agent.
 *
 * Reconciles the src/ spec to code changes Remy has already made. Remy briefs it
 * with what changed and why; it finds the affected spec sections and updates them.
 * Always runs in the background (backgroundOnly) and serializes via a FIFO lock so
 * two reconciliations never run at once. Read + spec-write tools only — it never
 * edits code. Available only after onboarding is finished.
 *
 * With `refreshBuildOverview` set (post-deploy / large milestones), the run also
 * gains writeBuildOverview: after reconciling, it authors fresh overview copy
 * from the updated spec and the design expert re-renders src/overview.html —
 * foreground within this run, never nested-background.
 */

import type { Tool, ToolExecutionContext } from '../../tools/index.js';
import { readAsset } from '../../assets.js';
import { runSubAgent } from '../runner.js';
import { loadSpecIndex, loadPlatformBrief } from '../common/context.js';
import { executeTool, deriveContext } from '../../tools/index.js';
import {
  buildOverviewTool,
  renderBuildOverview,
} from '../../tools/spec/writeBuildOverview.js';
import { SPEC_SYNC_TOOLS } from './tools.js';
import { acquireSpecSyncLock } from './lock.js';
import { resolveModel } from '../../models/surfaces.js';

const BASE_PROMPT = readAsset('subagents/specSync', 'prompt.md');

// The MSFM format reference — the same spec docs the main agent carries. This
// agent authors spec files, so it needs to understand what the spec is and how
// the format works (annotations, pointers, structure), not just match patterns.
const MSFM_DOCS = `<mindstudio_flavored_markdown_spec_docs>\n${readAsset(
  'prompt',
  'compiled/msfm.md',
)}\n</mindstudio_flavored_markdown_spec_docs>`;

export const specSyncTool: Tool = {
  backgroundOnly: true,
  // Fire-and-forget: completion never wakes the agent. The outcome rides the
  // next real turn as a hidden background_results note instead.
  backgroundNotify: 'passive',
  definition: {
    name: 'specSync',
    description:
      'Reconcile the spec to bring it in line with code changes you have made. Provide a brief, bulleted list of what changed and why; it finds the affected spec sections and updates them to match. Set `refreshBuildOverview` after a deploy or a large milestone to also re-author the Build Overview from the updated spec. Always runs in the background and completes silently — do not wait for it; its outcome appears as an automated note at the start of a later turn.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What you changed in the code and why, in plain language — the way you would explain it to a teammate. The specialist reads the spec itself and decides which sections to update; you do not need to name files or spec locations.',
        },
        refreshBuildOverview: {
          type: 'boolean',
          description:
            'Also refresh the Build Overview (src/overview.html) after reconciling — the specialist authors fresh copy from the updated spec and re-renders the page. Set this after a deploy or a large milestone; leave it off for routine syncs.',
        },
      },
      required: ['task'],
    },
  },

  async execute(input, context?: ToolExecutionContext) {
    if (!context) {
      return 'Error: spec sync requires execution context';
    }

    // Available only once the app is built. Before then Remy authors the spec
    // directly (there is nothing to reconcile), so no-op with an explanation
    // rather than spawning the agent. The tool stays in the list in every state
    // so the tool-cache prefix stays stable (see tools/index.ts ALL_TOOLS).
    if (context.onboardingState !== 'onboardingFinished') {
      return 'Spec sync runs only after the build is finished (onboardingFinished). During intake and the initial build you author the spec directly, so there is nothing to reconcile yet.';
    }

    const specIndex = loadSpecIndex();
    // Static context (prompt, platform concepts, MSFM format) before the
    // breakpoint so it caches across runs; the dynamic spec index after it.
    const parts = [
      BASE_PROMPT,
      loadPlatformBrief(),
      MSFM_DOCS,
      '<!-- cache_breakpoint -->',
    ];
    if (specIndex) {
      parts.push(specIndex);
    }
    const system = parts.join('\n\n');

    // With refreshBuildOverview set, the run gains the writeBuildOverview
    // tool (its description carries the full copy-authoring contract) and a
    // task directive to use it after reconciling. Deterministic gating: an
    // unflagged run cannot touch the overview.
    const refreshOverview = input.refreshBuildOverview === true;
    const tools = refreshOverview
      ? [...SPEC_SYNC_TOOLS, buildOverviewTool.definition]
      : SPEC_SYNC_TOOLS;
    const task = refreshOverview
      ? `${input.task}\n\nAfter reconciling the spec, refresh the Build Overview: author the complete updated copy from the freshly-reconciled spec (follow the writeBuildOverview tool description) and call \`writeBuildOverview\` once with the final copy.`
      : input.task;

    const result = await runSubAgent({
      system,
      task,
      tools,
      externalTools: new Set<string>(),
      executeTool: (name, toolInput, toolCallId, _onLog, sams) => {
        // Overview render runs foreground within this already-detached run —
        // never nested-background (see renderBuildOverview) — against a child
        // context so the expert's events and transcript attach to the inner
        // writeBuildOverview call.
        if (name === 'writeBuildOverview') {
          const childCtx = toolCallId
            ? { ...deriveContext(context, toolCallId), subAgentMessages: sams }
            : { ...context, subAgentMessages: sams };
          return renderBuildOverview(
            String(toolInput.content ?? '').trim(),
            childCtx,
            { background: false },
          );
        }
        return executeTool(name, toolInput, context);
      },
      apiConfig: context.apiConfig,
      model: resolveModel('specSync', context.models, context.model),
      subAgentId: 'specSync',
      signal: context.signal,
      parentToolId: context.toolCallId,
      requestId: context.requestId,
      onEvent: context.onEvent,
      resolveExternalTool: context.resolveExternalTool,
      toolRegistry: context.toolRegistry,
      // Always background + serialized: never blocks Remy's turn, and two
      // reconciliations queue (FIFO) instead of running at once.
      background: true,
      acquireLock: acquireSpecSyncLock,
      onBackgroundComplete: (bgResult) => {
        context.onBackgroundComplete?.(
          context.toolCallId,
          'specSync',
          bgResult.text,
          bgResult.messages,
        );
      },
    });
    context.subAgentMessages?.set(context.toolCallId, result.messages);
    return result.text;
  },
};
