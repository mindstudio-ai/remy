/** User input prompt — ink-text-input with a cyan `>` prefix. Hidden while the agent is running. */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function InputPrompt({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  if (disabled) {
    return null;
  }

  return (
    <Box>
      <Text color="cyan" bold>
        {'> '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(v) => {
          if (v.trim()) {
            onSubmit(v.trim());
            setValue('');
          }
        }}
      />
    </Box>
  );
}
