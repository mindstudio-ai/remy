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

import { readAsset } from '../assets.js';
import { isLspConfigured } from '../tools/_helpers/lsp.js';
import {
  loadProjectInstructions,
  loadProjectManifest,
  loadProjectFileListing,
  loadSpecFileMetadata,
} from './static/projectContext.js';

/** Replace all {{path/to/file.md}} with the file contents. */
function resolveIncludes(template: string): string {
  const result = template.replace(/\{\{([^}]+)\}\}/g, (_, filePath) =>
    readAsset('prompt', filePath.trim()),
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
  onboardingState?: string,
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

  const now = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');

  const template = `
{{static/identity.md}}

Current date/time: ${now}

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

  <building_agent_interfaces>
  {{compiled/agent-interfaces.md}}
  </building_agent_interfaces>

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

<intake_mode_instructions>
{{static/intake.md}}
</intake_mode_instructions>

<spec_authoring_instructions>
{{static/authoring.md}}
</spec_authoring_instructions>

{{static/team.md}}

<code_authoring_instructions>
{{static/coding.md}}
${isLspConfigured() ? `<typescript_lsp>\n{{static/lsp.md}}\n</typescript_lsp>` : ''}
</code_authoring_instructions>

{{static/instructions.md}}

<project_onboarding>
New projects progress through four onboarding states. The user might skip this entirely and jump straight into working on the existing scaffold (which defaults to onboardingFinished), but ideally new projects move through each phase:

- **intake**: Gathering requirements. The project has scaffold code (a "hello world" starter) but it's not the user's app yet. Focus on understanding what they want to build, not on the existing code.
- **initialSpecAuthoring**: Writing and refining the first spec. The user can see it in the editor as it streams in and can give feedback to iterate on it. This phase covers both the initial draft and any back-and-forth refinement before code generation.
- **initialCodegen**: First code generation from the spec. The agent is generating methods, tables, interfaces, manifest updates, and scenarios. This can take a while and involves heavy tool use. The user sees a full-screen build progress view.
- **onboardingFinished**: The project is built and ready. Full development mode with all tools available. From here on, keep spec and code in sync as changes are made.

  <current_project_onboarding_state>
  ${onboardingState ?? 'onboardingFinished'}
  </current_project_onboarding_state>
</project_onboarding>

<view_context>
The user is currently in ${viewContext?.mode ?? 'code'} mode.
${viewContext?.activeFile ? `Active file: ${viewContext.activeFile}` : ''}
</view_context>
`;

  return resolveIncludes(template);
}
