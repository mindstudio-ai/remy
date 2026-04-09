/**
 * Filesystem operations for the product vision sub-agent.
 *
 * File tools scoped to src/roadmap/, plus design expert
 * delegation for the pitch deck. Output formats match the
 * main agent's readFile/writeFile/listDir for consistent
 * frontend rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
import { unifiedDiff } from '../../tools/_helpers/diff.js';
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
    case 'listDir': {
      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });
        const entries = fs.readdirSync(ROADMAP_DIR, { withFileTypes: true });
        const lines: string[] = [];
        // Directories first, then files — matches main listDir
        const dirs = entries
          .filter((e) => e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name));
        const files = entries
          .filter((e) => !e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const d of dirs) {
          lines.push(`${d.name}/`);
        }
        for (const f of files) {
          const stat = fs.statSync(resolve(f.name));
          const size =
            stat.size < 1024
              ? `${stat.size}B`
              : `${(stat.size / 1024).toFixed(1)}KB`;
          lines.push(`${f.name}  (${size})`);
        }
        return lines.length > 0 ? lines.join('\n') : '(empty)';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'readFile': {
      const filePath = resolve(input.path);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const numbered = lines
          .map((line, i) => `${String(i + 1).padStart(4)} ${line}`)
          .join('\n');
        return numbered;
      } catch (err: any) {
        return `Error reading ${filePath}: ${err.message}`;
      }
    }

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

      const filePath = resolve('pitch.html');

      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });

        const existingHtml = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, 'utf-8').trim()
          : '';

        let task = `
<pitch_content>${input.task}</pitch_content>

We are building the pitch deck for the app. Using the provided <pitch_content>, as well as the app's spec data, think about what would make a compelling, interactive, self-contained HTML slide deck for this product. Keep it simple, clean, powerful. Giant text, large logo, big, bold stats and claims. Edit the content as necessary to create the most impactful, bold, and beautiful slides. This should not feel text heavy, and it should not feel like a landing page - it should feel like a modern interactive presentation that leaves the user wowed by the product.

### Rules
- The deck must be a single HTML file - it will be rendered in an iFrame.
- Keep it simple: 100svh 100vw slides that scroll using browser scrolling. Must look beautiful on desktop and mobile - use all the principles you know about designing effective landing pages to make a beautiful deck.
- The deck must support keyboard navigation up and down, and big clickable arrows to move up and down.
- Animation between slides must be seamless, no flicker or flashing
- Be bold and impactful. Do not be wordy or verbose, no one reads decks with too many words.
- Keep it simple: 5-7 slides max. No fluff, just imapct.
- Code must be clean, bug free, and easy-to-parse. Nothing complex.
`;

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

        const oldContent = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, 'utf-8')
          : '';

        fs.writeFileSync(filePath, html, 'utf-8');
        const lineCount = html.split('\n').length;
        const label = oldContent ? 'Wrote' : 'Created';
        return `${label} ${filePath} (${lineCount} lines)\n${unifiedDiff(filePath, oldContent, html)}`;
      } catch (err: any) {
        return `Error generating pitch deck: ${err.message}`;
      }
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
