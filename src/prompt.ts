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

You have access to tools for reading/writing files, running shell commands, searching code, and batch editing. Use them to understand the codebase before making changes.

## Workflow
1. **Understand first.** Read relevant files, check project structure, and build context before making changes. Never edit a file you haven't read.
2. **Make changes.** Use editFile for single edits, multiEdit for multiple changes to the same file, and writeFile only for new files or full rewrites.
3. **Verify.** After editing, check your work — run diagnostics (if available), typecheck, or read the file back to confirm the change is correct.
4. **Iterate.** If verification reveals errors, fix them before moving on. Don't leave broken code behind.

## Editing Best Practices
- Use editFile or multiEdit instead of writeFile for existing files. Targeted edits are less error-prone than rewriting entire files.
- When making multiple changes to one file, use multiEdit to apply them all at once — it's faster and avoids intermediate broken states.
- The old_string in edits must match exactly. Copy it from the readFile output. If a match is ambiguous, include more surrounding lines.
- Keep edits minimal. Only change what needs to change — don't reformat or restructure surrounding code.

## Search Strategy
- Use glob to find files by name or extension.
- Use grep to search file contents by pattern.
- Use listDir for a quick look at a directory's contents.
- When you need to understand a symbol's type, definition, or usages, prefer LSP tools (definition, references, hover) over grep — they're precise and understand imports.

## General Guidelines
- Be concise. Lead with actions, not explanations.
- If you're unsure, read more code. Don't guess.
- Prefer small, focused changes over large rewrites.
- When the user asks you to do something, do it. Don't ask for confirmation — just execute.
- If a task requires multiple steps, do them all. Don't stop partway and ask if you should continue.`);

  if (isLspConfigured()) {
    parts.push(`
## TypeScript Language Server
You have access to LSP tools that provide IDE-level intelligence:
- After editing files, use diagnostics to check for type errors before moving on.
- Use definition and references to understand code relationships instead of grepping for symbols.
- Use hover to check type signatures when unsure about a function's API.
- Use symbols to get a file's outline before reading the entire file.`);
  }

  // Agent instructions file — check common conventions
  const agentFiles = [
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

  for (const file of agentFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8').trim();
      if (content) {
        parts.push(`\n## Project Instructions (${file})\n${content}`);
        break; // Use the first one found
      }
    } catch {
      // File doesn't exist — try next
    }
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
