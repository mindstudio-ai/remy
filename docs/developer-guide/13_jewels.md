# Jewels

A jewel is an optional AI companion for a single app method: `foo.jewel.ts` beside `foo.ts`. It proposes the method call a human would otherwise make. The method's `autonomy` setting in the manifest decides what happens to each proposal: recorded silently, queued for human review, or committed. Every proposal is graded against what really happened.

A jewel is arbitrary TypeScript, typically deterministic guardrails plus a [task agent](12_task-agents.md) for the judgment itself.

---

## What a Jewel Is For

A jewel attaches to exactly one method and proposes the input a human user would otherwise submit. It is for **decisions**: the method invocations someone has to make.

If the AI's output is content the app displays (a summary, an extraction, a chart caption), that is plain model code inside a method (`runTask` in the body), not a jewel. A jewel exists when there is a decision to record, review, or grade.

### The five decision shapes

Any recurring human decision, in any app, is one of these:

- **Choose one of N** — route a ticket, assign a lead, categorize an expense. Closed enum output.
- **Set a value under policy** — price a job, size a discount, set a reorder quantity. Scalar judgment.
- **Gate** — approve a refund, advance a candidate, accept a listing. Binary plus reasoning.
- **Match / reference-pick** — flag a duplicate, pair a reviewer to a submission. Candidate-ID enum; most runs abstain, and that is the right outcome.
- **Draft outbound** — a reply, a quote, an offer. Generative, checklist-graded, and the natural home of approve mode.

### Not a fit

- **Reads** (`get-*`, `list-*`) — no decision to learn.
- **Machine-triggered ingest verbs** (webhook, cron, sync handlers) — no human demonstration. Ingest *code* may still hand a decision moment to a judgment verb via `mindstudio.jewels.propose`; see [Arrival Triggers](#arrival-triggers-mindstudiojewelspropose).
- **Deterministic mutations** — if the correct input is computable, compute it in the method. A jewel learns judgment, not arithmetic.
- **AI-as-a-feature** — a method that needs a model as part of its own work just calls `runTask` in its body.
- **Verbs that should stay human as policy** — declare `"autonomy": "manual"` in the manifest so the choice is recorded.

One jewel per judgment. If a jewel would need to take two actions, the methods are shaped wrong; fix the verbs.

---

## Adoption Posture

Jewels are not part of an initial build, and most apps will never need one.

**Build AI features plainly first.** A drafting feature is a method that calls a model and returns text, with no jewel machinery anywhere. Converting it later is cheap. At `shadow` the conversion is purely additive — a `.jewel.ts` beside the method and an `autonomy` line in the manifest.

At `approve`, the jewel takes over as the sole producer: it proposes what the plain feature used to write, in the same place the human already saw it, and the plain generation is retired. There is only ever one generator, because a jewel graded against human edits of some *other* model's draft is measuring model against model, not model against the team.

Start with exactly one verb.

---

## Method Shape Comes First

A jewel is only as learnable as the verb it shadows. These four habits are also what make converting a plain feature later cheap:

- **One judgment, one method.** The decision lives in one verb, never split across near-identical mutations. Keep the judgment verb free of housekeeping (read toggles and self-assignment belong in a separate edit method) so the default grade tells the whole story.
- **Subject and decision separable in the input.** The ID of the thing being judged is the subject; the fields being set are the decision. A jewel only ever receives the subject.
- **Event lines for decisions.** Status changes and reassignments append to an activity record. History that reads as decisions is the precedent a jewel cites.
- **Judgment moments are states; verbs are transitions.** When several jeweled verbs are alternatives on the same subject (a new record gets categorized, merged, or archived, never two of those), don't add an orchestrator to encode the exclusivity. Make it structural: the alternatives compete for one explicit status field, each method's precondition consumes it (`status === 'new'`), and each jewel's matching guardrail (`if (status !== 'new') abstain`) is that same precondition expressed as abstention. The first committed transition wins and every other verb fails closed on its own check. Each jewel then answers one question ("would my verb apply here?") and abstention does the routing.

If two verbs can't be separated by abstention discipline, a union verb is missing: introduce the method whose input carries the real decision (`{ action: 'categorize' | 'merge' | 'archive', ... }`) and jewel that instead.

---

## The API

**The jewel proposes; the method applies.** A jewel's output type is the shadowed method's input type. It never writes anything itself. Auth checks, validation, and invariants stay in the method, so the jewel walks through the same door as every human and every interface. It cannot do anything the app didn't already allow.

Three functions, one call. Declare `subject` before `propose`: the subject type is inferred from the projection's return and flows into `propose`'s parameter.

| Function | Required | Purpose |
|---|---|---|
| `subject` | Yes | A typed projection from the method's input to what identifies the work (`{ recordId }`). Never include the human's decision fields; the jewel exists to produce the decision, so handing it the answer would poison every pair. |
| `propose` | Yes | Arbitrary TypeScript returning `{ input: MethodInput \| null, reasoning: string, trace? }`. `input: null` is abstention — a correct and graded outcome. `reasoning` is written to the ledger and is most valuable on abstention. |
| `grade` | No | Scores `{ proposed, actual }` and returns `{ verdict: 'agree' \| 'disagree' \| 'skip', notes?, trace? }`. Omit it for deep-equal on the method input. `skip` means "this pair isn't a graded moment." |

The jewel runs as its own platform-managed user with a normal session, so `auth.userId` is set, `requireUser()`-style helpers pass unchanged, and role checks in methods apply to it exactly as they do to humans. See [Auth & Roles](06_roles-and-auth.md).

### The pair record

`defineJewel` returns a callable executor with the config attached (`kind`, `method`, `subject`, `propose`, `grade`). The platform invokes it like any method export, with exactly one of two param shapes: `{ humanInput }` (a shadow run: the subject is derived via the projection, and `humanInput` doubles as ground truth) or `{ subject }` (an eval run: no human action, so the record is ungraded). It resolves to a versioned pair record:

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

**The executor never throws** — a shadow run must never break anything. Code failing inside `subject` or `propose` becomes the record's `error`; `grade` failing softens to verdict `skip`.

### Where shadowing runs

Invocation shadowing runs only on the deployed app. Dev invocations are synthetic and would pollute the pair ledger.

The arrival flow is different: `jewels.propose` on `approve`/`auto` methods runs for real in dev sessions. The jewel executes from local source, queue items are scoped to the dev session, and `auto` commits apply against the dev database, so the app's hot path is testable end to end. None of it is recorded: no pairs, no grading, no training data.

---

## Writing a Jewel

The skeleton: deterministic guardrails before any model call, context via the app's own methods, a runtime-built enum, and fail-closed abstention.

```typescript
// dist/methods/src/categorizeRecord.jewel.ts
import { defineJewel, mindstudio } from '@mindstudio-ai/agent';
import { categorizeRecord } from './categorizeRecord';
import { getRecord, listCategories } from './common/records';

export default defineJewel(categorizeRecord, {
  // Projection: what the human was looking at, never what they decided.
  subject: ({ recordId }) => ({ recordId }),

  propose: async ({ recordId }) => {
    // Deterministic outs first, as plain-code abstention; no model call needed.
    const record = await getRecord(recordId);
    if (!record || record.category) return { input: null, reasoning: 'Nothing to categorize.' };

    const categories = (await listCategories()).map((c) => c.name);
    try {
      const task = await mindstudio.runTask({
        prompt: CATEGORIZATION_POLICY, // operator-voice policy prose (see below)
        input: { record, categories },
        tools: [{ appMethod: 'list-records', description: 'Find precedent: how comparable records were categorized.' }],
        outputSchema: {
          type: 'object',
          properties: {
            category: { enum: [...categories, null] }, // runtime enum: it cannot invent a category; null = abstain
            rationale: { type: 'string' },
          },
          required: ['category', 'rationale'],
        },
        model: 'claude-5-sonnet', // ask askMindStudioSdk; don't copy this one blind
        maxTurns: 6,
      });
      if (!task.output.category) return { input: null, reasoning: task.output.rationale };
      return {
        input: { recordId, category: task.output.category },
        reasoning: task.output.rationale,
        // Preserves the model transcript with the pair: the training row,
        // and at auto the audit trail.
        trace: task.traceId,
      };
    } catch (err) {
      // Couldn't produce conforming output; abstain with the evidence. Fail closed.
      return { input: null, reasoning: `Task agent failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
  // No grade: the whole input is the decision, so default deep-equal is right.
});
```

That is choose-one-of-N. The other four shapes reuse the skeleton wholesale — what changes is the output schema (a number under policy, a boolean gate, a candidate-ID enum, a drafted body) and the grading mode.

### Writing `propose`

To keep the signal clean, the task prompt inside `propose` addresses the model as the responsible operator. It never mentions shadowing, jewels, mirrors, grading, or a human whose action it should match. Consulting precedent is fine: "look up how comparable records were categorized and follow the team's conventions" is what a real operator does.

- **Keep `propose` effect-free.** In shadow runs the platform absorbs database reads and writes into a disposable mirror, and that is the *only* thing it absorbs. Everything else a jewel's code does is real in every mode: an email sends, an HTTP POST posts, a file write persists. If a proposal seems to require causing an effect to decide, that is a design error. Gather evidence, propose the input, let the method act.
- **Guardrails before judgment.** Handle the deterministic outs in plain code before any model call. Every guardrail is a documented abstention in the ledger.
- **Context is plain imports plus tools.** Prefetch what every run needs (the row, its history, the inventory of valid values) into the task input; expose the app's own read methods as tools for what the agent should decide to look up (precedent, comparables). Tool calls are recorded with the pair.
- **Use `runTask` with `outputSchema` for the judgment.** Build enums at runtime: a candidate-ID enum means the agent structurally cannot reference a row that doesn't exist, and a known-values enum means it cannot invent a category. Put `null` in the enum so abstention is a first-class output rather than a formatting accident.
- **Catch everything; abstain on failure.** A jewel that can't decide returns `{ input: null, reasoning }` with the evidence. It never throws to say "I don't know."
- **Attach the deciding task's trace.** `trace: task.traceId` on the success return preserves the full model transcript with the pair; use an array when the story has chapters (`trace: [first.traceId, escalation.traceId]`). Helper and formatting calls stay unattached — the attachment labels which run *was* the decision. A pair without a trace still grades, but it is thin as evidence and as training data.
- **Propose a subset when that's the honest scope.** A jewel that never sets `assigneeId` and never proposes `closed` (it can't know a fix shipped) is expressing policy through its output shape.
- **Reasoning is audit-log prose.** Two or three plain sentences a teammate would find useful; name the evidence. No headers, bullets, or emojis.

---

## Grading

Three modes, matched to the verb's shape.

`actual` is always present in `grade` — grading only happens when a human acted. `proposed` is `null` when the jewel abstained, and whether that is a disagreement is the grade's call (abstaining where the human also did nothing is agreement).

### Default (omit `grade`)

Deep-equal on the method input. Right when the whole input is the decision, which is the hallmark of a well-shaped transition verb.

### Field-scoped

Compare only the fields the human decided; return `skip` for housekeeping touches. This is for methods that must stay wide, mixing judgment with maintenance. A wide method that needs grade gymnastics is often a verb boundary that should be fixed instead:

```typescript
grade: ({ proposed, actual }) => {
  const decided = (['status', 'priority', 'owner'] as const).filter((k) => actual[k] !== undefined);
  if (decided.length === 0) return { verdict: 'skip', notes: 'Housekeeping touch, not a decision.' };
  if (!proposed) return { verdict: 'disagree', notes: 'Abstained where the human decided.' };
  const misses = decided.filter((k) => proposed[k] !== actual[k]);
  return misses.length === 0
    ? { verdict: 'agree' }
    : { verdict: 'disagree', notes: misses.map((k) => `${k}: proposed ${proposed[k]}, human ${actual[k]}`).join('; ') };
},
```

### Checklist judge

For generative verbs (drafts, notes), equality is meaningless. Grade with a rubric of booleans, never a preference score. `grade` is arbitrary TypeScript and may be async, so it can call a model:

```typescript
grade: async ({ proposed, actual }) => {
  if (!proposed) return { verdict: 'disagree', notes: 'Abstained where the human wrote one.' };
  try {
    const rubric = await mindstudio.runTask({
      prompt: 'Judge whether two drafts responding to the same item take the same action. Grade strictly on substance, not style.',
      input: { draftA: proposed.body, draftB: actual.body },
      tools: [],
      outputSchema: {
        type: 'object',
        properties: {
          sameResolution: { type: 'boolean', description: 'Both take the same substantive action (same resolution, same escalation, same answer), or neither does.' },
          noContradiction: { type: 'boolean', description: 'DRAFT A asserts nothing DRAFT B contradicts.' },
        },
        required: ['sameResolution', 'noContradiction'],
      },
      model: 'claude-5-sonnet',
      maxTurns: 2,
    });
    const c = rubric.output;
    return c.sameResolution && c.noContradiction
      ? { verdict: 'agree', trace: rubric.traceId }
      : { verdict: 'disagree', notes: `Failed: ${[!c.sameResolution && 'sameResolution', !c.noContradiction && 'noContradiction'].filter(Boolean).join(', ')}`, trace: rubric.traceId };
  } catch (err) {
    return { verdict: 'skip', notes: `Judge failed: ${err instanceof Error ? err.message : String(err)}` };
  }
},
```

---

## Autonomy Levels

| Level | What happens |
|---|---|
| `manual` | No jewel ever. A recorded policy statement. |
| `shadow` | Runs silently on every human invocation. Pairs recorded, nothing visible. |
| `approve` | The jewel drafts; a human accepts, edits, or rejects. The edit is the richest training signal there is. |
| `auto` | The jewel acts under its own identity. |

**Auto is the only level earned with evidence.** Shadow and approve are both safe starting points; pick by what the product is. When the proposals themselves are the product (drafts for review), start at `approve` — it is often the permanent home. When the evidence is the product (an auto-bound verb), start at `shadow`. The levels differ in what exists, not in presentation: at approve the human sees and edits the proposal before it takes effect; at shadow nothing ever surfaces. Raising to `auto` is a reviewed manifest diff justified by agreement numbers.

**Choose approve by the verb's risk, not by default.** Reversible state-machine verbs (routing, classification, where a mistake is a two-click correction) go shadow → auto with a `sampleRate` canary and skip approve, because a review queue on a high-agreement classifier adds work without adding safety. Approve belongs on irreversible or outward-facing verbs (send, publish, charge, refund). `sampleRate` controls risk at the population level; those verbs need per-instance gating, which is what approve provides.

### `sampleRate`

Optional, default 1. The level's canary and cost dial: the fraction of eligible decision moments that receive the full autonomy treatment.

At `shadow` it is a cost control — `0.25` shadows a quarter of invocations, and expected dashboard coverage drops to match. At higher levels the remainder shadow-records instead, so a ramp keeps measuring its control. Omit it unless the verb is hot enough that shadowing every invocation is a real cost.

### Manifest wiring

Two lines on the method's manifest entry:

```jsonc
{
  "id": "categorize-record",
  "name": "Categorize Record",
  "path": "dist/methods/src/categorizeRecord.ts",
  "export": "categorizeRecord",
  "autonomy": "shadow",
  "jewel": { "path": "dist/methods/src/categorizeRecord.jewel.ts", "export": "default" },
  "tuning": {}
}
```

See [Manifest Reference](03_manifest-reference.md) for the full field list, including `attributionWindow`.

---

## Training a Jewel's Own Model

`tuning` (optional) is the training recipe for the jewel's own model. Every knob has a platform default and most jewels never set any. It requires `jewel`, and it rides the release — changing a knob is a commit and deploy before the next training run.

| Knob | Default | Meaning |
|---|---|---|
| `base` | `qwen3.5-4b` | Which model to train, from the platform's small menu (`qwen3.5-9b` and `gpt-oss-20b` are the larger alternatives). The default is the right choice unless a report shows it falling short. |
| `windowDays` | all history | How many days of ledger history to train on |
| `epochs` | 3 | 1–10 |
| `rank` | 16 | LoRA rank, 4–64 |
| `learningRate` | 1e-4 | — |

### Running a training job

Once a method has accumulated graded pairs, train from the prod CLI: `remy-admin jewels train <methodId>` (see `--help`). It returns immediately with a run ID and the dataset report. A run takes minutes to tens of minutes.

Check progress with `remy-admin jewels run <runId>`. The `progress` field shows the live phase and training percent. The run's `log` records the whole story as timestamped status events (queued, GPU acquired, training, grading; loss points are compacted to a count in CLI output). `status` goes `complete` or `failed` with the full report.

The dataset report says whether the ledger is trainable — **pairs without an attached `trace` don't count.**

### What a run produces

A downloadable LoRA adapter plus a held-out agreement report: how often the trained model matched the team's decisions on pairs it never saw. The adapter and report land in the app's own file store (`models/` in the Files dashboard). See [Files & Storage](08_files-and-storage.md).

The agreement number is `report.selected.agreement` when present, else `report.grading.agreement` — scored by the jewel's own `grade` function, the same grader as the pairs dashboard. A completed run without a `grading` block hasn't been graded yet; `remy-admin jewels grade <runId>` fills it.

A run trains multiple checkpoint candidates (per-epoch snapshots, plus a DPO pass over the team's corrections once enough have accumulated) and the platform promotes whichever scores highest on that grader. `report.selected` names the serving checkpoint. This is automatic, never something you configure.

A completed run registers the app's tuned model as a real model ID: `tuned/{appId}/{methodId}`, one stable ID per method that retraining advances in place. The latest complete run per method is automatically served on the platform's GPU pool, so that ID works like any other model the moment training finishes. There is no special invoke tool: to sanity-check or demo a tuned model, make an ordinary generate-text call with that model ID.

### Promotion

Switching a jewel onto its own tuned model is a one-line change: swap the `model` ID inside the jewel's existing `runTask` call for the tuned one. The git commit is the promotion record, and reverting it is the rollback.

Tool-using jewels promote too — the tuned model was trained on the jewel's full transcripts, tool calls included, and the training report's `toolEval` block shows how faithfully it makes the teacher's tool decisions. This applies to qwen bases only; `gpt-oss` can't drive tools yet, and the platform rejects that combination with a clear error.

**One hard rule: never restructure the propose path to a plain generate-text call when promoting.** That silently loses both `outputSchema` validation and the task `traceId`, so the jewel's new pairs stop being trainable and the learning loop dies. `runTask` with the tuned ID keeps both.

---

## Arrival Triggers (`mindstudio.jewels.propose`)

Invocation shadowing fires when a human acts. For decision moments the app detects itself (an ingest branch that lands a row in its pending state), hand the moment to the jewels from backend code:

```typescript
// In the ingest path, after a record lands in (or regresses back to) status 'new':
mindstudio.waitUntil(proposeIntake(record.id));

async function proposeIntake(recordId: string): Promise<void> {
  // Priority is app code: dedupe dominates; a duplicate must never be categorized.
  const dup = await mindstudio.jewels.propose(
    'flag-duplicate', { sourceId: recordId }, { idempotencyKey: recordId });
  if (dup.outcome !== 'committed') {
    await mindstudio.jewels.propose(
      'categorize-record', { recordId }, { idempotencyKey: recordId });
  }
}
```

The platform routes each proposal by the method's autonomy. Possible `outcome` values:

| Outcome | Meaning |
|---|---|
| `recorded` | Shadow: the proposal waits in a ledger and is graded later against whatever the human eventually does, within the method's `attributionWindow`. If a human then invokes the method, their action grades the waiting proposal instead of firing a second run. |
| `queued` | Approve. Returns `queueItemId`. |
| `committed` | Auto: the method ran. Check for this to short-circuit lower-priority verbs. |
| `abstained` | The jewel declined. |
| `disabled` | No jewel, or `manual`. Returned, never thrown. |
| `skipped` / `failed` / `pending` | — |

Rules that matter:

- **Always wrap the chain in `mindstudio.waitUntil(...)`.** Each propose blocks for the jewel's run, and ingest must return immediately.
- **Share one `idempotencyKey` across the moment's verbs**, usually the row's ID. It has Stripe semantics (a replayed key returns the original outcome, so webhook retries are invisible), and the shared key is what lets a human action on one verb grade the sibling proposals cross-verb.
- **The subject passed must equal what the jewel's projection produces** from the method input (field-pick projections guarantee this). It is the join key between the arrival proposal and the human's later action.
- **Order alternatives by priority and short-circuit on `committed`.** Exclusivity is enforced by the methods' state preconditions, not by this chain; ordering only saves wasted runs.
- **Propose only when a decision moment is actually created.** Over-proposing costs a cheap guardrail abstention, but a moment that isn't row-backed (no pending state to consume) usually means the schema is missing a state.

---

## Native Approval Flows (`jewels.queue`)

For `approve`-mode methods, the queue is data, not a screen: proposals surface wherever the human already makes this decision. When the app has an editor for the decision, the pending proposal pre-fills it and the human's normal confirm action resolves it. A dedicated inbox is only for decisions that have no existing place in the UI.

Three pieces:

```typescript
// 1. Backend list method, gated with the APP'S reviewer role.
export async function listPendingDrafts() {
  auth.requireRole('reviewer');
  return mindstudio.jewels.queue.list({ methodId: 'send-message' });
}

// 2. Frontend surfaces items where the decision already lives (pre-fill the existing
//    editor); render subject, proposed input, reasoning.

// 3. Backend resolve method: approve applies, dismiss records.
export async function reviewDraft(input: {
  itemId: string;
  action: 'approve' | 'dismiss';
  edited?: Record<string, unknown>;
}) {
  auth.requireRole('reviewer');
  return mindstudio.jewels.queue.resolve(input.itemId, {
    action: input.action,
    ...(input.edited ? { input: input.edited } : {}),
  });
}
```

What makes this safe with no extra machinery:

- **Approving applies the target method as the signed-in reviewer.** The effect belongs to the human who clicked, and the target method's own auth checks are the real gate on who may approve. Gate the wrapping list and resolve methods with the app's reviewer role as well.
- **Let reviewers edit before approving** by passing the edited input. The platform captures proposed, edited, and final with the pair. An accept/reject-only review UI leaves the most valuable training signal on the table.
- **Dismissal is not consumption.** The decision moment stays open for other verbs — a dismissed draft doesn't block a later merge. Unresolved items expire at the method's `attributionWindow`, so there is no infinite backlog.
- `propose` returns `queueItemId` on `queued`, so the app can badge its UI or send its own notification the moment a draft lands.

Before the app has its own review UI, the same queue is reachable from `remy-admin jewels queue` and `remy-admin jewels resolve`. Approving there applies the method as the user through the identical machinery.

---

## Verifying a Jewel

In the editor, the `testJewel` tool runs a jewel directly against a chosen input and returns the pair record inline. The method itself is never executed (no data changes) and nothing reaches the pair ledger. This is the authoring loop.

The verification cycle:

1. **Seed a realistic world first** with a [scenario](15_scenarios.md). The jewel's `propose` reads real state, so it needs something to look at.
2. **Call `testJewel` with `humanInput`** set to the exact input a human would have submitted: `{ method: "categorizeRecord", humanInput: { recordId: "...", category: "..." } }`. The jewel derives its subject from that input, proposes, grades against it, and the record comes back with a verdict.
3. **Read the record.** Does `subject` contain what you projected, and nothing that leaks the answer? Is `reasoning` grounded? Does the verdict match expectation? A `pair.error` with phase `subject` or `propose` is your code throwing — fix and re-run.
4. **Repeat across a handful of inputs** covering the method's decision space: a clear-cut case, an ambiguous one where abstention (`proposed: null`) is correct, and a housekeeping touch that `grade` should `skip`.

For cases with no known right answer, pass `subject` instead of `humanInput` for an ungraded eval run (propose only). Useful for probing behavior on edge-case subjects before ground truth exists.

Each run also lands in `.logs/requests.ndjson` as a `type: 'jewel'` record if you need the trail.

Once deployed, the prod-side view lives in `remy-admin jewels` (run `--help` for commands): agreement stats, pair records, the approval queue, and `jewels dryrun` — the prod twin of `testJewel`, which runs the live jewel against a real subject inside a disposable database mirror and records nothing.

---

## Related

- [Methods](05_methods.md) — the verb a jewel shadows, and where its shape is decided
- [Task Agents](12_task-agents.md) — how a jewel exercises judgment
- [Manifest Reference](03_manifest-reference.md) — `autonomy`, `jewel`, `sampleRate`, `attributionWindow`, `tuning`
- [Auth & Roles](06_roles-and-auth.md) — the jewel runs as a real user with real role checks
- [Scenarios](15_scenarios.md) — seeding the world a jewel reads
