/**
 * Filesystem operations for the product vision sub-agent.
 *
 * Handles writing/updating/deleting roadmap files in src/roadmap/.
 * Context loading (spec, roadmap) is in subagents/common/context.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { unifiedDiff } from '../../tools/_helpers/diff.js';

export { loadSpecContext, loadRoadmapContext } from '../common/context.js';

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

const ROADMAP_DIR = 'src/roadmap';

function formatRequires(requires: string[]): string {
  return requires.length === 0
    ? '[]'
    : `[${requires.map((r: string) => `"${r}"`).join(', ')}]`;
}

export async function executeVisionTool(
  name: string,
  input: Record<string, any>,
): Promise<string> {
  switch (name) {
    case 'writeRoadmapItem': {
      const {
        slug,
        name: itemName,
        description,
        effort,
        requires,
        body,
      } = input;
      const filePath = path.join(ROADMAP_DIR, `${slug}.md`);

      try {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });

        const oldContent = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, 'utf-8')
          : '';

        const content = `---
name: ${itemName}
type: roadmap
status: ${slug === 'mvp' ? 'in-progress' : 'not-started'}
description: ${description}
effort: ${effort}
requires: ${formatRequires(requires)}
---

${body}
`;
        fs.writeFileSync(filePath, content, 'utf-8');
        const lineCount = content.split('\n').length;
        const label = oldContent ? 'Updated' : 'Wrote';
        return `${label} ${filePath} (${lineCount} lines)\n${unifiedDiff(filePath, oldContent, content)}`;
      } catch (err: any) {
        return `Error writing ${filePath}: ${err.message}`;
      }
    }

    case 'updateRoadmapItem': {
      const { slug } = input;
      const filePath = path.join(ROADMAP_DIR, `${slug}.md`);

      try {
        if (!fs.existsSync(filePath)) {
          return `Error: ${filePath} does not exist`;
        }

        const oldContent = fs.readFileSync(filePath, 'utf-8');
        let content = oldContent;

        // Update frontmatter fields
        if (input.status) {
          content = content.replace(
            /^status:\s*.+$/m,
            `status: ${input.status}`,
          );
        }
        if (input.name) {
          content = content.replace(/^name:\s*.+$/m, `name: ${input.name}`);
        }
        if (input.description) {
          content = content.replace(
            /^description:\s*.+$/m,
            `description: ${input.description}`,
          );
        }
        if (input.effort) {
          content = content.replace(
            /^effort:\s*.+$/m,
            `effort: ${input.effort}`,
          );
        }
        if (input.requires) {
          content = content.replace(
            /^requires:\s*.+$/m,
            `requires: ${formatRequires(input.requires)}`,
          );
        }

        // Replace body if provided
        if (input.body) {
          const endOfFrontmatter = content.indexOf('---', 4);
          if (endOfFrontmatter !== -1) {
            const frontmatter = content.slice(0, endOfFrontmatter + 3);
            content = `${frontmatter}\n\n${input.body}\n`;
          }
        }

        // Append history entry
        if (input.appendHistory) {
          if (content.includes('## History')) {
            content = content.trimEnd() + `\n${input.appendHistory}\n`;
          } else {
            content =
              content.trimEnd() + `\n\n## History\n\n${input.appendHistory}\n`;
          }
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        const lineCount = content.split('\n').length;
        return `Updated ${filePath} (${lineCount} lines)\n${unifiedDiff(filePath, oldContent, content)}`;
      } catch (err: any) {
        return `Error updating ${filePath}: ${err.message}`;
      }
    }

    case 'deleteRoadmapItem': {
      const { slug } = input;
      const filePath = path.join(ROADMAP_DIR, `${slug}.md`);

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

    default:
      return `Error: unknown tool "${name}"`;
  }
}
