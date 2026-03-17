/**
 * Project-level context — reads from the working directory at runtime.
 *
 * Loads agent instruction files (CLAUDE.md etc.), the project manifest,
 * and a top-level file listing. These are appended to the system prompt
 * so the agent has immediate awareness of the project it's working in.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Files checked for project-level agent instructions, in priority order. */
const AGENT_INSTRUCTION_FILES = [
  'CLAUDE.md',
  'claude.md',
  '.claude/instructions.md',
  'AGENTS.md',
  'agents.md',
  '.agents.md',
  'COPILOT.md',
  'copilot.md',
  '.copilot-instructions.md',
  '.github/copilot-instructions.md',
  'REMY.md',
  'remy.md',
  '.cursorrules',
  '.cursorules',
];

/**
 * Load project-level agent instructions from the first matching file.
 * Returns formatted prompt section, or empty string if none found.
 */
export function loadProjectInstructions(): string {
  for (const file of AGENT_INSTRUCTION_FILES) {
    try {
      const content = fs.readFileSync(file, 'utf-8').trim();
      if (content) {
        return `\n## Project Instructions (${file})\n${content}`;
      }
    } catch {
      // File doesn't exist — try next
    }
  }
  return '';
}

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
      const { name, description } = parseFrontmatter(filePath);
      let line = `- ${filePath}`;
      if (name) {
        line += ` — "${name}"`;
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
} {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { name: '', description: '' };
    }

    const fm = match[1];
    const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return { name, description };
  } catch {
    return { name: '', description: '' };
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
