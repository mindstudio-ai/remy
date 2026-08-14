# Data Sources (Search Over Documents)

Per-app searchable document corpora: upload documents, ask in plain language, get back the passages
that answer it with a citation to the source.

**Most apps should not use one — check this before reaching for it.** Structured data (rows with
fields you filter on) belongs in `db`; a `WHERE` clause is faster, cheaper and exact. A data source
earns its cost only for **unstructured documents queried by meaning**. "Find the clause about early
termination" is a data source. "Find contracts signed after March" is a `db` query. If the question
can be expressed as a filter, it is not a search problem.

Don't use one when: the data is structured (`db`), you only need to store files (`files` — nobody is
searching the contents), the requirement is exact lookup by identifier, or the corpus is a handful of
short docs that fit in a prompt.

## Behaviour (read before the API)

- **One corpus shared across dev and prod** — like a file store, not a table. No dev copy, no
  per-release isolation. A document added while building is already live.
- **Scenarios never reset a data source.** Don't write `clear()`-style reset helpers.
- **Re-adding the same bytes is free** — content-addressed, so ingest scripts are safe to re-run.
- **Ingest is async.** `add()` returns once queued; poll `documents()`, or use `--wait` from the CLI.
- **Reprocessing costs real money**, so changing how a corpus is built is always explicit.

## Defining and searching

```typescript
import { dataSources } from '@mindstudio-ai/agent';
export const Policies = dataSources.defineDataSource('policies');   // lowercase [a-z0-9_-], ≤64

const { results } = await Policies.search('what are the payment terms?', { topK: 5 });
const context = results.map((r) => r.text).join('\n\n');
```

Hits are `{ score, text, citation }` with
`citation: { documentId, filename, pageNumber, headingPath, boundingBox?, url }`.

**Always render the citation.** `citation.url` is a stable on-domain link — put it in an `<a href>`
beside the answer. Retrieval is approximate; a user who can click through can judge for themselves.
An answer with no citation is an assertion.

Created on first use, so searching a source the build hasn't populated returns no results rather than
throwing. `search` options: `topK` (default 5, max 50), `scoreThreshold`, `rerank`, `hybrid`.

**Configuration is not declared in code** — chunking and embedding settings live on the corpus and are
set with the CLI, so code and reality can't drift.

## Loading documents — normally at build time, from the CLI

```bash
mindstudio-prod datasources add --source policies --wait docs/*.pdf
mindstudio-prod datasources search --source policies "what are the payment terms?"   # sanity-check
```

`--wait` blocks until processing finishes and exits non-zero on failure. Also `datasources list`,
`status` (per-document state + ingest errors), `rm --document <id>`. `--help` for flags.

**Seeding a test corpus:** scenarios don't touch data sources, so load fixtures with the same command
in a setup script — `datasources add --source <slug> --wait fixtures/*.pdf`. Re-running is free, so
it needs no guard.

Use the SDK's `add()` only when *users* upload documents that must become searchable:

```typescript
await Policies.add(buffer, { filename: 'policy.pdf', contentType: 'application/pdf' });
const docs = await Policies.documents();   // 'processing' | 'done' | 'error'
await Policies.remove(documentId);
```

Formats: pdf, docx, pptx, xlsx, odt, rtf, epub, images, txt, md, json, csv, tsv, log, html.

## Answering from results

Retrieve → join passages as context → have a model answer *from that context* → render citations.
Never paste raw chunks at the user; they're fragments. For agentic flows, give the model `search` as a
tool so it can query repeatedly and refine, rather than retrieving once up front.

## Tuning — two kinds of setting

| Kind | Settings | Cost |
|---|---|---|
| **Free** (ranking) | `--rerank`, `--hybrid`, `--top-k` | none, next search |
| **Rebuild** (how docs become vectors) | `--max-chars`, `--min-chars`, `--drop-blocks`, `--contextual`, `--embedding-model`, `--extraction-model` | every document reprocessed |

`rerank` and `hybrid` default on and are usually right — reranking is the biggest quality lever, and
hybrid is what finds part numbers, error codes and proper nouns a semantic model never learned. Both
are also per-query (`search(q, { rerank: false })`) for a latency-sensitive path.

```bash
mindstudio-prod datasources config --source policies              # show
mindstudio-prod datasources config --source policies --top-k 8    # free, immediate
```

**A rebuild-class change on a populated corpus is rejected** — you're told what it would invalidate
and what it costs. To make it, build a new version alongside the live one:

```bash
mindstudio-prod datasources revectorize --source policies --max-chars 900 --wait
mindstudio-prod datasources search --source policies --candidate "payment terms"   # compare
mindstudio-prod datasources promote --source policies                              # go live
```

Search serves the current version throughout, so nothing degrades while the new one builds.
`datasources drop` discards an unwanted candidate.

For anything deeper on the SDK, ask `askMindStudioSdk` rather than guessing at an API.
