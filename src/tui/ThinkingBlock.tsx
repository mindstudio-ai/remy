/** Streaming thinking text — rendered dimmed and italic while the model reasons. */

import React from 'react';
import { Text } from 'ink';

interface Props {
  text: string;
}

export function ThinkingBlock({ text }: Props) {
  if (!text) {
    return null;
  }

  return (
    <Text dimColor italic>
      {text}
    </Text>
  );
}
