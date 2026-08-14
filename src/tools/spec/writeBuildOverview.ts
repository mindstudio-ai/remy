/**
 * Build Overview generation.
 *
 * Remy authors the full plain-language copy of everything the build produced —
 * it just built the app, so it knows what is true — and hands that copy to the
 * design expert, which lays it out and skins it to the app's brand WITHOUT
 * changing the copy (verbatim — it typesets the words, it does not rewrite them)
 * and writes the result directly to src/overview.html (the project's home page
 * in the Spec tab).
 *
 * The design expert owns the file write (via runDesignExpertRender): on the
 * initial build it writes a fresh file from the shell scaffold; afterwards it
 * reads the existing file and edits it in place. Initial generation runs
 * foreground (it's the asset shown at the reveal); later refreshes run in the
 * background so they don't block the turn.
 *
 * Mirrors the pitch-deck flow (src/subagents/productVision/executor.ts ::
 * writePitchDeck), but parent-owned: Remy is the author, not a sub-agent.
 */

import fs from 'node:fs';
import type { Tool, ToolExecutionContext } from '../index.js';
import { runDesignExpertRender } from '../../subagents/designExpert/index.js';

const OVERVIEW_FILE = 'src/overview.html';

// Design-expert-facing brief. Principles + constraints + the one hard rule —
// deliberately no prescribed section list or layout, so the model composes what
// fits each app. The delivery instructions (write a fresh file vs. edit the
// existing one) are appended per-call depending on whether the file exists.
const DESIGN_BRIEF = `We are building the Build Overview for this app — the home page of its Spec tab. It is a calm, dense, one-page reference of everything the app actually contains, including the parts the user can't see. It renders flush inside the Spec tab's content panel (the IDE supplies the surrounding nav).

Take the plain-language copy in <overview_copy> and lay it out and skin it into a single, beautiful, self-contained HTML document in the app's own brand.

### The single hard rule
The copy in <overview_copy> is final — it was authored and edited before it reached you. Treat it as locked content to typeset, not a draft to improve. Reproduce the words exactly: do not rewrite, rephrase, shorten, expand, reorder, or "polish" them, and do not run them through any copy tool. This is the opposite of your usual role — here you own layout, typography, and visual design only, and the words (every number, name, label, claim, and sentence) are fixed. A single changed word or wrong number breaks this document's purpose.

### What it is (and is not)
- A typeset reference dossier: composed, dense, a little cool — substantial at a glance, then readable. Density communicates substance; sparse and airy reads as "not much here."
- Brand-skinned: pull the palette, type system, and a single accent from the app's spec. The accent leads labels and figures; it is a mark, not a fill.
- NOT a slide deck — no theatrics, no building to a climax, no persuasion.
- NOT a docs site — no raised or shadowed cards, no hover-lift, no clickable-feeling surfaces, no sticky table of contents.
- NOT a sparse memo — a restrained single-column page under-sells the work.
- No header chrome and no footer: open straight on the app's logo and name so it sits flush with the IDE.

### Constraints
- A single self-contained HTML file. Fonts may load from a CDN; everything else (CSS, the logo SVG) is inline.
- Responsive: fills the embedded panel width and collapses gracefully at narrow widths.`;

// Minimal first-pass scaffold. Carries only technical hygiene for the iframed
// render context — head boilerplate, the intentional `user-scalable=no`
// viewport, a font-link placeholder, and a base reset. No layout, sections,
// tokens, or design choices: those are the design expert's to compose freely.
const OVERVIEW_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- This renders inside an iframe in the IDE. Keep it a simple, self-contained
     static document — no scroll/zoom/accessibility scaffolding beyond this head.
     The user-scalable=no viewport is intentional; leave it. -->
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Build Overview</title>
<!-- SKIN: link the app's fonts here (CDN — e.g. Fontshare / Google Fonts). -->
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
</style>
</head>
<body>
<!-- Compose the Build Overview here. Layout, sections, type, and styling are
     yours — keep everything inline and self-contained, brand-skinned from the
     app's spec. -->
</body>
</html>`;

// Initial generation: no file yet — write a fresh document from the shell.
function initialDelivery(): string {
  return `### Your deliverable
Write the complete Build Overview to \`${OVERVIEW_FILE}\`. The file does not exist yet — start from this scaffold, which carries the technical hygiene for the iframed render context (keep the viewport meta and the reset). Layout, sections, type, and styling are yours to compose.

<overview_shell>
${OVERVIEW_SHELL}
</overview_shell>

Then reply with a one-line summary of what you wrote.`;
}

// Refresh: a file already exists — update it, preserving the skin.
function refreshDelivery(): string {
  return `### Your deliverable
The Build Overview already exists at \`${OVERVIEW_FILE}\`. Read it, then update it to reflect <overview_copy>, preserving its established skin — change only what the copy changed.

Then reply with a one-line summary of what you changed.`;
}

export const buildOverviewTool: Tool = {
  definition: {
    clearable: false,
    name: 'writeBuildOverview',
    description:
      "Generate or refresh the Build Overview — the project's home page in the Spec tab: a single-page, plain-language reference of everything the app actually contains, including the parts the user can't see (data stores, backend operations, access and roles, background jobs, seeded scenarios, the design system). You author the full copy: read the manifest and spec and state, plainly and exactly, what genuinely exists — real names and accurate counts — in calm, declarative, present-tense outcome language, with no persuasion or hype. Describe only what exists. Pass the complete copy as `content`; the design expert lays it out and skins it to the app's brand using your copy verbatim — it typesets your words, it does not rewrite them, so polish the copy before you pass it. Generate it at the end of a build and refresh it after meaningful work.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The full Build Overview copy you authored: everything the app contains, in plain present-tense outcome language, with real names and exact counts. The design expert lays this out and skins it to the brand verbatim — it styles your words, it does not rewrite them — so this should be the final copy.',
        },
      },
      required: ['content'],
    },
  },

  async execute(
    input: Record<string, any>,
    context?: ToolExecutionContext,
  ): Promise<string> {
    if (!context) {
      return 'Error: writeBuildOverview requires execution context for design expert delegation';
    }

    const content = ((input.content as string) ?? '').trim();
    if (!content) {
      return 'Error: writeBuildOverview requires non-empty `content` (the overview copy).';
    }

    // File present = refresh; absent = initial generation. This keys both the
    // delivery instructions (edit-in-place vs. write-fresh) and foreground vs.
    // background: the initial overview is shown at the reveal and must be
    // written before the turn ends; refreshes run detached.
    const exists = fs.existsSync(OVERVIEW_FILE);
    const task = `<overview_copy>${content}</overview_copy>

${DESIGN_BRIEF}

${exists ? refreshDelivery() : initialDelivery()}`;

    try {
      if (exists) {
        // Refresh in the background — return an ack now; the design expert
        // writes the file itself and reports via the completion queue.
        //
        // agent.ts gates registry cleanup on `tc.input.background`, and this
        // tool has no `background` schema field — but `input` IS `tc.input` by
        // reference, so setting it here keeps the detached render registered
        // (stoppable) and lets runSubAgent unregister it on completion, exactly
        // like a natively-backgrounded subagent tool.
        input.background = true;
        const result = await runDesignExpertRender(
          { task, background: true, reportingName: 'writeBuildOverview' },
          context,
        );
        context.subAgentMessages?.set(context.toolCallId, result.messages);
        return result.text;
      }

      // Initial build: foreground.
      const result = await runDesignExpertRender({ task }, context);
      context.subAgentMessages?.set(context.toolCallId, result.messages);
      if (!fs.existsSync(OVERVIEW_FILE)) {
        return `Error: the design expert did not write ${OVERVIEW_FILE}. Its reply was:\n${result.text}`;
      }
      return `Build overview written to ${OVERVIEW_FILE}. ${result.text}`;
    } catch (err: any) {
      return `Error generating build overview: ${err.message}`;
    }
  },
};
