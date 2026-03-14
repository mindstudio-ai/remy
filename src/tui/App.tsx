/**
 * Root Ink component — manages conversation state and agent lifecycle.
 *
 * Renders: header → message history → input prompt.
 * On submit: runs agent turn (async), updates state via onEvent
 * callbacks, re-enables input when done.
 *
 * Press Escape during a turn to cancel it.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { InputPrompt } from './InputPrompt.js';
import { MessageList, type TurnState } from './MessageList.js';
import { runTurn, createAgentState, type AgentEvent } from '../agent.js';
import { buildSystemPrompt } from '../prompt.js';
import { loadSession, clearSession } from '../session.js';

interface Props {
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
}

export function App({ apiConfig, model }: Props) {
  const { exit } = useApp();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persistent across renders — conversation history accumulates
  const [agentState] = useState(() => {
    const s = createAgentState();
    loadSession(s);
    return s;
  });
  const [sessionRestored] = useState(() => agentState.messages.length > 0);
  const [system] = useState(() => buildSystemPrompt());

  // Cancel current turn on Escape
  useInput((input, key) => {
    if (key.escape && isRunning && abortRef.current) {
      abortRef.current.abort();
    }
  });

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
      // Handle slash commands
      if (message === '/clear') {
        clearSession(agentState);
        setTurns([]);
        return;
      }

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

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await runTurn({
          state: agentState,
          userMessage: message,
          apiConfig,
          system,
          model,
          signal: abort.signal,
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

              case 'turn_cancelled':
                updateAssistant((t) => ({
                  ...t,
                  text: t.text + '\n(cancelled)',
                  done: true,
                }));
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

      abortRef.current = null;
      setIsRunning(false);
    },
    [agentState, apiConfig, system, model, updateAssistant],
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="magenta">
        Remy <Text dimColor>v0.1.0 — MindStudio coding agent</Text>
      </Text>
      {sessionRestored && (
        <Text dimColor>
          Session restored ({agentState.messages.length} messages). Delete
          .remy-session.json to start fresh.
        </Text>
      )}

      <MessageList turns={turns} />

      {isRunning ? (
        <Text dimColor>Press Escape to cancel</Text>
      ) : (
        <InputPrompt onSubmit={handleSubmit} disabled={isRunning} />
      )}
    </Box>
  );
}
