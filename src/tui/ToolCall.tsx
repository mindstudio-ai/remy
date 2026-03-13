/**
 * Tool call card — compact single-line display of a tool invocation.
 *
 * States:
 *   running → spinner + tool name + args summary
 *   done    → ⟡ + tool name + args + result summary
 *   error   → ✗ + tool name + args + error message
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface Props {
  name: string;
  input: Record<string, any>;
  status: 'running' | 'done' | 'error';
  result?: string;
}

/** Extract the most useful arg for display (e.g., path for file tools). */
function summarizeInput(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'readFile':
    case 'writeFile':
    case 'editFile':
      return input.path || '';
    case 'bash':
      return input.command || '';
    case 'grep':
      return input.pattern || '';
    case 'glob':
      return input.pattern || '';
    case 'listDir':
      return input.path || '.';
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}

/** Summarize the tool result into a short string. */
function summarizeResult(name: string, result: string): string {
  if (result.startsWith('Error')) {
    return result.split('\n')[0];
  }

  const lines = result.split('\n').length;
  switch (name) {
    case 'readFile':
      return `${lines} lines`;
    case 'writeFile':
      return result;
    case 'editFile':
      return result;
    case 'bash':
      return lines > 3 ? `${lines} lines of output` : result.trim();
    case 'grep':
      return `${lines} matches`;
    case 'glob':
      return `${lines} files`;
    case 'listDir':
      return `${lines} entries`;
    default:
      return `${lines} lines`;
  }
}

export function ToolCall({ name, input, status, result }: Props) {
  const summary = summarizeInput(name, input);

  return (
    <Box>
      <Text> </Text>
      {status === 'running' ? (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      ) : status === 'error' ? (
        <Text color="red">✗</Text>
      ) : (
        <Text color="green">⟡</Text>
      )}
      <Text> </Text>
      <Text bold>{name}</Text>
      {summary ? <Text dimColor> {summary}</Text> : null}
      {result && status !== 'running' ? (
        <Text dimColor> → {summarizeResult(name, result)}</Text>
      ) : null}
    </Box>
  );
}
