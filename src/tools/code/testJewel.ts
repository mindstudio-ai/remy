/**
 * Run a method's jewel directly against a test input.
 *
 * External tool. The sandbox sends the command to the dev tunnel, which
 * transpiles and executes the method's .jewel.ts file and returns the pair
 * record. The method itself is never executed (no database mutation) and
 * nothing is written to the platform's pair ledger — this is the authoring
 * loop, not a demonstration.
 */

import type { Tool } from '../index.js';

export const testJewelTool: Tool = {
  definition: {
    name: 'testJewel',
    description:
      "Run a method's jewel directly against a test input and return its pair record. Use after writing or modifying a jewel to verify the subject projection, the proposal, and the grading — the method itself is NOT executed (no data changes) and nothing reaches the pair ledger. Pass `humanInput` (the exact input a human would have submitted) for a full graded run: the jewel derives the subject from it, proposes, and grades its proposal against it as ground truth — the record carries a verdict (agree/disagree/skip). Or pass `subject` for an ungraded eval run (propose only). Returns the full pair record (subject, proposed, reasoning, actual, verdict, notes, error) plus captured console output and duration. A `pair.error` means your jewel code threw in that phase — fix and re-run. Seed realistic data first (runScenario) so the jewel's reads have a world to look at.",
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description:
            'The shadowed method\'s export name (camelCase, e.g. "updateIssue"). Its manifest entry must have a `jewel` pointer.',
        },
        humanInput: {
          type: 'object',
          description:
            'Shadow-style run: the exact method input a human would have submitted. The jewel derives its subject from this, proposes, and grades against it — the record gets a verdict. Use realistic inputs; this is how you verify agreement.',
        },
        subject: {
          type: 'object',
          description:
            "Eval run: a subject to propose against with no ground truth (record is ungraded). Use to probe the jewel on cases where you don't know the right answer yet. Pass exactly one of humanInput or subject.",
        },
      },
      required: ['method'],
    },
  },

  async execute() {
    return 'ok';
  },
};
