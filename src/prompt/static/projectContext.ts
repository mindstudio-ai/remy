/**
 * Project-level context — reads from the working directory at runtime.
 *
 * Loads agent instruction files (CLAUDE.md etc.), the project manifest,
 * and a top-level file listing. These are appended to the system prompt
 * so the agent has immediate awareness of the project it's working in.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Load the project manifest (mindstudio.json) from cwd.
 * Returns formatted prompt section, or empty string if not found.
 */
export function loadProjectManifest(): string {
  try {
    const manifest = fs.readFileSync('mindstudio.json', 'utf-8');
    return `\n## Project Manifest (mindstudio.json)\n\`\`\`json\n${manifest}\n\`\`\``;
  } catch {
    return '';
  }
}

/**
 * Load spec file metadata from src/.
 * Walks src/ for .md files, extracts YAML frontmatter (name, description),
 * and returns a formatted listing so the agent knows the spec shape.
 */
export function loadSpecFileMetadata(): string {
  try {
    const files = walkMdFiles('src');
    if (files.length === 0) {
      return '';
    }

    const entries: string[] = [];
    for (const filePath of files) {
      const { name, description, type } = parseFrontmatter(filePath);
      let line = `- ${filePath}`;
      if (name) {
        line += ` — "${name}"`;
      }
      if (type) {
        line += ` (${type})`;
      }
      if (description) {
        line += ` — ${description}`;
      }
      entries.push(line);
    }

    return `\n## Spec Files\n${entries.join('\n')}`;
  } catch {
    return '';
  }
}

function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkMdFiles(full));
      } else if (entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return results.sort();
}

function parseFrontmatter(filePath: string): {
  name: string;
  description: string;
  type: string;
} {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { name: '', description: '', type: '' };
    }

    const fm = match[1];
    const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const type = fm.match(/^type:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return { name, description, type };
  } catch {
    return { name: '', description: '', type: '' };
  }
}

/**
 * Load plan status from .remy-plan.md if it exists.
 * Returns a behavioral prompt section based on the plan's frontmatter status.
 */
export function loadPlanStatus(): string {
  try {
    const content = fs.readFileSync('.remy-plan.md', 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    const status = match?.[1]?.match(/^status:\s*(.+)$/m)?.[1]?.trim();

    if (status === 'pending') {
      return `\n<pending_plan>\nYou have a pending implementation plan in .remy-plan.md awaiting user approval. Do NOT begin implementing the plan until the user approves it. You may continue chatting, answering questions, and revising the plan if asked. To revise, call writePlan again with updated content. When the user approves the plan (via chat or any other signal), call updatePlanStatus with status "approved" before beginning any implementation work.\n</pending_plan>`;
    }
    if (status === 'approved') {
      return `\n<approved_plan>\nThe user has approved your implementation plan in .remy-plan.md. You may reference it during implementation. Delete the file when you have finished all planned work.\n</approved_plan>`;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Load a top-level file listing from cwd.
 * Returns formatted prompt section, or empty string on failure.
 */
export function loadProjectFileListing(): string {
  try {
    const entries = fs.readdirSync('.', { withFileTypes: true });
    const listing = entries
      .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) {
          return -1;
        }
        if (!a.isDirectory() && b.isDirectory()) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');

    return `\n## Project Files\n\`\`\`\n${listing}\n\`\`\``;
  } catch {
    return '';
  }
}
