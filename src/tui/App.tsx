/**
 * Root Ink component — manages conversation state and agent lifecycle.
 *
 * Renders: header → message history → input prompt.
 * On submit: runs agent turn (async), updates state via onEvent
 * callbacks, re-enables input when done.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { InputPrompt } from './InputPrompt.js';
import { MessageList, type TurnState } from './MessageList.js';
import { runTurn, createAgentState, type AgentEvent } from '../agent.js';
import { buildSystemPrompt } from '../prompt.js';

interface Props {
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
}

export function App({ apiConfig, model }: Props) {
  const { exit } = useApp();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Persistent across renders — conversation history accumulates
  const [agentState] = useState(() => createAgentState());
  const [system] = useState(() => buildSystemPrompt());

  // Helper: update the current (last) assistant turn in-place
  const updateAssistant = useCallback(
    (updater: (turn: TurnState) => TurnState) => {
      setTurns((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = updater(last);
        }
        return copy;
      });
    },
    [],
  );

  const handleSubmit = useCallback(
    async (message: string) => {
      // Add user turn + empty assistant turn (will be filled by events)
      setTurns((prev) => [
        ...prev,
        {
          role: 'user',
          text: message,
          thinking: '',
          toolCalls: [],
          done: true,
        },
        {
          role: 'assistant',
          text: '',
          thinking: '',
          toolCalls: [],
          done: false,
        },
      ]);
      setIsRunning(true);

      try {
        await runTurn({
          state: agentState,
          userMessage: message,
          apiConfig,
          system,
          model,
          onEvent: (event: AgentEvent) => {
            switch (event.type) {
              case 'text':
                updateAssistant((t) => ({
                  ...t,
                  text: t.text + event.text,
                }));
                break;

              case 'thinking':
                updateAssistant((t) => ({
                  ...t,
                  thinking: t.thinking + event.text,
                }));
                break;

              case 'tool_start':
                updateAssistant((t) => ({
                  ...t,
                  toolCalls: [
                    ...t.toolCalls,
                    {
                      id: event.id,
                      name: event.name,
                      input: event.input,
                      status: 'running' as const,
                    },
                  ],
                }));
                break;

              case 'tool_done':
                updateAssistant((t) => ({
                  ...t,
                  toolCalls: t.toolCalls.map((tc) =>
                    tc.id === event.id
                      ? {
                          ...tc,
                          status: event.isError
                            ? ('error' as const)
                            : ('done' as const),
                          result: event.result,
                        }
                      : tc,
                  ),
                }));
                break;

              case 'turn_done':
                updateAssistant((t) => ({ ...t, done: true }));
                break;

              case 'error':
                updateAssistant((t) => ({
                  ...t,
                  text: t.text + `\nError: ${event.error}`,
                  done: true,
                }));
                break;
            }
          },
        });
      } catch (err: any) {
        updateAssistant((t) => ({
          ...t,
          text: t.text + `\nError: ${err.message}`,
          done: true,
        }));
      }

      setIsRunning(false);
    },
    [agentState, apiConfig, system, model, updateAssistant],
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="magenta">
        Remy <Text dimColor>v0.1.0 — MindStudio coding agent</Text>
      </Text>

      <MessageList turns={turns} />

      <InputPrompt onSubmit={handleSubmit} disabled={isRunning} />
    </Box>
  );
}
