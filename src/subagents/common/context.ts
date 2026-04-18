/**
 * Shared context loaders for sub-agents.
 *
 * Provides lightweight file indexes (frontmatter only) for system
 * prompts. Subagents use read tools to access full contents on demand.
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
  return files.sort();
}

function parseFrontmatter(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return {};
    }
    const fm: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const sep = line.indexOf(':');
      if (sep > 0) {
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + 1).trim();
        fm[key] = val;
      }
    }
    return fm;
  } catch {
    return {};
  }
}

/**
 * Lightweight index of spec files (frontmatter only).
 * Subagents use readFile to access full contents on demand.
 */
export function loadSpecIndex(): string {
  const files = walkMdFiles('src', new Set(['roadmap']));
  if (files.length === 0) {
    return '';
  }

  const lines = files.map((f) => {
    const fm = parseFrontmatter(f);
    let line = `- ${f}`;
    if (fm.name) {
      line += ` — "${fm.name}"`;
    }
    if (fm.description) {
      line += ` — ${fm.description}`;
    }
    return line;
  });

  return `<spec_files>\n## Project Spec Files\nUse readFile to access full contents.\n\n${lines.join('\n')}\n</spec_files>`;
}

/**
 * Lightweight index of roadmap files (frontmatter + lane summary).
 * Subagents use readFile to access full contents on demand.
 */
export function loadRoadmapIndex(): string {
  const parts: string[] = [];

  // Lane summary from index.json
  try {
    const indexJson = JSON.parse(
      fs.readFileSync('src/roadmap/index.json', 'utf-8'),
    );
    if (indexJson.lanes?.length > 0) {
      const laneLines = indexJson.lanes.map(
        (l: { name: string; narrative?: string; items?: string[] }) =>
          `- **${l.name}**: ${l.narrative || ''} (${l.items?.length || 0} items)`,
      );
      parts.push(`### Lanes\n${laneLines.join('\n')}`);
    }
    if (indexJson.standalone?.length > 0) {
      parts.push(
        `### Standalone\n${indexJson.standalone.map((s: string) => `- ${s}`).join('\n')}`,
      );
    }
  } catch {
    // No index.json
  }

  // Item frontmatter
  const files = walkMdFiles('src/roadmap');
  if (files.length > 0) {
    const lines = files.map((f) => {
      const fm = parseFrontmatter(f);
      let line = `- ${f}`;
      if (fm.name) {
        line += ` — "${fm.name}"`;
      }
      if (fm.status) {
        line += ` (${fm.status})`;
      }
      if (fm.description) {
        line += ` — ${fm.description}`;
      }
      return line;
    });
    parts.push(`### Items\n${lines.join('\n')}`);
  }

  if (parts.length === 0) {
    return '';
  }
  return `<current_roadmap>\n## Roadmap\nUse readFile to access full contents.\n\n${parts.join('\n\n')}\n</current_roadmap>`;
}

/** Platform context for sub-agents that need to understand what's buildable. */
export function loadPlatformBrief(): string {
  return `<platform_brief>
## What is a MindStudio app?

A MindStudio app is a managed full-stack TypeScript project with three layers: a spec (natural language in src/), a backend contract (methods, tables, roles in dist/), and one or more interfaces (web, API, bots, cron, etc.). The spec is the source of truth; code is derived from it.

This is a capable, stable platform used in production by 100k+ users. Build with confidence — you're building production-grade apps, not fragile prototypes.

## What people build

- Business tools — client portals, approval workflows, admin panels with role-based access
- AI-powered apps — document processors, image/video tools, content generators, conversational agents that take actions
- Full-stack web apps — social platforms, membership sites, marketplaces, booking systems, community hubs — multi-user apps with auth, data, UI
- Automations with no UI — cron jobs, webhook handlers, email processors, data sync pipelines
- Marketing & launch pages — landing pages, waitlist pages with referral mechanics, product sites with scroll animations
- Bots — Discord slash-command bots, Telegram bots, MCP tool servers for AI assistants
- Creative/interactive projects — browser games with p5.js or Three.js, interactive visualizations, generative art, portfolio sites
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
- Agent — conversational LLM interface with tool access to backend methods

## Backend

TypeScript running in a sandboxed environment. Any npm package can be installed. Key capabilities:

- Managed SQLite database with typed schemas and automatic migrations. Define a TypeScript interface, push, and the platform handles diffing and migrating.
- Built-in app-managed auth. Opt-in via manifest — developer builds login UI, platform handles verification codes (email-code, sms-code) and cookie sessions. API key auth for programmatic access. No OAuth, no social login (no Apple, Google, Facebook, or GitHub sign-in). Backend methods use auth.requireRole() for access control.
- Encrypted secrets with separate dev/prod values, injected as process.env. For third-party service credentials not covered by the SDK.
- Git-native deployment. Push to default branch to deploy.

## MindStudio SDK

The first-party SDK (@mindstudio-ai/agent) provides access to 200+ AI models (OpenAI, Anthropic, Google, Meta, Mistral, and more) and 1000+ integrations (email, SMS, Slack, HubSpot, Google Workspace, web scraping, image/video generation, media processing, and much more) with zero configuration — credentials are handled automatically in the execution environment. No API keys needed. This SDK is robust and battle-tested in production.

## What MindStudio apps are NOT good for

- Native mobile apps (iOS/Android). Mobile-responsive web apps are fine.
- Real-time multiplayer with persistent connections (no WebSocket support). Turn-based or async patterns work.
</platform_brief>`;
}
