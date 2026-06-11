/**
 * Conversation compaction — summarizes old messages into checkpoints.
 *
 * Reduces context window usage by replacing long conversation history
 * with concise summaries. The full history is preserved in state for
 * the UI; only the API calls see the compacted version.
 *
 * Generates separate summaries for the main conversation and each
 * subagent that has accumulated history.
 *
 * Designed to run in the background — snapshots the insertion point
 * upfront and inserts at that index when done, so new messages that
 * arrive during generation are unaffected.
 *
 * The summarization call reuses the main conversation's system prompt
 * and tools so the API request hits the same prompt cache — avoiding
 * a full cache miss from a different system prompt.
 */

import {
  streamChat,
  type Message,
  type ContentBlock,
  type ToolDefinition,
} from '../api.js';
import { readAsset } from '../assets.js';
import { SUBAGENT_TOOL_NAMES } from '../tools/index.js';
import { createLogger } from '../logger.js';
import { recordUsage, nanoToDollars } from '../usageLedger.js';
import type { ApiConfig } from '../config.js';

const log = createLogger('compaction');

const CONVERSATION_SUMMARY_PROMPT = readAsset('compaction', 'conversation.md');
const SUBAGENT_SUMMARY_PROMPT = readAsset('compaction', 'subagent.md');

/** Subagents that support persistent threads and should get their own summaries. */
const SUMMARIZABLE_SUBAGENTS = ['visualDesignExpert', 'productVision'];

/**
 * Compact the conversation by generating summary checkpoints.
 *
 * Snapshots the current message count as the insertion point. Summaries
 * are generated in parallel, then inserted at the snapshot index. Messages
 * appended after the snapshot (from ongoing turns) are not affected.
 *
 * @param system - The main conversation's system prompt (reused for cache hits)
 * @param tools - The main conversation's tool definitions (reused for cache hits)
 */
export async function compactConversation(
  messages: Message[],
  apiConfig: ApiConfig,
  system: string | undefined,
  tools: ToolDefinition[] | undefined,
  model: string,
): Promise<Message[]> {
  // Snapshot the end of the messages to summarize. The caller will
  // determine the actual insertion point when it's safe to splice.
  const endIndex = findSafeInsertionPoint(messages);

  const summaries: Array<{ name: string; text: string }> = [];
  const tasks: Promise<void>[] = [];

  // Main conversation summary
  const conversationMessages = getConversationMessagesForSummary(
    messages,
    endIndex,
  );
  if (conversationMessages.length > 0) {
    tasks.push(
      generateSummary(
        apiConfig,
        'conversation',
        CONVERSATION_SUMMARY_PROMPT,
        conversationMessages,
        system,
        tools,
        model,
      ).then((text) => {
        if (text) {
          summaries.push({ name: 'conversation', text });
        }
      }),
    );
  }

  // Subagent summaries — these reuse the main conversation's system prompt
  // and tools for cache hits, NOT the subagent's own prompt/tools. This is
  // intentional: the main cache is most likely warm at compaction time, while
  // the subagent's cache may have expired between invocations. The subagent
  // summary instruction in the user message is sufficient context. If summary
  // quality degrades for subagent-specific content, consider passing each
  // subagent's own system prompt and tools here instead.
  for (const name of SUMMARIZABLE_SUBAGENTS) {
    const subagentMessages = getSubAgentMessagesForSummary(
      messages,
      name,
      endIndex,
    );
    if (subagentMessages.length > 0) {
      tasks.push(
        generateSummary(
          apiConfig,
          name,
          SUBAGENT_SUMMARY_PROMPT,
          subagentMessages,
          system,
          tools,
          model,
        ).then((text) => {
          if (text) {
            summaries.push({ name, text });
          }
        }),
      );
    }
  }

  await Promise.all(tasks);

  const checkpointMessages: Message[] = summaries.map((s) => ({
    role: 'user' as const,
    hidden: true,
    content: [
      {
        type: 'summary' as const,
        name: s.name,
        text: s.text,
        startedAt: Date.now(),
      },
    ],
  }));

  log.info('Compaction complete', { summaries: summaries.length });
  return checkpointMessages;
}

/**
 * Find a safe insertion point at or before the end of the messages array.
 * Walks backward from the end to find a boundary that isn't between an
 * assistant message with tool_use blocks and its tool_result messages.
 */
export function findSafeInsertionPoint(messages: Message[]): number {
  let idx = messages.length;

  // Walk backward past any trailing tool_result messages
  while (idx > 0) {
    const msg = messages[idx - 1];
    if (msg.role === 'user' && msg.toolCallId) {
      // This is a tool_result — keep walking back
      idx--;
    } else {
      break;
    }
  }

  // If we walked back past tool_results, also skip the assistant message
  // that contains the matching tool_use blocks
  if (idx < messages.length && idx > 0) {
    const msg = messages[idx - 1];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const hasToolUse = (msg.content as ContentBlock[]).some(
        (b) => b.type === 'tool',
      );
      if (hasToolUse) {
        idx--;
      }
    }
  }

  return idx;
}

/**
 * Collect main conversation messages since the last conversation checkpoint,
 * up to the given end index.
 */
function getConversationMessagesForSummary(
  messages: Message[],
  endIndex: number,
): Message[] {
  let startIdx = 0;

  for (let i = endIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'summary' && block.name === 'conversation') {
        startIdx = i + 1;
        break;
      }
    }
    if (startIdx > 0) {
      break;
    }
  }

  return messages.slice(startIdx, endIndex);
}

/**
 * Collect subagent messages since the last checkpoint for that subagent,
 * up to the given end index.
 */
function getSubAgentMessagesForSummary(
  messages: Message[],
  subAgentName: string,
  endIndex: number,
): Message[] {
  let checkpointIdx = -1;

  for (let i = endIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'summary' && block.name === subAgentName) {
        checkpointIdx = i;
        break;
      }
    }
    if (checkpointIdx !== -1) {
      break;
    }
  }

  const startIdx = checkpointIdx !== -1 ? checkpointIdx + 1 : 0;
  const collected: Message[] = [];

  for (let i = startIdx; i < endIndex; i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (
        block.type === 'tool' &&
        block.name === subAgentName &&
        block.subAgentMessages?.length
      ) {
        collected.push(...block.subAgentMessages);
      }
    }
  }

  return collected;
}

/**
 * Serialize messages into a readable format for the summarizer.
 *
 * We deliberately strip the mechanics of the tool loop, which otherwise
 * dominate the input (untruncated tool-result messages are ~70% of it):
 * - Assistant tool calls collapse to a `[used N tools]` marker so the
 *   summarizer still senses the scale of the loop, without the args/results.
 * - Tool-result messages are dropped UNLESS they came from a sub-agent
 *   (`SUBAGENT_TOOL_NAMES`) — a design report, QA result, etc. is real
 *   work-product worth carrying into the summary; a file read or grep is not.
 * Narrative text (real user/assistant turns) is kept verbatim.
 */
function serializeForSummary(messages: Message[]): string {
  // Tool name lives on the assistant tool block, not on the result message —
  // map id → name so we can classify each tool result.
  const toolNameById = new Map<string, string>();
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'tool') {
        toolNameById.set(block.id, block.name);
      }
    }
  }

  const lines: string[] = [];
  for (const msg of messages) {
    // Tool-result message: keep only sub-agent work-product, drop mechanics.
    if (msg.role === 'user' && msg.toolCallId) {
      const toolName = toolNameById.get(msg.toolCallId);
      if (toolName && SUBAGENT_TOOL_NAMES.has(toolName)) {
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content as ContentBlock[])
                  .filter(
                    (b): b is ContentBlock & { type: 'text' } =>
                      b.type === 'text',
                  )
                  .map((b) => b.text)
                  .join('\n')
              : '';
        if (content.trim()) {
          lines.push(`[${toolName} result]: ${content}`);
        }
      }
      continue;
    }

    if (typeof msg.content === 'string') {
      if (msg.content.trim()) {
        lines.push(`[${msg.role}]: ${msg.content}`);
      }
      continue;
    }
    if (!Array.isArray(msg.content)) {
      continue;
    }

    const blocks = msg.content as ContentBlock[];
    const parts: string[] = [];
    let toolCount = 0;
    for (const block of blocks) {
      if (block.type === 'text') {
        parts.push(block.text);
      } else if (block.type === 'tool') {
        toolCount++;
      }
      // Skip thinking blocks — ephemeral. Skip summary blocks — meta.
    }
    if (toolCount > 0) {
      parts.push(`[used ${toolCount} tool${toolCount === 1 ? '' : 's'}]`);
    }
    const body = parts.join('\n').trim();
    if (body) {
      lines.push(`[${msg.role}]: ${body}`);
    }
  }

  return lines.join('\n\n');
}

/**
 * Generate a summary via LLM. Returns the summary text, or null on failure.
 *
 * When the main conversation's system prompt and tools are provided, the
 * summarization call reuses them so the request hits the same prompt cache.
 * The compaction instruction is sent as a user message instead of as the
 * system prompt.
 */
// Max serialized chars per summarization call. Leaves headroom for the
// system prompt + tools + compaction instructions under the 1M-token API
// limit (~4 chars/token → 2.4M chars ≈ 600K tokens of user content).
const CHUNK_CHAR_LIMIT = 2_400_000;

async function generateSummary(
  apiConfig: ApiConfig,
  name: string,
  compactionPrompt: string,
  messagesToSummarize: Message[],
  mainSystem: string | undefined,
  mainTools: ToolDefinition[] | undefined,
  model: string,
): Promise<string | null> {
  const serialized = serializeForSummary(messagesToSummarize);
  if (!serialized.trim()) {
    return null;
  }

  // If serialized content would overflow the API context, recursively split
  // the message list in half and summarize each side in parallel, then join
  // the partial summaries. Without this, /compact silently fails on long
  // conversations — exactly the case where the user most needs it to work.
  if (serialized.length > CHUNK_CHAR_LIMIT && messagesToSummarize.length > 1) {
    const mid = Math.floor(messagesToSummarize.length / 2);
    log.info('Chunking summary', {
      name,
      messageCount: messagesToSummarize.length,
      serializedLength: serialized.length,
    });
    const [first, second] = await Promise.all([
      generateSummary(
        apiConfig,
        `${name} [pt1]`,
        compactionPrompt,
        messagesToSummarize.slice(0, mid),
        mainSystem,
        mainTools,
        model,
      ),
      generateSummary(
        apiConfig,
        `${name} [pt2]`,
        compactionPrompt,
        messagesToSummarize.slice(mid),
        mainSystem,
        mainTools,
        model,
      ),
    ]);
    const parts = [first, second].filter((p): p is string => !!p);
    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  }

  log.info('Generating summary', {
    name,
    messageCount: messagesToSummarize.length,
    cacheReuse: !!mainSystem,
  });

  let summaryText = '';

  // When the main system prompt is available, reuse it so the API call
  // hits the same prompt cache as the conversation. The compaction
  // instruction goes into the user message instead.
  const useMainCache = !!mainSystem;
  const system = useMainCache ? mainSystem : compactionPrompt;
  // Always pass empty tools to the summarizer. With the main system prompt
  // and the full agent toolset available, the model often picks `tool_use`
  // over producing a summary, leaving summaryText empty and silently
  // breaking /compact.
  const tools: ToolDefinition[] = [];
  const userContent = useMainCache
    ? `${compactionPrompt}\n\n---\n\nConversation to summarize:\n\n${serialized}`
    : serialized;

  const iterStart = Date.now();
  for await (const event of streamChat({
    ...apiConfig,
    model,
    subAgentId: 'conversationSummarizer',
    system,
    messages: [{ role: 'user', content: userContent }],
    tools,
  })) {
    if (event.type === 'text') {
      summaryText += event.text;
    } else if (event.type === 'done') {
      recordUsage({
        ts: Date.now(),
        agentName: 'conversationSummarizer',
        modelId: event.modelId,
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        cacheCreationTokens: event.usage.cacheCreationTokens,
        cacheReadTokens: event.usage.cacheReadTokens,
        cost: nanoToDollars(event.cost),
        billingEvents: event.billingEvents,
        durationMs: Date.now() - iterStart,
        toolNames: [],
      });
    } else if (event.type === 'error') {
      log.error('Summary generation failed', { name, error: event.error });
      return null;
    }
  }

  if (!summaryText.trim()) {
    log.warn('Empty summary generated', { name });
    return null;
  }

  log.info('Summary generated', { name, summaryLength: summaryText.length });
  return summaryText.trim();
}
