/**
 * Shared context loaders for sub-agents.
 *
 * Loads spec files and roadmap files from disk and formats them
 * as XML blocks for injection into sub-agent system prompts.
 */

import fs from 'node:fs';
import path from 'node:path';

function walkMdFiles(dir: string, skip?: Set<string>): string[] {
  const files: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip?.has(entry.name)) {
          files.push(...walkMdFiles(full, skip));
        }
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

function loadFilesAsXml(dir: string, tag: string, skip?: Set<string>): string {
  const files = walkMdFiles(dir, skip);
  if (files.length === 0) {
    return '';
  }

  const sections = files
    .map((f) => {
      try {
        const content = fs.readFileSync(f, 'utf-8').trim();
        return `<file path="${f}">\n${content}\n</file>`;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return `<${tag}>\n${sections.join('\n\n')}\n</${tag}>`;
}

/** Load all spec files from src/ (excluding roadmap). */
export function loadSpecContext(): string {
  return loadFilesAsXml('src', 'spec_files', new Set(['roadmap']));
}

/** Load all roadmap files from src/roadmap/. */
export function loadRoadmapContext(): string {
  return loadFilesAsXml('src/roadmap', 'current_roadmap');
}
