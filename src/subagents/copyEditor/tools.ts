/**
 * Tool definitions for the copy editor sub-agent.
 * Read-only — it's a text transform, not a researcher. The read tools let
 * it pull brand voice / check copy consistency from the repo. Withholding
 * everything else (web, bash, SDK, other subagents) is also the recursion
 * guard: copyEditor can't call the design expert (or itself) back.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';

export const COPY_EDITOR_TOOLS: ToolDefinition[] = [...COMMON_READ_TOOLS];
