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
import {
  loadProjectManifest,
  loadProjectFileListing,
  loadSpecFileMetadata,
  loadPlanStatus,
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
    loadProjectManifest(),
    loadSpecFileMetadata(),
    loadProjectFileListing(),
  ]
    .filter(Boolean)
    .join('\n');

  const now = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const template = `
{{static/identity.md}}

Current date: ${now}

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

  <secrets>
  {{compiled/secrets.md}}
  </secrets>
</platform_docs>

<mindstudio_agent_sdk_docs>
  {{compiled/sdk-actions.md}}

  {{compiled/task-agents.md}}
</mindstudio_agent_sdk_docs>

<mindstudio_flavored_markdown_spec_docs>
  {{compiled/msfm.md}}
</mindstudio_flavored_markdown_spec_docs>

<intake_mode_instructions>
  {{static/intake.md}}
</intake_mode_instructions>

<spec_authoring_instructions>
  {{static/authoring.md}}
</spec_authoring_instructions>

<team>
  {{static/team.md}}
</team>

<code_authoring_instructions>
{{static/coding.md}}

<typescript_lsp>
{{static/lsp.md}}
</typescript_lsp>
</code_authoring_instructions>

<conversation_summaries>
Your conversation history may include <prior_conversation_summary> blocks in the user's messages. These are automated summaries of earlier messages that have been compacted to save context space. The user does not see this summary, they see the full conversation history in their UI. Treat the summary as ground truth for what happened before, but do not reference it directly to the user ("as mentioned in the summary..."). Just continue naturally as if you remember the prior work.

Old tool results are periodically cleared from the conversation to save context space. This is automatic and expected — you don't need to note down or preserve information from tool results. If you need to reference something from an earlier tool call, just re-read the file or re-run the query.
</conversation_summaries>

<project_onboarding>
New projects progress through three onboarding states. The user might skip this entirely and jump straight into working on the existing scaffold (which defaults to onboardingFinished), but ideally new projects move through each phase:

- **intake**: Gathering requirements. The project has scaffold code (a "hello world" starter) but it's not the user's app yet. Focus on understanding what they want to build, not on the existing code. Intake ends with a plan proposal via writePlan.
- **building**: The user approved the initial plan. The agent is writing the spec and building the app. This can take a while and involves heavy tool use (spec authoring, design expert consultation, code generation, verification, polishing).
- **buildComplete**: The build is done. The frontend is showing the user a reveal experience (pitch deck, app preview). The agent does not need to do anything in this state; the frontend advances to onboardingFinished when the user is ready.
- **onboardingFinished**: The project is built and ready. Full development mode with all tools available. From here on, keep spec and code in sync as changes are made.
</project_onboarding>

{{static/instructions.md}}

<!-- cache_breakpoint -->

<current_project_onboarding_state>
  ${onboardingState ?? 'onboardingFinished'}
</current_project_onboarding_state>

<project_context>
${projectContext}
</project_context>

<view_context>
The user is currently in ${viewContext?.mode ?? 'code'} mode.
${viewContext?.activeFile ? `Active file: ${viewContext.activeFile}` : ''}
</view_context>

${loadPlanStatus()}
`;

  return resolveIncludes(template);
}
