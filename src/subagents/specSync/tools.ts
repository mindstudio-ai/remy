/**
 * Tool definitions for the spec-sync sub-agent.
 *
 * Read tools to locate and verify, plus the spec read/write tools to reconcile.
 * Deliberately NO code-write tools — the specialist updates the spec (src/) to
 * match code Remy already wrote; it never edits code. These are the same
 * definition objects the main agent registers, so schemas can't drift, and every
 * one routes back through the main executeTool.
 */

import type { ToolDefinition } from '../../api.js';
import { COMMON_READ_TOOLS } from '../common/tools.js';
import { readSpecTool } from '../../tools/spec/readSpec.js';
import { editSpecTool } from '../../tools/spec/editSpec.js';
import { writeSpecTool } from '../../tools/spec/writeSpec.js';

export const SPEC_SYNC_TOOLS: ToolDefinition[] = [
  ...COMMON_READ_TOOLS,
  readSpecTool.definition,
  editSpecTool.definition,
  writeSpecTool.definition,
];
