/**
 * Tool executor for the product vision sub-agent.
 *
 * Handles scoped write tools for src/roadmap/ and pitch deck
 * delegation to the design expert. Read tools (readFile, listDir,
 * grep, glob) are handled by the main agent's executeTool via
 * the common tools fallback in index.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { unifiedDiff } from '../../tools/_helpers/diff.js';
import type { ToolExecutionContext } from '../../tools/index.js';
import { runDesignExpertRender } from '../designExpert/index.js';
import { readAsset } from '../../assets.js';

export { loadSpecIndex, loadRoadmapIndex } from '../common/context.js';

const ROADMAP_DIR = 'src/roadmap';
const PITCH_DECK_SHELL = readAsset(
  'subagents/productVision',
  'pitch-deck-shell.html',
);

function resolve(filePath: string): string {
  return path.join(ROADMAP_DIR, filePath);
}

export async function executeVisionTool(
  name: string,
  input: Record<string, any>,
  context?: ToolExecutionContext,
): Promise<string> {
  switch (name) {
    case 'writeFile': {
      const filePath = resolve(input.path);
      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });

        let oldContent: string | null = null;
        try {
          oldContent = fs.readFileSync(filePath, 'utf-8');
        } catch {
          // New file
        }

        fs.writeFileSync(filePath, input.content, 'utf-8');
        const lineCount = input.content.split('\n').length;
        const label = oldContent !== null ? 'Wrote' : 'Created';
        return `${label} ${filePath} (${lineCount} lines)\n${unifiedDiff(filePath, oldContent ?? '', input.content)}`;
      } catch (err: any) {
        return `Error writing ${filePath}: ${err.message}`;
      }
    }

    case 'deleteFile': {
      const filePath = resolve(input.path);
      try {
        if (!fs.existsSync(filePath)) {
          return `Error: ${filePath} does not exist`;
        }
        const oldContent = fs.readFileSync(filePath, 'utf-8');
        fs.unlinkSync(filePath);
        return `Deleted ${filePath}\n${unifiedDiff(filePath, oldContent, '')}`;
      } catch (err: any) {
        return `Error deleting ${filePath}: ${err.message}`;
      }
    }

    case 'writePitchDeck': {
      if (!context) {
        return 'Error: writePitchDeck requires execution context for design expert delegation';
      }

      const filePath = resolve('pitch.html'); // src/roadmap/pitch.html

      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });

        // File present = refresh (read + edit in place); absent = initial
        // (write fresh from the shell). mtime lets us confirm a foreground
        // refresh actually wrote something.
        const exists = fs.existsSync(filePath);
        const before = exists ? fs.statSync(filePath).mtimeMs : null;

        const delivery = exists
          ? `### Your deliverable
The pitch deck already exists at \`${filePath}\`. Read it, then update it for the new <pitch_content>, keeping the presentation scaffolding intact — change only what needs to change.

Reply with a one-line summary of what you changed — not the HTML.`
          : `### Your deliverable
Write the complete pitch deck to \`${filePath}\`. It does not exist yet — start from this scaffold, keeping its progress bar, chevron navigation, keyboard navigation, and transition mechanics intact:

<pitch_deck_shell>
${PITCH_DECK_SHELL}
</pitch_deck_shell>

Reply with a one-line summary of what you wrote — not the HTML.`;

        const task = `
<pitch_content>${input.task}</pitch_content>

We are building the pitch deck for the app. Using the provided <pitch_content>, as well as the app's spec data, think about what would make a compelling, interactive, self-contained horizontally-scrolling HTML slide deck for this product. Keep it simple, clean, powerful. Giant text, large logo, big, bold stats and claims. Edit the content as necessary to create the most impactful, bold, and beautiful slides. This should not feel like an essay, and it should not feel like a landing page — it should feel like a modern interactive presentation that leaves the user wowed by the product and excited about its future.

Maintain the bones of the presentation scaffolding. Always keep the progress bar, chevron navigation, and keyboard navigation - they are part of the scaffold.

### Rules
- The deck must be a single HTML file — it will be rendered in an iframe.
- Must look beautiful on desktop and mobile.
- Animation between slides must be seamless, no flicker or flashing. For reveal animations: hide elements with CSS \`opacity: 0\` only (no transform in CSS). Let GSAP handle transforms via inline styles and never use \`clearProps\`. Use the existing scaffold, do not write your own transition logic or slide mechanics.
- Be bold and impactful. Use images from the spec or generate new images when needed.
- Code must be clean, bug free, and easy to parse. Use GSAP for animations. Pay close attention to layout and alignment to make sure everything is perfect.
- Keep the progress bar and edge chevrons from the shell — they are part of the navigation UX.

${delivery}`;

        // Foreground within productVision. Refresh-in-background is a
        // productVision-level decision (the main agent backgrounds the whole
        // productVision call) — we do not nest a backgrounded expert here.
        const result = await runDesignExpertRender({ task }, context);
        context.subAgentMessages?.set(context.toolCallId, result.messages);

        if (!fs.existsSync(filePath)) {
          return `Error: the design expert did not write ${filePath}. Its reply was:\n${result.text}`;
        }
        if (before !== null && fs.statSync(filePath).mtimeMs === before) {
          return `Error: the pitch deck at ${filePath} was not modified. The design expert's reply was:\n${result.text}`;
        }

        return `Pitch deck written to ${filePath}. ${result.text}`;
      } catch (err: any) {
        return `Error generating pitch deck: ${err.message}`;
      }
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
