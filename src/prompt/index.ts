/**
 * System prompt builder.
 *
 * A single template string with {{filename}} includes. The template
 * is built with standard JS interpolation for dynamic parts, then
 * a simple processor resolves the file includes.
 *
 * Ordering follows Anthropic's long-context guidance: identity at the
 * top (primacy), reference docs in the middle, behavioral instructions
 * at the bottom (recency — what we most need the model to follow).
 */

import fs from 'node:fs';
import path from 'node:path';
import { isLspConfigured } from '../tools/_helpers/lsp.js';
import {
  loadProjectInstructions,
  loadProjectManifest,
  loadProjectFileListing,
  loadSpecFileMetadata,
} from './static/projectContext.js';

const PROMPT_DIR =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function requireFile(filePath: string): string {
  const full = path.join(PROMPT_DIR, filePath);
  try {
    return fs.readFileSync(full, 'utf-8').trim();
  } catch {
    throw new Error(`Required prompt file missing: ${full}`);
  }
}

/** Replace all {{path/to/file.md}} with the file contents. */
function resolveIncludes(template: string): string {
  const result = template.replace(/\{\{([^}]+)\}\}/g, (_, filePath) =>
    requireFile(filePath.trim()),
  );
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

export interface ViewContext {
  mode:
    | 'intake'
    | 'preview'
    | 'spec'
    | 'code'
    | 'databases'
    | 'scenarios'
    | 'logs';
  openFiles?: string[];
  activeFile?: string;
}

export function buildSystemPrompt(
  projectHasCode?: boolean,
  viewContext?: ViewContext,
): string {
  const projectContext = [
    loadProjectInstructions(),
    loadProjectManifest(),
    loadSpecFileMetadata(),
    loadProjectFileListing(),
  ]
    .filter(Boolean)
    .join('\n');

  const now = new Date().toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const template = `
{{static/identity.md}}

The current date is ${now}.

<platform_docs>
  <platform>
  {{compiled/platform.md}}
  </platform>

  <manifest>
  {{compiled/manifest.md}}
  </manifest>

  <tables>
  {{compiled/tables.md}}
  </tables>

  <methods>
  {{compiled/methods.md}}
  </methods>

  <auth>
  {{compiled/auth.md}}
  </auth>

  <dev_and_deploy>
  {{compiled/dev-and-deploy.md}}
  </dev_and_deploy>

  <design>
  {{compiled/design.md}}
  </design>

  <media_cdn>
  {{compiled/media-cdn.md}}
  </media_cdn>

  <interfaces>
  {{compiled/interfaces.md}}
  </interfaces>

  <scenarios>
  {{compiled/scenarios.md}}
  </scenarios>
</platform_docs>

<mindstudio_agent_sdk_docs>
  {{compiled/sdk-actions.md}}
</mindstudio_agent_sdk_docs>

<mindstudio_flavored_markdown_spec_docs>
  {{compiled/msfm.md}}
</mindstudio_flavored_markdown_spec_docs>

<project_context>
${projectContext}
</project_context>

${isLspConfigured() ? `<lsp>\n{{static/lsp.md}}\n</lsp>` : ''}

{{static/intake.md}}

{{static/authoring.md}}

{{static/instructions.md}}

<current_authoring_mode>
${projectHasCode ? 'Project has code - keep code and spec in sync.' : 'Project does not have code yet - focus on writing the spec.'}
</current_authoring_mode>

<view_context>
The user is currently in ${viewContext?.mode ?? 'code'} mode.
${viewContext?.activeFile ? `Active file: ${viewContext.activeFile}` : ''}
</view_context>
`;

  return resolveIncludes(template);
}
