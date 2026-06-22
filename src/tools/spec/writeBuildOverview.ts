/**
 * Build Overview generation.
 *
 * Remy authors the full plain-language copy of everything the build
 * produced — it just built the app, so it knows what is true — and this
 * tool hands that copy to the design expert, which lays it out and skins it
 * to the app's brand WITHOUT altering any fact, then writes the result to
 * src/overview.html (the project's home page in the Spec tab).
 *
 * Mirrors the pitch-deck flow (src/subagents/productVision/executor.ts ::
 * writePitchDeck), but parent-owned: Remy is the author, not a sub-agent.
 */

import fs from 'node:fs';
import type { Tool, ToolExecutionContext } from '../index.js';
import { designExpertTool } from '../../subagents/designExpert/index.js';

const OVERVIEW_FILE = 'src/overview.html';

// Design-expert-facing brief. Principles + constraints + the one hard rule —
// deliberately no prescribed section list or layout, so the model composes
// what fits each app.
const DESIGN_BRIEF = `We are building the Build Overview for this app — the home page of its Spec tab. It is a calm, dense, one-page reference of everything the app actually contains, including the parts the user can't see. It renders flush inside the Spec tab's content panel (the IDE supplies the surrounding nav).

Take the plain-language copy in <overview_copy> and lay it out and skin it into a single, beautiful, self-contained HTML document in the app's own brand. If <current_overview> is non-empty, use it as your starting point and preserve its established skin, updating only what the copy changed.

### The single hard rule
Preserve every fact in <overview_copy> exactly — every number, name, label, and claim. Do not add, drop, soften, reword, or invent any fact. You own layout, typography, and visual design only; the substance and the words are fixed. A single wrong number breaks this document's entire purpose.

### What it is (and is not)
- A typeset reference dossier: composed, dense, a little cool — substantial at a glance, then readable. Density communicates substance; sparse and airy reads as "not much here."
- Brand-skinned: pull the palette, type system, and a single accent from the app's spec. The accent leads labels and figures; it is a mark, not a fill.
- NOT a slide deck — no theatrics, no building to a climax, no persuasion.
- NOT a docs site — no raised or shadowed cards, no hover-lift, no clickable-feeling surfaces, no sticky table of contents.
- NOT a sparse memo — a restrained single-column page under-sells the work.
- No header chrome and no footer: open straight on the app's logo and name so it sits flush with the IDE.

### Constraints
- A single self-contained HTML file. Fonts may load from a CDN; everything else (CSS, the logo SVG) is inline.
- Responsive: fills the embedded panel width and collapses gracefully at narrow widths.

Respond only with the complete HTML file and absolutely no other text. Your response will be written directly to src/overview.html.`;

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

export const buildOverviewTool: Tool = {
  clearable: false,
  definition: {
    name: 'writeBuildOverview',
    description:
      "Generate or refresh the Build Overview — the project's home page in the Spec tab: a single-page, plain-language reference of everything the app actually contains, including the parts the user can't see (data stores, backend operations, access and roles, background jobs, seeded scenarios, the design system). You author the full copy: read the manifest and spec and state, plainly and exactly, what genuinely exists — real names and accurate counts — in calm, declarative, present-tense outcome language, with no persuasion or hype. Describe only what exists. Pass the complete copy as `content`; the design expert lays it out and skins it to the app's brand without altering any of your facts. Generate it at the end of a build and refresh it after meaningful work.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The full Build Overview copy you authored: everything the app contains, in plain present-tense outcome language, with real names and exact counts. The design expert lays this out and skins it to the brand without changing any fact.',
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

    try {
      const existing = fs.existsSync(OVERVIEW_FILE)
        ? fs.readFileSync(OVERVIEW_FILE, 'utf-8').trim()
        : '';
      const currentOverview = existing || OVERVIEW_SHELL;

      const task = `<overview_copy>${content}</overview_copy>

<current_overview>${currentOverview}</current_overview>

${DESIGN_BRIEF}`;

      const result = await designExpertTool.execute({ task }, context);

      // Extract the HTML from code fences if the design expert wrapped it.
      const htmlMatch = (result as string).match(
        /```(?:html|wireframe)\n([\s\S]*?)```/,
      );
      const html = htmlMatch ? htmlMatch[1].trim() : (result as string);
      fs.writeFileSync(OVERVIEW_FILE, html, 'utf-8');

      return 'Build overview written successfully to src/overview.html.';
    } catch (err: any) {
      return `Error generating build overview: ${err.message}`;
    }
  },
};
