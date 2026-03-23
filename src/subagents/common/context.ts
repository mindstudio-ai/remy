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

/** Platform context for sub-agents that need to understand what's buildable. */
export function loadPlatformBrief(): string {
  return `<platform_brief>
## What is a MindStudio app?

A MindStudio app is a managed TypeScript project with three layers: a spec (natural language in src/), a backend contract (methods, tables, roles in dist/), and one or more interfaces (web, API, bots, cron, etc.). The spec is the source of truth; code is derived from it.

## What people build

- Business tools — dashboards, admin panels, approval workflows, data entry apps, internal tools with role-based access
- AI-powered apps — chatbots, content generators, document processors, image/video tools, AI agents that take actions
- Automations with no UI — cron jobs, webhook handlers, email processors, data sync pipelines
- Bots — Discord slash-command bots, Telegram bots, MCP tool servers for AI assistants
- Creative/interactive projects — games, interactive visualizations, generative art, portfolio sites
- API services — backend logic exposed as REST endpoints
- Simple static sites — no backend needed, just a web interface with a build step

An app can be any combination of these.

## Interfaces

Each interface type invokes the same backend methods. Methods don't know which interface called them.

- Web — any TypeScript project with a build command. Framework-agnostic (React, Vue, Svelte, vanilla, anything). The frontend SDK provides typed RPC to backend methods.
- API — auto-generated REST endpoints for every method
- Cron — scheduled jobs on a configurable interval
- Webhook — HTTP endpoints that trigger methods
- Discord — slash-command bots
- Telegram — message-handling bots
- Email — inbound email processing
- MCP — tool servers for AI assistants

## Backend

TypeScript running in a sandboxed environment. Any npm package can be installed. Key capabilities:

- Managed SQLite database with typed schemas and automatic migrations. Define a TypeScript interface, push, and the platform handles diffing and migrating.
- Built-in role-based auth. Define roles in the manifest, gate methods with auth.requireRole(). Platform handles sessions, tokens, user resolution.
- Sandboxed execution with npm packages pre-installed.
- Git-native deployment. Push to default branch to deploy.

## MindStudio SDK

The first-party SDK (@mindstudio-ai/agent) provides access to 200+ AI models (OpenAI, Anthropic, Google, Meta, Mistral, and more) and 1000+ integrations (email, SMS, Slack, HubSpot, Google Workspace, web scraping, image/video generation, media processing, and much more) with zero configuration — credentials are handled automatically in the execution environment. No API keys needed.

## What MindStudio apps are NOT good for

- Native mobile apps (iOS/Android). Mobile-responsive web apps are fine.
- Real-time multiplayer with persistent connections (no WebSocket support). Turn-based or async patterns work.
</platform_brief>`;
}
