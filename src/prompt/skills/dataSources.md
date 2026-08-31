---
name: Data Sources
what: A managed retrieval system for document corpora, not a bolt-on keyword search. Documents are chunked and embedded, candidate hits are re-scored by a reranking model, semantic search runs alongside exact keyword matching so part numbers and error codes still land, images inside documents are described by a vision model and made searchable, and every hit returns a citation that links to its source page. Chunking and embedding settings are versioned — a rebuilt corpus can be compared against the live one and promoted without downtime. All of that applies to unstructured documents queried by meaning, and to nothing else.
when: Only for unstructured documents queried by meaning — "find the clause about early termination". Structured data belongs in `db`: if the question can be expressed as a filter, it is not a search problem, and a `WHERE` clause is faster, cheaper and exact. Load before defining or querying a data source.
---

# Data Sources (Search Over Documents)

Per-app searchable document corpora: upload documents, ask in plain language, get back the passages that answer it with a citation to the source.

**Most apps should not use one — check this before reaching for it.** Structured data (rows with fields you filter on) belongs in `db`; a `WHERE` clause is faster, cheaper and exact. A data source earns its cost only for **unstructured documents queried by meaning**. "Find the clause about early termination" is a data source. "Find contracts signed after March" is a `db` query. If the question can be expressed as a filter, it is not a search problem.

Don't use one when: the data is structured (`db`), you only need to store files (`files` — nobody is searching the contents), the requirement is exact lookup by identifier, or the corpus is a handful of short docs that fit in a prompt.

## Behaviour (read before the API)

- **One corpus shared across dev and prod** — like a file store, not a table. No dev copy, no per-release isolation. A document added while building is already live.
- **Scenarios never reset a data source.** Don't write `clear()`-style reset helpers.
- **Re-adding the same bytes is free** — content-addressed, so ingest scripts are safe to re-run.
- **Ingest is async.** `add()` returns once queued; poll `documents()`, or use `--wait` from the CLI.
- **Reprocessing costs real money**, so changing how a corpus is built is always explicit.
- **Limits apply**: 25 data sources per app, 5,000 documents per source, 10,000 chunks per document, 300 searches/minute. Well clear of normal use — but **source names must be fixed, not computed per user or per request**, since referencing one creates it. Partition inside a source with document metadata instead: tag at add time (`add(bytes, { filename, metadata: { userId } })`), narrow at search time (`search(q, { filter: { metadata: { userId } } })`).

## Defining and searching

```typescript
import { dataSources } from '@mindstudio-ai/agent';
export const Policies = dataSources.defineDataSource('policies');   // lowercase [a-z0-9_-], ≤64

const { results } = await Policies.search('what are the payment terms?', { topK: 5 });
const context = results.map((r) => r.text).join('\n\n');
```

Hits are `{ score, text, citation }` with `citation: { documentId, filename, pageNumber, chunkIndex, headingPath, boundingBox?, url }`, plus `retrievalRank`/`retrievalScore` — the position before reranking, so you can show what reranking did. With reranking on (the default) `score` is the reranker's 0–1 relevance and the right place for quality cutoffs; without it the scale varies by mode (cosine / rank-fusion / keyword overlap). `scoreThreshold` floors the retrieval branch before fusion and reranking — leave it unset unless measured on the corpus.

**Always render the citation.** `citation.url` is a stable on-domain link — put it in an `<a href>` beside the answer. Retrieval is approximate; a user who can click through can judge for themselves. An answer with no citation is an assertion.

Created on first use, so searching a source the build hasn't populated returns no results rather than throwing. `search` options: `topK` (default 5, max 50), `scoreThreshold`, `filter`, `mode`, `maxPerDocument`, `highlight`, `rerank`, `hybrid`.

**Filtering** narrows a search before ranking, and every condition only narrows: `filter: { metadata: { department: 'legal', year: [2025, 2026], signedAt: { gte: 20250101 } }, filename, documentIds, pages: { min?, max? }, contains: 'all these words', phrase: 'exact adjacent sequence' }`. Metadata matches per key: scalar = equals, array = any-of, `{ gte?, lte? }` = numeric range — ranges are numeric only, so store dates as sortable integers at add time (YYYYMMDD or epoch seconds) to range on them. Metadata is tagged at add time (scalars only, ≤16 keys); re-adding the same bytes with different metadata updates the tags in place, free. Filters are the right tool for scoping retrieval (per-user, per-category, a date window); they are NOT a substitute for a `db` query over structured data.

**Modes**: `mode: 'hybrid'` (default) fuses semantic and keyword retrieval; `'semantic'` is the embedding alone; `'lexical'` is keyword-only with **no query embedding** — cheapest and fastest, right when the query is an identifier (an error code, a SKU, a name) rather than a meaning. `maxPerDocument: 2` stops one document monopolizing the results when the answer should draw on several. `highlight: true` adds `matches` (`{start, end}` offsets into `text`) for rendering highlighted excerpts.

Search is deterministic for a fixed corpus and configuration, so eval sets and regression checks are meaningful — key them on `(documentId, chunkIndex)` rather than on chunk text.

**Debugging retrieval.** Two opt-in options, neither of which changes the results or their order: `explain: true` adds `explain.{dense, lexical, matchedVia}` (which half of hybrid found each hit; costs two extra round trips), and `expand: 1` adds `neighbors.{before, after}` for surrounding context. When a document never comes back at all, `Policies.stats()` reports the config actually in effect and `Policies.chunks(documentId)` shows exactly how it was split.

**Configuration is not declared in code** — chunking and embedding settings live on the corpus and are set with the CLI, so code and reality can't drift.

## Loading documents — normally at build time, from the CLI

```bash
remy-admin datasources add --source policies --wait docs/*.pdf
remy-admin datasources add --source policies --metadata department=legal,year=2026 contract.pdf
remy-admin datasources search --source policies "what are the payment terms?"   # sanity-check
remy-admin datasources search --source policies --filter department=legal --mode lexical "ERR-7741X"
remy-admin datasources delete --source policies   # whole source; --source is required, never defaulted
```

`--wait` blocks until processing finishes and exits non-zero on failure. Also `datasources list`, `status` (per-document state + ingest errors), `rm --document <id>`. `--help` for flags.

**Seeding a test corpus:** scenarios don't touch data sources, so load fixtures with the same command in a setup script — `datasources add --source <slug> --wait fixtures/*.pdf`. Re-running is free, so it needs no guard.

Use the SDK's `add()` only when *users* upload documents that must become searchable:

```typescript
await Policies.add(buffer, {
  filename: 'policy.pdf',
  contentType: 'application/pdf',
  metadata: { department: 'legal' },   // filterable at search time
});
const docs = await Policies.documents();   // 'processing' | 'done' | 'error'
await Policies.remove(documentId);
```

Formats: pdf, docx, pptx, xlsx, odt, rtf, epub, images, txt, md, json, csv, tsv, log, html.

## Answering from results

Retrieve → join passages as context → have a model answer *from that context* → render citations. Never paste raw chunks at the user; they're fragments. For agentic flows, give the model `search` as a tool so it can query repeatedly and refine, rather than retrieving once up front.

## Tuning — two kinds of setting

| Kind | Settings | Cost |
|---|---|---|
| **Free** (ranking) | `--rerank`, `--rerank-model`, `--hybrid`, `--top-k` | none, next search |
| **Rebuild** (how docs become vectors) | `--max-chars`, `--min-chars`, `--drop-blocks`, `--contextual`, `--contextual-model`, `--describe-images`, `--embedding-model`, `--extraction-model` | every document reprocessed |

Images inside documents are described by a vision model and the description substituted into the searchable text (`--describe-images`, on by default) — without it a chart contributes nothing to search at all. Documents with no images cost nothing.

`rerank` and `hybrid` default on and are usually right — reranking is the biggest quality lever, and hybrid is what finds part numbers, error codes and proper nouns a semantic model never learned. Both are also per-query (`search(q, { rerank: false })`) for a latency-sensitive path.

```bash
remy-admin datasources config --source policies              # show
remy-admin datasources config --source policies --top-k 8    # free, immediate
```

**A rebuild-class change on a populated corpus is rejected** — you're told what it would invalidate and what it costs. To make it, build a new version alongside the live one:

```bash
remy-admin datasources revectorize --source policies --max-chars 900 --wait
remy-admin datasources search --source policies --candidate "payment terms"   # compare
remy-admin datasources promote --source policies                              # go live
```

Search serves the current version throughout, so nothing degrades while the new one builds. `datasources drop` discards an unwanted candidate.

For anything deeper on the SDK, ask `askMindStudioSdk` rather than guessing at an API.
