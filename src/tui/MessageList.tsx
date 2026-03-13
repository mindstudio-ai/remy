/**
 * Conversation history — renders the sequence of user messages and
 * assistant responses. Each assistant turn shows thinking (dimmed),
 * tool calls (with status cards), and text output.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ToolCall } from './ToolCall.js';
import { ThinkingBlock } from './ThinkingBlock.js';

export interface ToolCallState {
  id: string;
  name: string;
  input: Record<string, any>;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export interface TurnState {
  role: 'user' | 'assistant';
  text: string;
  thinking: string;
  toolCalls: ToolCallState[];
  done: boolean;
}

interface Props {
  turns: TurnState[];
}

export function MessageList({ turns }: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      {turns.map((turn, i) => (
        <Box key={i} flexDirection="column">
          {turn.role === 'user' ? (
            <Text>
              <Text color="cyan" bold>
                {'> '}
              </Text>
              {turn.text}
            </Text>
          ) : (
            <Box flexDirection="column">
              {turn.thinking ? <ThinkingBlock text={turn.thinking} /> : null}
              {turn.toolCalls.map((tc) => (
                <ToolCall
                  key={tc.id}
                  name={tc.name}
                  input={tc.input}
                  status={tc.status}
                  result={tc.result}
                />
              ))}
              {turn.text ? (
                <Box marginTop={turn.toolCalls.length > 0 ? 1 : 0}>
                  <Text>{turn.text}</Text>
                </Box>
              ) : null}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
