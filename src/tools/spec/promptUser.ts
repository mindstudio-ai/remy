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
      'Prompt the user with structured questions. Use this instead of plain-text questions when answers are predictable (multiple choice, yes/no, pick from a list). Also use this as a gate before major actions — e.g., confirming the spec looks good before building code. Choose the type first before writing questions. Use "form" when collecting structured information (5+ questions, intake-style). Use "inline" for quick clarifications or confirmations mid-conversation. The tool blocks until the user responds.',
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
                enum: ['select', 'text', 'confirm', 'file', 'color'],
                description:
                  'select: pick from options. text: free-form input. confirm: yes/no. file: file/image upload — returns CDN URL(s) that can be referenced directly or curled onto disk. color: color picker (returns hex).',
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
                  'Options for select type. Each can be a string or { label, description }.',
              },
              multiple: {
                type: 'boolean',
                description:
                  'For select: allow picking multiple options (returns array). For file: allow multiple uploads (returns array of URLs). Defaults to false.',
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
      if (q.type === 'select') {
        const opts = (q.options || []).map((o) =>
          typeof o === 'string' ? o : o.label,
        );
        line += q.multiple
          ? ` (pick one or more: ${opts.join(' / ')})`
          : ` (${opts.join(' / ')})`;
      } else if (q.type === 'confirm') {
        line += ' (yes / no)';
      } else if (q.type === 'file') {
        line += ' (upload file)';
      } else if (q.type === 'color') {
        line += ' (pick a color)';
      }
      return line;
    });

    return `Please answer these questions:\n${lines.join('\n')}`;
  },
};
