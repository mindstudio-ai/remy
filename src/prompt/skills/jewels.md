---
name: Jewels
what: A shadow companion for an app method — `foo.jewel.ts` beside `foo.ts` — that learns the job from how people use the app. It proposes the method input a careful teammate would submit (or abstains), is graded against what the human actually did, and climbs an autonomy ladder (shadow → approve → auto) on agreement evidence. Arbitrary TypeScript, deterministic guardrails plus a task agent for judgment. This is how an app graduates from being used to doing the work, and it makes every day of ordinary use an investment.
when: Before writing any `.jewel.ts` file, setting a method's `autonomy` in the manifest, or writing a custom `grade` — and whenever the user wants a verb to start running itself.
---

# Jewels (`defineJewel`)

A teammate opens the error inbox on Monday morning and triages twenty issues: this one's critical, that one's known noise, these two are the same bug. Every one of those clicks is a demonstration. A jewel is the thing that watches — on every human invocation of the method it shadows, it independently works out what it would have done, and the (proposed, actual) pair lands in a ledger. When the numbers say it triages the queue the way the team does, the team promotes the verb: first to drafting for approval, then to acting on its own. Autonomy is earned one method at a time, with evidence.

```typescript
import { defineJewel } from '@mindstudio-ai/agent';
```

## The Contract

**The jewel proposes; the method applies.** A jewel's output type is the shadowed method's input type. It never writes anything itself — auth checks, validation, and invariants stay in the method, so the jewel walks through the same door as every human and every interface, and it cannot do anything the app didn't already allow.

Three functions, one call. Declare `subject` before `propose` — the subject type is inferred from the projection's return and flows into `propose`'s parameter:

- **`subject`** — a typed projection from the method's input to what identifies the work (`{ issueId }`). Never include the human's decision fields: the jewel exists to produce the decision, so handing it the answer would poison every pair.
- **`propose`** — arbitrary TypeScript that returns `{ input: MethodInput | null, reasoning: string }`. `input: null` is abstention — a correct, graded outcome, not a failure. `reasoning` is written to the ledger and is most valuable on abstention.
- **`grade`** (optional) — scores `{ proposed, actual }` and returns `{ verdict: 'agree' | 'disagree' | 'skip', notes? }`. Omit it for deep-equal on the method input. `skip` means "this pair isn't a graded moment."

The jewel runs as its own platform-managed user with a normal session, so `auth.userId` is set, `requireUser()`-style helpers pass unchanged, and role checks in methods apply to it exactly as they do to humans.

## When to Use

- **The method is a recurring judgment call**: classify, prioritize, route, assign, dedupe, draft. High-frequency verbs with visible human decisions are the best first jewels — the pairs accumulate fast.
- **The user wants automation they can trust**: shadow mode produces the "would have agreed 84% of the time" evidence before anything changes behavior.
- **Whole-method autonomy**, not a feature inside a method — if the method itself should call a model as part of its normal work, that's just a `runTask()` in the method body, not a jewel.

## When NOT to Use

- **Reads** (`get-*`, `list-*`) — there is no decision to learn.
- **Machine-triggered ingest** (webhooks, cron, sync) — no human demonstration to shadow.
- **Deterministic mutations** — if the correct input is computable, compute it in the method. A jewel learns judgment, not arithmetic.
- **Verbs that should stay human as policy** — declare `"autonomy": "manual"` in the manifest. That's a statement, not an omission.

## Usage

The classification jewel for an issue-triage method, showing the full shape — deterministic guardrails before any model call, context gathering through the app's own methods, a runtime-built enum so the agent can't invent values, fail-closed abstention, and a grade that only scores the fields the human actually decided:

```typescript
// dist/methods/src/updateIssue.jewel.ts
import { defineJewel, mindstudio } from '@mindstudio-ai/agent';
import { updateIssue } from './updateIssue';
import { liveIssuesQuery, resolveIssue } from './common/issues';

export default defineJewel(updateIssue, {
  // Projection: what the human was looking at, never what they decided.
  subject: ({ issueId }) => ({ issueId }),

  propose: async ({ issueId }) => {
    // Deterministic guardrails first — no model call for the easy outs.
    const resolved = await resolveIssue(issueId);
    if (!resolved) return { input: null, reasoning: 'Issue no longer exists.' };
    if (resolved.issue.status !== 'new') {
      return { input: null, reasoning: 'Already triaged; first classification is the only moment this jewel handles.' };
    }

    const live = await liveIssuesQuery();
    const knownServices = [...new Set(live.map((i) => i.service).filter((s): s is string => !!s))];

    try {
      const task = await mindstudio.runTask({
        prompt: TRIAGE_PROMPT, // plain-prose policy: how this team judges severity, when to ignore, when to abstain
        input: { issue: shapeForModel(resolved.issue), knownServices },
        tools: [
          { appMethod: 'list-issues', description: 'Search for precedent: similar issues and how the team classified them.' },
          { appMethod: 'get-issue', description: 'Full detail for one comparable issue.' },
        ],
        outputSchema: {
          type: 'object',
          properties: {
            action: { enum: ['classify', 'ignore', 'abstain'] },
            severity: { enum: ['critical', 'high', 'normal', 'low', null] },
            service: { enum: [...knownServices, null] }, // runtime enum: it cannot invent a service
            rationale: { type: 'string' },
          },
          required: ['action', 'severity', 'service', 'rationale'],
        },
        model: 'claude-5-sonnet', // ask askMindStudioSdk — don't copy this one blind
        maxTurns: 8,
      });

      const d = task.output;
      if (d.action === 'abstain') return { input: null, reasoning: d.rationale };
      if (d.action === 'ignore') {
        return { input: { issueId, status: 'ignored' as const }, reasoning: d.rationale };
      }
      if (!d.severity) return { input: null, reasoning: `Classified without a severity. ${d.rationale}` };
      return {
        input: { issueId, status: 'triaged' as const, severity: d.severity, service: d.service },
        reasoning: d.rationale,
      };
    } catch (err) {
      // Couldn't produce conforming output — abstain with the evidence. Fail closed.
      return { input: null, reasoning: `Task agent failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },

  // Grade only what the human decided; a read-toggle isn't a triage moment.
  grade: ({ proposed, actual }) => {
    const keys = Object.keys(actual) as (keyof typeof actual)[];
    const decided = keys.filter((k) => (k === 'status' || k === 'severity' || k === 'service') && actual[k] !== undefined);
    if (decided.length === 0) return { verdict: 'skip', notes: 'Housekeeping touch, not a classification.' };
    if (!proposed) return { verdict: 'disagree', notes: 'Abstained where the human classified.' };
    const misses = decided.filter((k) => proposed[k] !== actual[k]);
    return misses.length === 0
      ? { verdict: 'agree' }
      : { verdict: 'disagree', notes: misses.map((k) => `${k}: proposed ${proposed[k]}, human ${actual[k]}`).join('; ') };
  },
});
```

## Writing `propose`

- **Guardrails before judgment.** Handle the deterministic outs (gone, already handled, nothing to compare against) in plain code before any model call. Cheap, fast, and every guardrail is a documented abstention in the ledger.
- **Context is plain imports plus tools.** Prefetch what every run needs (the row, its history, the inventory of valid values) into the task input; expose the app's own read methods as tools for what the agent should decide to look up (precedent, comparables). Tool calls are recorded with the pair, so the jewel's investigation is part of the training data.
- **Use `runTask` with `outputSchema` for the judgment.** Runtime-built enums are the power move: a candidate-id enum means the agent structurally cannot reference a row that doesn't exist; a known-values enum means it cannot invent a category. Put `null` in the enum (or a type array) so abstention is a first-class output, not a formatting accident.
- **Catch everything; abstain on failure.** A jewel that can't decide returns `{ input: null, reasoning }` with the evidence. It never throws to say "I don't know."
- **Propose a subset when that's the honest scope.** A triage jewel that never sets `assigneeId` and never proposes `resolved` (it can't know a fix shipped) is expressing policy through its output shape. Scope is part of the design.
- **Reasoning is audit-log prose.** Two or three plain sentences a teammate would find useful — name the evidence (the matching culprit, the precedent, the volume). No headers, no bullets, no emojis.

## Grading

Three modes, matched to the verb's shape:

- **Default (omit `grade`)** — deep-equal on the method input. Right when the whole input is the decision.
- **Field-scoped** — compare only the fields the human decided; return `skip` for housekeeping touches (the example above). Right for methods that mix judgment with maintenance.
- **Checklist judge** — for generative verbs (drafts, notes), equality is meaningless; grade with a rubric of booleans, never a preference score. `grade` is arbitrary TS and may be async, so it can call a model:

```typescript
grade: async ({ proposed, actual }) => {
  if (!proposed) return { verdict: 'disagree', notes: 'Abstained where the human wrote one.' };
  try {
    const rubric = await mindstudio.runTask({
      prompt: 'Judge whether two notes about the same issue reflect the same understanding. Grade strictly on content, not style.',
      input: { noteA: proposed.body, noteB: actual.body },
      tools: [],
      outputSchema: {
        type: 'object',
        properties: {
          sameDiagnosis: { type: 'boolean', description: 'Both point at the same root cause, or neither names one.' },
          noContradiction: { type: 'boolean', description: 'NOTE A asserts nothing NOTE B contradicts.' },
        },
        required: ['sameDiagnosis', 'noContradiction'],
      },
      model: 'claude-5-sonnet',
      maxTurns: 2,
    });
    const c = rubric.output;
    return c.sameDiagnosis && c.noContradiction
      ? { verdict: 'agree' }
      : { verdict: 'disagree', notes: `Failed: ${[!c.sameDiagnosis && 'sameDiagnosis', !c.noContradiction && 'noContradiction'].filter(Boolean).join(', ')}` };
  } catch (err) {
    return { verdict: 'skip', notes: `Judge failed: ${err instanceof Error ? err.message : String(err)}` };
  }
},
```

`actual` is always present in `grade` — grading only happens when a human acted. `proposed` is `null` when the jewel abstained; whether that's a disagreement is the grade's call (abstaining where the human also did nothing is agreement).

## Manifest Wiring

The method's manifest entry carries the autonomy level and the jewel pointer:

```jsonc
{
  "id": "update-issue",
  "name": "Update Issue",
  "path": "dist/methods/src/updateIssue.ts",
  "export": "updateIssue",
  "autonomy": "shadow",
  "jewel": { "path": "dist/methods/src/updateIssue.jewel.ts", "export": "default" }
}
```

Four levels: `manual` (no jewel ever — a policy statement), `shadow` (runs silently on every human invocation, pairs recorded, nothing visible), `approve` (jewel drafts, a human accepts/edits/rejects — the edit is the richest training signal there is), `auto` (the jewel acts under its own identity). **Start every new jewel at `shadow`.** Raising the level is a reviewed manifest diff justified by agreement evidence, and effects follow the mode: spied in shadow, applied at acceptance in approve, real in auto.

## Execution Model

`defineJewel` returns a callable executor with the config attached (`kind`, `method`, `subject`, `propose`, `grade`). The platform invokes it like any method export, with exactly one of two param shapes: `{ humanInput }` (a shadow run — the subject is derived via the projection, and `humanInput` doubles as ground truth) or `{ subject }` (an eval run against a scenario world — no human action, so the record is ungraded). It resolves to a versioned pair record:

```typescript
interface JewelPairRecord {
  v: 1;
  mode: 'shadow' | 'eval';
  subject?: unknown;
  proposed?: MethodInput | null; // null = abstention
  reasoning?: string;
  actual?: MethodInput;          // the human's input (shadow mode)
  verdict?: 'agree' | 'disagree' | 'skip';
  notes?: string;
  error?: { phase: 'subject' | 'propose'; message: string; stack?: string };
  startedAt: number;
  durationMs: number;
}
```

The executor never throws: a shadow run must never break anything. Your code failing inside `subject` or `propose` becomes the record's `error`; `grade` failing softens to verdict `skip`.

Shadowing runs only on the deployed app — dev traffic never fires jewels (dev invocations are synthetic and would pollute the pair ledger).

## Verifying a Jewel: the `testJewel` Tool

`testJewel` runs a jewel directly against an input you choose and returns the pair record inline. The method itself is never executed (no data changes) and nothing reaches the pair ledger — it's the authoring loop. The verification cycle:

1. Seed a realistic world first (`runScenario`) — the jewel's `propose` reads real state, so it needs something to look at.
2. Call `testJewel` with `humanInput` set to the exact input a human would have submitted: `{ method: "updateIssue", humanInput: { issueId: "...", status: "acknowledged", severity: "high" } }`. The jewel derives its subject from it, proposes, and grades against it — the record comes back with a verdict.
3. Read the record: does `subject` contain what you projected (and nothing that leaks the answer)? Is `reasoning` grounded? Does the verdict match your expectation? A `pair.error` with phase `subject` or `propose` is your code throwing — fix and re-run.
4. Repeat across a handful of inputs covering the method's decision space: a clear-cut case, an ambiguous one where abstention (`proposed: null`) is correct, and a housekeeping touch your `grade` should `skip`.

For cases with no known right answer, pass `subject` instead of `humanInput` — an ungraded eval run (propose only). Useful for probing behavior on edge-case subjects before you have ground truth.

Each run also lands in `.logs/requests.ndjson` as a `type: 'jewel'` record if you need the trail.

## Choosing Which Methods to Jewel

Reads and machine-triggered ingest are out by definition. Among the human verbs, favor the ones where pairs accumulate fastest and the decision is legible: classification first (closed outputs, exact grading), reference-picking second (dedupe/routing — abstention will dominate, which is correct), generative verbs last (checklist grading is real work). One jewel per judgment: if a jewel would need to take two actions, the methods are probably shaped wrong — fix the verbs, not the jewel.
