/**
 * Tool definitions for the existing-project reviewer.
 *
 * Common read tools + bash. Bash is what unpacks archives in scratch space,
 * strips the noise, and lands the trimmed tree in src/.user-uploads/ (and
 * shallow-clones a public repo when one is given). No web tools: the review
 * is about what the user brought, not what is out there. Every call resolves
 * by name through the main registry. Bash stays last — tool order is part of
 * the sub-agent's prompt-cache prefix.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';
import { bashTool } from '../../tools/code/bash.js';

export const REVIEW_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
  bashTool.definition,
];
