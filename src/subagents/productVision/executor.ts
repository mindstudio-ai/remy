/**
 * Filesystem operations for the product vision sub-agent.
 *
 * Simple file tools scoped to src/roadmap/, plus design expert
 * delegation for the pitch deck.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolExecutionContext } from '../../tools/index.js';
import { designExpertTool } from '../designExpert/index.js';

export { loadSpecContext, loadRoadmapContext } from '../common/context.js';

const ROADMAP_DIR = 'src/roadmap';

function resolve(filePath: string): string {
  return path.join(ROADMAP_DIR, filePath);
}

export async function executeVisionTool(
  name: string,
  input: Record<string, any>,
  context?: ToolExecutionContext,
): Promise<string> {
  switch (name) {
    case 'listFiles': {
      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });
        const files = fs.readdirSync(ROADMAP_DIR).sort();
        return files.length > 0 ? files.join('\n') : '(empty)';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'readFile': {
      const filePath = resolve(input.path);
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch (err: any) {
        return `Error reading ${filePath}: ${err.message}`;
      }
    }

    case 'writeFile': {
      const filePath = resolve(input.path);
      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });
        fs.writeFileSync(filePath, input.content, 'utf-8');
        return `Wrote ${filePath} (${input.content.split('\n').length} lines)`;
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
        fs.unlinkSync(filePath);
        return `Deleted ${filePath}`;
      } catch (err: any) {
        return `Error deleting ${filePath}: ${err.message}`;
      }
    }

    case 'writePitchDeck': {
      if (!context) {
        return 'Error: writePitchDeck requires execution context for design expert delegation';
      }

      const filePath = resolve('pitch.html');

      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });

        const existingHtml = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, 'utf-8').trim()
          : '';

        let task = `Build a self-contained responsive HTML slide deck for this app's pitch. Use the app's brand identity (fonts, colors, logos from the spec). Arrow key navigation between slides. The deck should feel like a polished startup pitch — make it beautiful and exciting. Keep it clean and beautiful - less is more with these sorts of things. One file HTML - it will be rendered in an iframe.\n\n<pitch_content>${input.prompt}</pitch_content>`;

        if (existingHtml) {
          task += `\n\nThe current pitch deck HTML is below. Refine and update it rather than starting from scratch — preserve the existing design and structure where it still works, and update the content and slides to reflect the new pitch.\n\n<existing_pitch_html>${existingHtml}</existing_pitch_html>`;
        }

        task += `\n\nRespond only with the HTML of the deck and absolutely no other text - your response will be written directly to a file.`;

        const result = await designExpertTool.execute({ task }, context);

        // Extract HTML from code fences if present
        const htmlMatch = (result as string).match(
          /```(?:html|wireframe)\n([\s\S]*?)```/,
        );
        const html = htmlMatch ? htmlMatch[1].trim() : (result as string);

        fs.writeFileSync(filePath, html, 'utf-8');
        return `Wrote ${filePath} (${html.split('\n').length} lines)`;
      } catch (err: any) {
        return `Error generating pitch deck: ${err.message}`;
      }
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
