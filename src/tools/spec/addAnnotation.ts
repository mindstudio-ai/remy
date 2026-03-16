/** Add MSFM block or inline annotations to spec files. */

import fs from 'node:fs/promises';
import type { Tool } from '../index.js';
import { validateSpecPath, resolveHeadingPath } from './_helpers.js';

export const addAnnotationTool: Tool = {
  definition: {
    name: 'addSpecAnnotation',
    description:
      'Add an MSFM annotation to a spec file. Block annotations (~~~...~~~) attach context to a paragraph. Inline annotations ([text]{content}) clarify a specific word or phrase. Use annotations to resolve ambiguity, pin down edge cases, and specify data representations.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root, must start with src/ (e.g., src/app.md).',
        },
        type: {
          type: 'string',
          enum: ['block', 'inline'],
          description:
            'Annotation type. "block" attaches a ~~~...~~~ block after a paragraph. "inline" wraps a word/phrase as [text]{content}.',
        },
        heading: {
          type: 'string',
          description:
            'Heading path to locate the target section (e.g., "Vendors > Approval Flow"). Empty string for the preamble.',
        },
        target: {
          type: 'string',
          description:
            'For block: optional text snippet to locate the specific paragraph (annotation is inserted after it). For inline: required — the word or phrase to annotate.',
        },
        content: {
          type: 'string',
          description: 'The annotation content.',
        },
      },
      required: ['path', 'type', 'heading', 'content'],
    },
  },

  async execute(input) {
    try {
      validateSpecPath(input.path);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }

    let fileContent: string;
    try {
      fileContent = await fs.readFile(input.path, 'utf-8');
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }

    try {
      const range = resolveHeadingPath(fileContent, input.heading);
      const lines = fileContent.split('\n');

      let result: string;
      if (input.type === 'block') {
        result = applyBlockAnnotation(
          lines,
          range,
          input.target,
          input.content,
        );
      } else {
        if (!input.target) {
          return 'Error: "target" is required for inline annotations — it specifies the word or phrase to annotate.';
        }
        result = applyInlineAnnotation(
          lines,
          range,
          input.target,
          input.content,
        );
      }

      await fs.writeFile(input.path, result, 'utf-8');

      const headingLabel = input.heading || 'preamble';
      if (input.type === 'block') {
        return `Added block annotation under ${headingLabel}${input.target ? ` (after "${input.target}")` : ''}`;
      }
      return `Annotated '${input.target}' in ${headingLabel}`;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};

function applyBlockAnnotation(
  lines: string[],
  range: { contentStart: number; contentEnd: number },
  target: string | undefined,
  content: string,
): string {
  const sectionLines = lines.slice(range.contentStart, range.contentEnd);
  let insertAfterLine: number;

  if (target) {
    // Find the paragraph containing the target text
    const targetIdx = sectionLines.findIndex((line) => line.includes(target));
    if (targetIdx === -1) {
      throw new Error(`Target text "${target}" not found in section content.`);
    }
    // Find the end of this paragraph (next blank line or end of section)
    let paragraphEnd = targetIdx;
    for (let i = targetIdx + 1; i < sectionLines.length; i++) {
      if (sectionLines[i].trim() === '') {
        break;
      }
      paragraphEnd = i;
    }
    insertAfterLine = range.contentStart + paragraphEnd;
  } else {
    // No target — find the last non-empty line in the section
    let lastNonEmpty = range.contentStart;
    for (let i = range.contentEnd - 1; i >= range.contentStart; i--) {
      if (lines[i].trim() !== '') {
        lastNonEmpty = i;
        break;
      }
    }
    insertAfterLine = lastNonEmpty;
  }

  const annotationBlock = ['', '~~~', ...content.split('\n'), '~~~'];
  const result = [...lines];
  result.splice(insertAfterLine + 1, 0, ...annotationBlock);
  return result.join('\n');
}

function applyInlineAnnotation(
  lines: string[],
  range: { contentStart: number; contentEnd: number },
  target: string,
  content: string,
): string {
  // Find first occurrence of target in the section
  let targetLine = -1;
  let targetCol = -1;
  for (let i = range.contentStart; i < range.contentEnd; i++) {
    const col = lines[i].indexOf(target);
    if (col !== -1) {
      targetLine = i;
      targetCol = col;
      break;
    }
  }

  if (targetLine === -1) {
    throw new Error(`Target text "${target}" not found in section content.`);
  }

  const isLong = content.includes('\n') || content.length > 120;
  const result = [...lines];

  if (isLong) {
    // Use pointer form: [target]{#id} + ~~~#id block
    const pointerId = slugify(target);
    const replacement = `[${target}]{#${pointerId}}`;
    result[targetLine] =
      result[targetLine].substring(0, targetCol) +
      replacement +
      result[targetLine].substring(targetCol + target.length);

    // Find end of the paragraph containing the target
    let paragraphEnd = targetLine;
    for (let i = targetLine + 1; i < range.contentEnd; i++) {
      if (result[i].trim() === '') {
        break;
      }
      paragraphEnd = i;
    }

    const annotationBlock = [
      '',
      `~~~#${pointerId}`,
      ...content.split('\n'),
      '~~~',
    ];
    result.splice(paragraphEnd + 1, 0, ...annotationBlock);
  } else {
    // Short form: [target]{content}
    const replacement = `[${target}]{${content}}`;
    result[targetLine] =
      result[targetLine].substring(0, targetCol) +
      replacement +
      result[targetLine].substring(targetCol + target.length);
  }

  return result.join('\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
