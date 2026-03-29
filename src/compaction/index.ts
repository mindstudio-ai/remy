/**
 * Conversation compaction — summarizes old messages into checkpoints.
 *
 * Reduces context window usage by replacing long conversation history
 * with concise summaries. The full history is preserved in state for
 * the UI; only the API calls see the compacted version.
 *
 * Generates separate summaries for the main conversation and each
 * subagent that has accumulated history.
 */

import { streamChat, type Message, type ContentBlock } from '../api.js';
import { readAsset } from '../assets.js';
import { createLogger } from '../logger.js';
import type { AgentState } from '../types.js';

const log = createLogger('compaction');

const CONVERSATION_SUMMARY_PROMPT = readAsset('compaction', 'conversation.md');
const SUBAGENT_SUMMARY_PROMPT = readAsset('compaction', 'subagent.md');

/** Subagents that support persistent threads and should get their own summaries. */
const SUMMARIZABLE_SUBAGENTS = ['visualDesignExpert', 'productVision'];

/**
 * Compact the conversation by generating summary checkpoints.
 *
 * Inserts summary checkpoint messages into state.messages. The
 * cleanMessagesForApi and getSubAgentHistory functions respect these
 * checkpoints and prune older messages from API calls.
 */
export async function compactConversation(
  state: AgentState,
  apiConfig: { baseUrl: string; apiKey: string },
): Promise<void> {
  const tasks: Promise<void>[] = [];

  // Main conversation summary
  tasks.push(
    generateAndInsertSummary(
      state,
      apiConfig,
      'conversation',
      CONVERSATION_SUMMARY_PROMPT,
      getConversationMessagesForSummary(state.messages),
    ),
  );

  // Subagent summaries
  for (const name of SUMMARIZABLE_SUBAGENTS) {
    const subagentMessages = getSubAgentMessagesForSummary(
      state.messages,
      name,
    );
    if (subagentMessages.length > 0) {
      tasks.push(
        generateAndInsertSummary(
          state,
          apiConfig,
          name,
          SUBAGENT_SUMMARY_PROMPT,
          subagentMessages,
        ),
      );
    }
  }

  await Promise.all(tasks);
  log.info('Compaction complete', { summaries: tasks.length });
}

/**
 * Collect main conversation messages since the last conversation checkpoint.
 */
function getConversationMessagesForSummary(messages: Message[]): Message[] {
  let startIdx = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
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

  return messages.slice(startIdx);
}

/**
 * Collect subagent messages since the last checkpoint for that subagent.
 */
function getSubAgentMessagesForSummary(
  messages: Message[],
  subAgentName: string,
): Message[] {
  let checkpointIdx = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
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

  for (let i = startIdx; i < messages.length; i++) {
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
 */
function serializeForSummary(messages: Message[]): string {
  return messages
    .map((msg) => {
      if (typeof msg.content === 'string') {
        return `[${msg.role}]: ${msg.content}`;
      }
      if (!Array.isArray(msg.content)) {
        return `[${msg.role}]: (empty)`;
      }
      const blocks = msg.content as ContentBlock[];
      const parts: string[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          parts.push(block.text);
        } else if (block.type === 'tool') {
          parts.push(
            `[tool: ${block.name}(${JSON.stringify(block.input).slice(0, 200)})] → ${(block.result ?? '').slice(0, 500)}`,
          );
        }
        // Skip thinking blocks — ephemeral
        // Skip summary blocks — meta
      }
      return `[${msg.role}]: ${parts.join('\n')}`;
    })
    .join('\n\n');
}

/**
 * Generate a summary via LLM and insert it as a checkpoint in state.messages.
 */
async function generateAndInsertSummary(
  state: AgentState,
  apiConfig: { baseUrl: string; apiKey: string },
  name: string,
  systemPrompt: string,
  messagesToSummarize: Message[],
): Promise<void> {
  if (messagesToSummarize.length === 0) {
    return;
  }

  const serialized = serializeForSummary(messagesToSummarize);
  if (!serialized.trim()) {
    return;
  }

  log.info('Generating summary', {
    name,
    messageCount: messagesToSummarize.length,
  });

  // Collect streaming text
  let summaryText = '';

  for await (const event of streamChat({
    ...apiConfig,
    subAgentId: 'conversationSummarizer',
    system: systemPrompt,
    messages: [{ role: 'user', content: serialized }],
    tools: [],
  })) {
    if (event.type === 'text') {
      summaryText += event.text;
    } else if (event.type === 'error') {
      log.error('Summary generation failed', { name, error: event.error });
      return;
    }
  }

  if (!summaryText.trim()) {
    log.warn('Empty summary generated', { name });
    return;
  }

  // Insert checkpoint as a hidden user message
  state.messages.push({
    role: 'user',
    hidden: true,
    content: [
      {
        type: 'summary',
        name,
        text: summaryText.trim(),
        startedAt: Date.now(),
      },
    ],
  } as Message);

  log.info('Summary checkpoint inserted', {
    name,
    summaryLength: summaryText.length,
  });
}
