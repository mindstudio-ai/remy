/**
 * Set project metadata (name, icon, share image).
 *
 * External tool. The sandbox intercepts this at tool_start and
 * updates the project metadata in the UI.
 */

import type { Tool } from '../index.js';

export const setProjectMetadataTool: Tool = {
  clearable: false,
  definition: {
    name: 'setProjectMetadata',
    description:
      'Set project metadata. Can update any combination of: display name, short description, app icon, and Open Graph share image. Provide only the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            "Project display name. Keep it short (2-4 words). Use the app's actual name if the user mentioned one, otherwise pick something descriptive.",
        },
        description: {
          type: 'string',
          description:
            'Short description for the project - user facing only - appears for the project creator in their list of apps.',
        },
        iconUrl: {
          type: 'string',
          description: 'URL for the app icon (square.',
        },
        openGraphShareImageUrl: {
          type: 'string',
          description: 'URL for the Open Graph share image (1200x630).',
        },
      },
    },
  },

  async execute() {
    return 'ok';
  },
};
