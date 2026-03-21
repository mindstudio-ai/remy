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
      'Ask the user structured questions. Choose type first: "form" for structured intake (5+ questions, takes over screen), "inline" for quick clarifications or confirmations. Blocks until the user responds. Result contains `_dismissed: true` if the user dismisses without answering.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['form', 'inline'],
          description:
            'Choose this first, before writing questions. form: full form for structured intake with many questions. inline: compact in-chat display.',
        },
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
              type: {
                type: 'string',
                enum: ['select', 'checklist', 'text', 'file'],
                description:
                  'select: pick one from a list. checklist: pick one or more from a list. The user can always provide a custom "Other" answer for select and checklist questions, so there is no need to include an "Other" option. text: free-form input. file: file/image upload, returns CDN URL(s) that can be referenced directly or curled onto disk.',
              },
              helpText: {
                type: 'string',
                description:
                  'Optional detail rendered below the question as a subtitle.',
              },
              required: {
                type: 'boolean',
                description:
                  'Whether the user must answer this question. Defaults to false.',
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
                  'Options for select and checklist types. Each can be a string or { label, description }.',
              },
              multiple: {
                type: 'boolean',
                description:
                  'For file type: allow multiple uploads (returns array of URLs). Defaults to false.',
              },
              format: {
                type: 'string',
                enum: ['email', 'url', 'phone', 'number'],
                description:
                  'For text type: adds input validation and mobile keyboard hints.',
              },
              placeholder: {
                type: 'string',
                description: 'For text type: placeholder hint text.',
              },
              accept: {
                type: 'string',
                description:
                  'For file type: comma-separated mime types, like HTML input accept (e.g. "image/*", "image/*,video/*", "application/pdf"). Omit to accept all file types.',
              },
            },
            required: ['id', 'question', 'type'],
          },
          description: 'One or more questions to present.',
        },
      },
      required: ['type', 'questions'],
    },
  },

  streaming: {
    partialInput: (partial, lastCount) => {
      const questions = partial.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        return null;
      }

      // Buffer until we know the display type
      const hasType = typeof partial.type === 'string';
      if (!hasType && questions.length < 3) {
        return null;
      }

      // Only emit when the array has grown — exclude the last item
      // (may be mid-parse with truncated strings)
      const confirmed = questions.length > 1 ? questions.slice(0, -1) : [];
      if (confirmed.length <= lastCount) {
        return null;
      }

      return {
        input: {
          ...partial,
          type: partial.type ?? 'inline',
          questions: confirmed,
        },
        emittedCount: confirmed.length,
      };
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
      multiple?: boolean;
    }>;

    const lines = questions.map((q) => {
      let line = `- ${q.question}`;
      if (q.type === 'select' || q.type === 'checklist') {
        const opts = (q.options || []).map((o) =>
          typeof o === 'string' ? o : o.label,
        );
        line +=
          q.type === 'checklist'
            ? ` (pick one or more: ${opts.join(' / ')})`
            : ` (${opts.join(' / ')})`;
      } else if (q.type === 'file') {
        line += ' (upload file)';
      }
      return line;
    });

    return `Please answer these questions:\n${lines.join('\n')}`;
  },
};
