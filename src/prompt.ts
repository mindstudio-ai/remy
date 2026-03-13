/**
 * System prompt builder.
 *
 * Assembles the system prompt from:
 *   1. Base instructions (agent identity, guidelines)
 *   2. Project manifest (mindstudio.json from cwd, if present)
 *   3. Project file listing (top-level directory)
 *
 * This is the generic POC version. Later this becomes the full
 * platform-knowledge prompt with SDK docs, table/method patterns,
 * interface config reference, etc.
 */

import fs from 'node:fs';
import { isLspConfigured } from './tools/lsp.js';

export function buildSystemPrompt(): string {
  const parts: string[] = [];

  // Base instructions
  parts.push(`You are Remy, a coding agent for MindStudio apps. You help developers build, modify, and debug their MindStudio projects.

You have access to tools for reading/writing files, running shell commands, and searching code. Use them to understand the codebase before making changes.

Guidelines:
- Always read relevant files before editing them.
- Use editFile for targeted changes instead of rewriting entire files.
- After making changes, verify them (e.g., run typecheck or read the file back).
- Be concise in your responses. Lead with actions, not explanations.
- If you're unsure about something, read more code to build context.`);

  if (isLspConfigured()) {
    parts.push(`
## TypeScript Language Server
You have access to LSP tools that provide IDE-level intelligence:
- After editing files, use diagnostics to check for type errors before moving on.
- Use definition and references to understand code relationships instead of grepping for symbols.
- Use hover to check type signatures when unsure about a function's API.
- Use symbols to get a file's outline before reading the entire file.`);
  }

  // Project context: mindstudio.json (gives the agent awareness of
  // the app's methods, tables, roles, and interfaces)
  try {
    const manifest = fs.readFileSync('mindstudio.json', 'utf-8');
    parts.push(
      `\n## Project Manifest (mindstudio.json)\n\`\`\`json\n${manifest}\n\`\`\``,
    );
  } catch {
    // No mindstudio.json in cwd — not a MindStudio project, or
    // the user is in a different directory. That's fine.
  }

  // Project context: top-level file listing (gives the agent a map
  // of the project before it needs to use tools)
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

    parts.push(`\n## Project Files\n\`\`\`\n${listing}\n\`\`\``);
  } catch {
    // Can't read cwd — shouldn't happen, but don't crash
  }

  return parts.join('\n');
}
