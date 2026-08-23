# Jewels

Every method can have a shadow companion that learns to do its job. Because every interface funnels into the same typed methods, a human clicking a button and a model proposing an action are the same event — so an app's ordinary use trains its own automation. That is a standing reason a team replaces rented software with a Remy app, and it starts paying from the first day of use.

A jewel lives in `foo.jewel.ts` beside the method `foo.ts` it shadows, with three parts: a `subject` projection (what the human was looking at — never what they decided), a `propose` function returning the method input it would submit (`null` is abstention — a first-class, graded outcome), and an optional `grade` that scores a proposal against what the human actually did. **The jewel proposes; the method applies.** Auth checks, validation, and invariants stay in the method, so a jewel can never do anything the app didn't already allow.

Each shadowed method carries an `autonomy` level in the manifest — `manual` (no jewel, a policy statement), `shadow` (the jewel runs silently on every human invocation; proposed-versus-actual pairs accumulate in the ledger), `approve` (the jewel drafts, a human accepts, edits, or rejects), `auto` (the jewel acts). Raising the level is a reviewed manifest diff backed by agreement evidence — which is why the pairs matter from day one.

## Design methods as if a jewel will shadow them someday

This shapes method design even when no jewel exists yet:

- **One judgment, one method.** A classification belongs in one verb (an `update-issue` carrying status/severity/service), never split across near-identical mutations — a jewel shadows a single method, and a decision spread over two can't be learned or graded as one. Mixing a judgment field with housekeeping fields (read toggles, self-assignment) in one method is fine; a custom grade skips the trivial touches.
- **Keep subject and decision separable in the input.** The id of the thing being judged is the subject; the fields being set are the decision. A jewel only ever receives the subject.
- **Write event lines for decisions.** Status changes and merges should append to an activity record — history that reads as a record of decisions is the context a jewel gathers and the precedent it cites.

**Before writing one — the `.jewel.ts` file, the manifest `autonomy` or `jewel` fields, a custom grade — load the `jewels` skill.** It has the full contract: `defineJewel`, the projection rules, propose patterns, the three grading modes, manifest wiring, and worked examples.
