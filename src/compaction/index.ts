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
 * A summary the model didn't really write is worse than no compaction at
 * all: the history it replaces is gone from every later API call, and the
 * agent carries on with no record of what it built. So the conversation
 * summary is validated, retried, and — if it still doesn't hold up —
 * abandoned with an error rather than checkpointed.
 */

import {
  streamChatWithRetry,
  type Message,
  type ContentBlock,
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
 * Throws if the conversation had content to summarize and no usable summary
 * came back. The caller reports that and leaves the history alone — losing
 * the conversation is the failure worth avoiding, not skipping a compaction.
 */
export async function compactConversation(
  messages: Message[],
  apiConfig: ApiConfig,
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
  // Tracked separately from `summaries` so an unusable conversation summary
  // can be told apart from a conversation that had nothing to summarize.
  let conversationFailed = false;
  if (conversationMessages.length > 0) {
    tasks.push(
      generateSummary(
        apiConfig,
        'conversation',
        CONVERSATION_SUMMARY_PROMPT,
        conversationMessages,
        model,
      ).then((text) => {
        if (text) {
          summaries.push({ name: 'conversation', text });
        } else {
          conversationFailed = true;
        }
      }),
    );
  }

  // A failed subagent summary is not fatal — that thread's history stays in
  // place and gets another chance at the next compaction.
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
          model,
        ).then((text) => {
          if (text) {
            summaries.push({ name, text });
          } else {
            log.warn('Subagent summary unusable — leaving its history intact', {
              name,
            });
          }
        }),
      );
    }
  }

  await Promise.all(tasks);

  if (conversationFailed) {
    throw new Error(
      'Could not summarize the conversation — the model did not return a usable summary. History left intact.',
    );
  }

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
 * Find a safe boundary at or before `fromIndex` (default: end of the array).
 * Walks backward to a point that isn't between an assistant message with
 * tool_use blocks and its tool_result messages — used both to insert a
 * summary checkpoint (compaction) and to cut the session for rotation.
 */
export function findSafeInsertionPoint(
  messages: Message[],
  fromIndex: number = messages.length,
): number {
  let idx = fromIndex;

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
  if (idx < fromIndex && idx > 0) {
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
 * Longest serialized conversation to summarize in one call, in characters.
 * Above this the message list is split in half and each side summarized
 * separately.
 *
 * The ceiling is about summary quality, not the context limit. Past roughly
 * this much input the model stops summarizing and starts answering the
 * conversation, so every call needs to stay well inside the range where it
 * still does the job. ~4 chars/token puts this near 50K tokens of input.
 */
const CHUNK_CHAR_LIMIT = 200_000;

/**
 * Shortest believable summary, in characters.
 *
 * The failure this guards is the model replying to the conversation instead
 * of summarizing it — one or two sentences, around 120 characters, which
 * passes any non-empty check. Real summaries of a conversation worth
 * compacting run to thousands of characters, so this sits with roughly a 3x
 * margin either side.
 *
 * Deliberately flat rather than scaled to the input. A floor that shrinks
 * with the input gets defeated by the retry below: each split halves the
 * chunk, and a few splits in, the threshold drops under the canned reply and
 * starts accepting it.
 */
const MIN_SUMMARY_CHARS = 400;

/**
 * Generate a summary via LLM. Returns the summary text, or null on failure.
 *
 * A summary that comes back too short for its input is retried once as two
 * half-sized chunks. Splitting is the reliable escape hatch for the failure
 * the size ceiling exists for: the model answering the conversation rather
 * than summarizing it, which only happens on large inputs.
 */
async function generateSummary(
  apiConfig: ApiConfig,
  name: string,
  compactionPrompt: string,
  messagesToSummarize: Message[],
  model: string,
  opts: { forceChunk?: boolean; allowRetry?: boolean } = {},
): Promise<string | null> {
  const serialized = serializeForSummary(messagesToSummarize);
  if (!serialized.trim()) {
    return null;
  }

  const splittable = messagesToSummarize.length > 1;
  const allowRetry = opts.allowRetry ?? true;

  if (splittable && (opts.forceChunk || serialized.length > CHUNK_CHAR_LIMIT)) {
    const mid = Math.floor(messagesToSummarize.length / 2);
    const halves = [
      messagesToSummarize.slice(0, mid),
      messagesToSummarize.slice(mid),
    ];
    log.info('Chunking summary', {
      name,
      messageCount: messagesToSummarize.length,
      serializedLength: serialized.length,
      forced: !!opts.forceChunk,
    });
    const results = await Promise.all(
      halves.map((half, i) =>
        generateSummary(
          apiConfig,
          `${name} [pt${i + 1}]`,
          compactionPrompt,
          half,
          model,
          // A split driven by size gets its children a retry of their own. A
          // split that IS the retry does not, or a model that will not
          // summarize at any size fans out call after call before giving up.
          { allowRetry: opts.forceChunk ? false : allowRetry },
        ),
      ),
    );
    // A half with nothing to serialize yields null legitimately. A half that
    // had content and still failed means that stretch of the conversation
    // would vanish with no record of it, so fail the whole summary rather
    // than hand back half of one.
    const lost = results.some(
      (r, i) => r === null && serializeForSummary(halves[i]).trim(),
    );
    if (lost) {
      return null;
    }
    const parts = results.filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  }

  log.info('Generating summary', {
    name,
    messageCount: messagesToSummarize.length,
    serializedLength: serialized.length,
  });

  const summaryText = await runSummaryCall(
    apiConfig,
    name,
    compactionPrompt,
    serialized,
    model,
  );
  if (summaryText === null) {
    return null;
  }

  if (summaryText.length >= MIN_SUMMARY_CHARS) {
    log.info('Summary generated', { name, summaryLength: summaryText.length });
    return summaryText;
  }

  log.warn('Summary too short to be real', {
    name,
    summaryLength: summaryText.length,
    minimum: MIN_SUMMARY_CHARS,
    serializedLength: serialized.length,
    retrying: splittable && allowRetry,
  });
  if (!splittable || !allowRetry) {
    return null;
  }
  return generateSummary(
    apiConfig,
    name,
    compactionPrompt,
    messagesToSummarize,
    model,
    { forceChunk: true, allowRetry: false },
  );
}

/** One summarization request. Returns the text, or null if the call failed. */
async function runSummaryCall(
  apiConfig: ApiConfig,
  name: string,
  compactionPrompt: string,
  serialized: string,
  model: string,
): Promise<string | null> {
  // The instruction is repeated after the conversation. A single copy above
  // it sits tens of thousands of tokens from where generation starts, and
  // the model finishes the transcript in character instead of summarizing
  // it — the conversation is the last thing it read.
  const userContent = `Conversation to summarize:\n\n${serialized}\n\n---\n\nWrite the summary of the conversation above, following your instructions.`;

  let summaryText = '';
  const iterStart = Date.now();
  for await (const event of streamChatWithRetry({
    ...apiConfig,
    model,
    subAgentId: 'conversationSummarizer',
    system: compactionPrompt,
    messages: [{ role: 'user', content: userContent }],
    // Always empty. With a toolset available the model picks `tool_use` over
    // producing a summary, leaving summaryText empty.
    tools: [],
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
  return summaryText.trim();
}
