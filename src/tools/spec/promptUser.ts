/**
 * Prompt the user with structured questions.
 *
 * Renders as an inline form in the chat. The sandbox intercepts this at
 * tool_start and renders the questions as UI (buttons, checkboxes, text
 * fields). The tool blocks until the user submits answers, then the
 * sandbox sends the responses back as the tool result.
 *
 * Use for any structured input: intake questions, spec review gates,
 * choosing between approaches, confirming before destructive actions.
 */

import type { Tool } from '../index.js';

export const promptUserTool: Tool = {
  definition: {
    name: 'promptUser',
    description:
      'Prompt the user with structured questions. Renders as an inline form in the chat. Use this instead of plain-text questions when answers are predictable (multiple choice, yes/no, pick from a list). Also use this as a gate before major actions — e.g., confirming the spec looks good before building code. The tool blocks until the user responds.',
    inputSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description:
                  'Unique identifier for this question. Used as the key in the response object.',
              },
              question: {
                type: 'string',
                description: 'The question to ask.',
              },
              context: {
                type: 'string',
                description:
                  'Optional extra detail rendered below the question in smaller text.',
              },
              type: {
                type: 'string',
                enum: ['choice', 'multi', 'text', 'confirm'],
                description:
                  'choice: pick one from a list. multi: pick one or more. text: free-form input. confirm: yes/no.',
              },
              options: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        label: {
                          type: 'string',
                          description: 'The option text.',
                        },
                        description: {
                          type: 'string',
                          description: 'Optional detail shown below the label.',
                        },
                      },
                      required: ['label'],
                    },
                  ],
                },
                description:
                  'Options for choice and multi types. Each can be a string or { label, description }. Not needed for text or confirm.',
              },
            },
            required: ['id', 'question', 'type'],
          },
          description: 'One or more questions to present.',
        },
      },
      required: ['questions'],
    },
  },

  async execute(input) {
    // The sandbox intercepts this tool and handles the UI.
    // This fallback runs outside the sandbox (e.g., local CLI).
    const questions = input.questions as Array<{
      id: string;
      question: string;
      type: string;
      options?: Array<string | { label: string }>;
    }>;

    const lines = questions.map((q) => {
      let line = `- ${q.question}`;
      if (q.type === 'choice' || q.type === 'multi') {
        const opts = (q.options || []).map((o) =>
          typeof o === 'string' ? o : o.label,
        );
        line += ` (${opts.join(' / ')})`;
      } else if (q.type === 'confirm') {
        line += ' (yes / no)';
      }
      return line;
    });

    return `Please answer these questions:\n${lines.join('\n')}`;
  },
};
