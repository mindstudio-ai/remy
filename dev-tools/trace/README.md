# Debug-bundle trace transformer

Turns an unzipped bug-report debug bundle into one normalized, jq-able `trace.json`. The schema (and its design rationale) lives in `types.ts`; the transformer is deterministic and judgment-free — it reconciles the bundle's five overlapping records (conversation, runtime log, usage ledger, sandbox status, app activity) into flat arrays sharing one identity system (`turnIndex`, `toolCallId`, `requestId`), and marks everything it can't know (missing files, rotated log heads, decapitated sessions, truncated results) in `meta.integrity`.

## Usage

```sh
node dev-tools/trace/index.ts ~/Downloads/remy-debug-<id>            # writes <bundle>/trace.json
node dev-tools/trace/index.ts <bundle-dir> -o /tmp/trace.json
```

Node ≥22 required (runs TypeScript directly; the remy type imports are type-only and erased at runtime). Typecheck with `npx tsc --noEmit -p dev-tools/trace`.

## Reading a trace

Start with trust and triage, then follow the ids:

```sh
jq '.meta.integrity' trace.json                          # what can this bundle NOT tell me
jq '.meta.totals' trace.json                             # headline: cost, tokens, errors, span
jq '.turns[] | {index, trigger: .trigger.text[0:80], outcome, durationMs, errorCount}' trace.json
jq '.errors[] | {ts, source, summary}' trace.json        # unified error ledger
jq '.toolCalls[] | select(.name=="screenshot") | {turnIndex, durationMs, cost}' trace.json
jq '.toolCalls[] | select(.depth>0)' trace.json          # sub-agent-internal calls, flattened
jq '.llmCalls[] | select(.kind=="cli") | {cliAction, durationMs, turnIndex}' trace.json
jq '[.llmCalls[] | select(.turnIndex==5)] | map(.cost) | add' trace.json
jq '.logLines[] | select(.turnIndex==5 and .level=="error")' trace.json
```

Sub-agent transcripts nest on the tool call that spawned them (`.toolCalls[].subAgent.turns`), but their tool calls also appear in the flat `toolCalls` array with `depth > 0` and a `path` of spawning ids — so "every vision call anywhere" is one selector. Joins made by explicit id are unmarked or `attribution: "id"`; timestamp-window inferences carry `attribution: "window"` — treat those as probable, not proven.
