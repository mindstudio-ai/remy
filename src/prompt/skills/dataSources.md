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
- **Limits apply**: 25 data sources per app, 10,000 chunks per document, 300 searches/minute, and 5,000 documents per source when documents are added one at a time (bulk jobs and connectors, below, are how a corpus grows past that). Well clear of normal use — but **source names must be fixed, not computed per user or per request**, since referencing one creates it. Partition inside a source with document metadata instead: tag at add time (`add(bytes, { filename, metadata: { userId } })`), narrow at search time (`search(q, { filter: { metadata: { userId } } })`).
- **Credentials never appear in code or in chat.** A bucket's keys are app secrets (`remy-admin secrets set NAME --prod <value>`, or the dashboard); everything else refers to them by NAME. If the user pastes a key into the conversation, set it as a secret for them to use moving forward.

## Defining and searching

```typescript
import { dataSources } from '@mindstudio-ai/agent';
export const Policies = dataSources.defineDataSource('policies');   // lowercase [a-z0-9_-], ≤64

const { results } = await Policies.search('what are the payment terms?', { topK: 5 });
const context = results.map((r) => r.text).join('\n\n');
```

Hits are `{ score, text, citation }` with `citation: { documentId, filename, pageNumber, chunkIndex, headingPath, boundingBox?, url }`, plus `retrievalRank`/`retrievalScore` — the position before reranking, so you can show what reranking did. With reranking on (the default) `score` is the reranker's 0–1 relevance and the right place for quality cutoffs; without it the scale varies by mode (cosine / rank-fusion / keyword overlap). `scoreThreshold` floors the retrieval branch before fusion and reranking — leave it unset unless measured on the corpus.

**Always render the citation.** A document is a cousin of a file and has the same links. `citation.url` is the stable path on the app's own domain, free and never expiring, that works for a signed-in user of the app — put it in an `<a href>` beside the answer as-is. For a public search tool, or a UI on another origin, sign it the way you would a private file: `search(q, { shareCitations: 3600 })` returns every `citation.url` as an absolute signed link that needs no session, and `Policies.shareUrl(hit.citation, { expiresIn })` signs one document on demand (default 24h). A signed link is a bearer capability until it expires, so sign at render time rather than storing signed results. When a link is not wanted at all, render `filename` and `pageNumber` as text. Retrieval is approximate; a user who can click through can judge for themselves. An answer with no citation is an assertion.

Created on first use, so searching a source the build hasn't populated returns no results rather than throwing. `search` options: `topK` (default 5, max 50), `scoreThreshold`, `filter`, `mode`, `maxPerDocument`, `highlight`, `rerank`, `hybrid`.

**Filtering** narrows a search before ranking, and every condition only narrows: `filter: { metadata: { department: 'legal', year: [2025, 2026], signedAt: { gte: 20250101 } }, filename, documentIds, pages: { min?, max? }, contains: 'all these words', phrase: 'exact adjacent sequence' }`. Metadata matches per key: scalar = equals, array = any-of, `{ gte?, lte? }` = numeric range — ranges are numeric only, so store dates as sortable integers at add time (YYYYMMDD or epoch seconds) to range on them. Metadata is tagged at add time (scalars only, ≤16 keys); re-adding the same bytes with different metadata updates the tags in place, free. Filters are the right tool for scoping retrieval (per-user, per-category, a date window); they are NOT a substitute for a `db` query over structured data.

**Modes**: `mode: 'hybrid'` (default) fuses semantic and keyword retrieval; `'semantic'` is the embedding alone; `'lexical'` is keyword-only with **no query embedding** — cheapest and fastest, right when the query is an identifier (an error code, a SKU, a name) rather than a meaning. `maxPerDocument: 2` stops one document monopolizing the results when the answer should draw on several. `highlight: true` adds `matches` (`{start, end}` offsets into `text`) for rendering highlighted excerpts.

Search is deterministic for a fixed corpus and configuration, so eval sets and regression checks are meaningful — key them on `(documentId, chunkIndex)` rather than on chunk text.

**Debugging retrieval.** Two opt-in options, neither of which changes the results or their order: `explain: true` adds `explain.{dense, lexical, matchedVia}` (which half of hybrid found each hit; costs two extra round trips), and `expand: 1` adds `neighbors.{before, after}` for surrounding context. When a document never comes back at all, `Policies.stats()` reports the config actually in effect and `Policies.chunks(documentId)` shows exactly how it was split.

**A cold index (shared capacity).** By default a data source lives on shared retrieval capacity: its vectors sit in their own isolated partition of a pool many apps share, and the pool keeps only a working set resident. A source nobody has searched for a while is unloaded to make room and reloaded from durable storage on the next search. A small corpus reloads inside that search and nobody notices; a large one (hundreds of thousands of chunks) reloads in the background for a minute or two, and `search()` throws `index_warming` (HTTP 503) until it lands. That means *loading*, never *empty*: catch it, tell the user the knowledge base is warming up, and retry shortly. Before a demo, `remy-admin datasources hydrate --source <slug> --wait` reloads it ahead of time. The way out of the cycle is dedicated capacity (below): a source on its own provisioned retrieval is never unloaded and never warms. It has one pause of its own instead: while a bulk load runs, the index is not built behind every write, it is built once when the load finishes, and until then `search()` throws `index_building` (HTTP 503) with "N of M vectors indexed" in the message. Same handling as `index_warming`: the knowledge base is being built, never empty. `remy-admin datasources list` shows the index as `deferred`, `building` or `ready`.

**Configuration is not declared in code** — chunking and embedding settings live on the corpus and are set with the CLI, so code and reality can't drift.

## Working with someone's data

People are bad at describing their own data, and the more of it they have the worse the description gets. "We have SO much data and a really complex system" is often a few thousand pages of PDFs; "just some documents" is occasionally a bucket of ten million records. Treat the description as a mood, not a measurement. This section is how you find out what is really there and set expectations to match, before any tooling comes up.

**1. Get real data in hand first.** Before proposing anything, ask for a sample of the actual thing: a handful of representative files, a link to where they live, or wherever the data is. Ask in the user's terms — "can you give me a few examples of what we're working with?" — as a `promptUser` form with a `file` question (`multiple: true`) and a text field for a link or a location. Let them answer however they can: if the data lives in an S3 bucket, for example, they will say so, and the bucket becomes the sample once its keys are set as app secrets (`datasources inspect --connector`). Do not ask them to size or classify it; that is your job once you can see it. What arrives depends on how much they brought: files land under `src/.user-uploads/` (documents with an extracted-text sidecar at `<path>.txt`; a folder as `<folder>.zip`, unpack it), and a folder too large to hand over that way is streamed into the app's private `uploads` file store instead, and the answer is a landing `{ store, prefix, files, bytes }` you read in place.

**2. Look, then say what it is.** Poke around the sample yourself: the files on disk, or for a landing `datasources inspect --store uploads --prefix <folder>/` plus `remy-admin files get` on a few keys (a landing's file count and bytes already tell you how big the corpus, or its known fraction, is). From it you can tell whether the file is the document (PDFs, Word, slides, pages, plain text: built-in extraction handles it) or a container of records (JSON, JSONL, CSV exports, a database dump: the file is not the document and the source needs a mapper); how big each one is; and whether there is one shape or several. The one thing a sample cannot tell you is how much more there is, so ask exactly that, in whatever terms the user has (a folder, a year of exports, a bucket). Then say what you found back in plain words.

**3. Pick the rung from the count, and say it before any tooling.** The count decides the path, never the adjectives.
- Up to a few hundred files: `datasources add`, a few dollars, the shared pool. Nothing else in this skill needs to come up; jobs, connectors and capacity stay out of the conversation.
- Thousands to a few hundred thousand documents: a job with a plan before anything is spent, still the shared pool (up to about a million chunks), a mapper only if the file is not the document. Tens to a few hundred dollars.
- Millions of records, or tens of gigabytes: the full path described below. Embedding runs over time based on rate limits, storage and compute are real line items, and the plan will likely answer `plan_requires_dedicated`, which is the moment dedicated capacity is discussed, with its price, and not before.

**4. The two ways this goes wrong.** 
- Over-building: a user who sounds big doesn't need connectors and dedicated retrieval for a folder of PDFs; the rung, said out loud before any tooling, is the guard. 
- Under-explaining: when the data really is big, the user has usually been handed keys and told "go do RAG" and has never been told what that entails. Walk them through it in plain numbers: it costs money in three places (embedding, storage, and possibly dedicated compute); it takes time because embedding is rate-limited (a truly massive corpus might take days, even! but the system is designed for exactly this. 99% of users will never need this, though); there are decisions only they can make and you will stop for each; the first search on a cold index is slow; and here is roughly what the bill looks like before anyone spends. Self-described "RAG experts" get the same walkthrough, phrased as what this platform will do rather than what RAG is: respect the expertise, verify the specifics anyway.

**5. The order of operations for a real load.** Once the sample says this is a load rather than an `add`, this is the shape; each step is detailed in the sections below.

1. **Look before you promise.** `datasources inspect` over the store or the bucket: key shapes, counts and bytes by extension, size buckets, sampled heads with their JSON keys. Report it in the user's vocabulary: how many objects, how many formats, what is not documents, which parts nobody mentioned.
2. **Ask the questions only the user can answer**, as a form, and stop for them: what is in scope and what is not, what one document is (a file, a record, the latest version of a record), what counts as a duplicate, what to do with the low-value kinds, who holds the rights to anything third-party. Do not guess these; they decide what the mapper does.
3. **Shape it, if the file is not the document.** Write the mapper and `map test --dev` it over twenty real objects; read the outcomes back to the user as documents, metadata and skips with reasons. Adjust and re-run. When the outcomes read right, push a branch, `releases wait`, then `map deploy`: that build's mapper becomes the source's. Nothing is published.
4. **Sample before the whole thing.** `jobs start --limit 500` loads a slice cheaply; search it; fix the mapper; `remap`. A mistake on five hundred documents costs cents.
5. **Show the plan and get an explicit yes.** The plan is the bill: documents, chunks, cost per stage, storage, duration, and whether the corpus fits where the source lives. Present it, then `jobs approve`. If it answers `plan_requires_dedicated`, the size decision comes first: show the offering's price, get a yes, `infra provision`, `datasources move`, then approve.
6. **Run it, and read what came out.** `jobs status` for progress and the last failures; `jobs quarantine` for what the mapper skipped or failed on, by reason; fix, push, `map deploy`, `jobs replay`. Search works on the partial corpus throughout.
7. **Keep it current.** For a bucket, a cron method calling `Source.sync()`; for anything else, the same job re-run (unchanged objects cost nothing).
8. **Measure before you change anything.** A sample source and an eval set; compare versions and models with numbers, and ask before promoting.

Three rules hold throughout: credentials are app secrets referred to by NAME and never appear in chat or code; nothing that spends is approved or provisioned without the user's explicit yes on the numbers; and dedicated capacity is proposed when a plan asks for it, not before.

### Building an initial app (intake) when a user brings a data source

When a user shows up with a data source from the first message, prefer the following workflow:
- Get a feel for the data, using the methods discussed above
- Then, and perhaps most importantly, understand what it is the user is trying to *do* with the data. Are they building a generic RAG chatbot, or something more interesting? What is important to them - grounding, citations, etc? And why?
- Vectorized data that does nothing isn't very useful - building the app that will consume it to do something compelling is the important bit.
- If the data smells truly large (e.g., will require async work, meaningful cost to ingest, or dedicated capacity/planning, etc), focus on putting a small sample of the data in a data source and then focus on building and delivering the MVP.
- After the MVP is built and the user feels good about it, you can help the user bring in the full data source.

## Loading documents — normally at build time, from the CLI

```bash
remy-admin datasources add --source policies --wait docs/*.pdf
remy-admin datasources add --source policies --metadata department=legal,year=2026 contract.pdf
remy-admin datasources search --source policies "what are the payment terms?"   # sanity-check
remy-admin datasources search --source policies --filter department=legal --mode lexical "ERR-7741X"
remy-admin datasources delete --source policies   # whole source; --source is required, never defaulted
```

`--wait` blocks until processing finishes and exits non-zero on failure. Also `datasources list`, `status` (per-document state + ingest errors), `rm --document <id>` or `rm --filter <k=v,...>`. `--help` for flags. For more than a few dozen files, use a job (below) rather than `add`.

**Seeding a test corpus:** scenarios don't touch data sources, so load fixtures with the same command in a setup script — `datasources add --source <slug> --wait fixtures/*.pdf`. Re-running is free, so it needs no guard.

Use the SDK's `add()` only when *users* upload documents that must become searchable:

```typescript
await Policies.add(buffer, {
  filename: 'policy.pdf',
  contentType: 'application/pdf',
  metadata: { department: 'legal' },   // filterable at search time
});
const docs = await Policies.documents({ ids: [document!.id] });   // 'processing' | 'done' | 'error'; plain documents() is the first thousand
for await (const doc of Policies.allDocuments()) { /* ... */ }    // walk a corpus of any size, oldest first, a page at a time behind the scenes
await Policies.remove(documentId);
```

Formats: pdf, docx, pptx, xlsx, odt, rtf, epub, images, txt, md, json, csv, tsv, log, html. When the file is not the document (a JSON record, a JSONL bundle of articles, a kill notice), the source needs a mapper — see below.

Removing many documents at once: `Policies.removeWhere({ metadata: { year: 2019 } })` or `{ externalIdPrefix: 'archive/2019/' }` (the key a job or connector recorded) removes every match, vectors and bytes included, in pages of a thousand. From the CLI, `datasources rm --source policies --filter year=2019`. An empty filter is refused; deleting a whole source is `datasources delete`, never something app code does.

## Loading a corpus of any size (jobs)

`datasources add` is for a handful of files. A corpus of thousands to millions of documents is loaded by a **job**, which reads either every object under a prefix of one of the app's file stores or a JSONL manifest of URLs, and shows a **plan before anything is spent**: documents, chunks, cost per stage at today's rates, storage, whether it fits where the source lives, and a duration.

```bash
remy-admin datasources jobs start --source archive --store raw --prefix 2024/ --wait     # plan, then stop
remy-admin datasources jobs status <id>                                                # read the plan
remy-admin datasources jobs approve <id> --wait                                        # the yes to the spend
remy-admin datasources jobs start --source archive --manifest urls.jsonl --limit 200 --approve --wait   # a cheap sample first
```

Two gates decide whether a plan can run: the corpus has to fit the source's placement (a shared-pool source over the per-source cap answers `plan_requires_dedicated`; see Dedicated capacity below), and the workspace has to be able to cover the projection (`insufficient_credits`). **Show the user the plan and get an explicit yes before approving** — the plan is the whole point. `--budget <dollars>` pauses the job at a ceiling; `--limit <n>` loads a sample of the corpus to check quality before committing to all of it. Unchanged documents are skipped by content hash, so re-running a job is free. `jobs pause|resume|cancel` are the controls; search works on the partial corpus throughout. One bulk operation per source at a time (`data_source_busy`).

## Keeping a corpus in sync with an S3 bucket (connectors)

When the documents live in a bucket the user owns, connect it once and sync from then on. The keys are the NAMES of two app secrets, set first:

```bash
remy-admin secrets set ARCHIVE_S3_KEY --prod <value>        # the user sets these, or does it in the dashboard
remy-admin secrets set ARCHIVE_S3_SECRET --prod <value>
remy-admin datasources connect --source archive --bucket acme-docs --region us-east-1 --prefix contracts/ --access-key-secret ARCHIVE_S3_KEY --secret-key-secret ARCHIVE_S3_SECRET --budget-per-sync 5
remy-admin datasources sync --source archive --wait     # first sync: plans the whole bucket, stops for approval if over the budget
remy-admin datasources sync --source archive --limit 20000 --concurrency 64   # a slice, run hard: how a big backfill is measured before it is approved
remy-admin datasources sync --source archive --concurrency 256 --priority    # the real backfill when the clock matters: the whole fleet, priority-tier embedding at 1.5x the embedding price
remy-admin datasources connector --source archive       # what it follows, last sync, object counts
```

`connect` checks that both secrets exist and that the keys can list the prefix before recording anything. `sync` lists the bucket, compares every object's ETag with what was ingested before, and runs a job over what is new or changed — auto-approved under the connector's per-sync budget, so **the first backfill of a big bucket stops for `jobs approve` by itself and the nightly deltas run unattended**. A changed object replaces its document; an object that disappears from the bucket takes its document with it at the end of the next full sync (`--deletions mirror`, the default; `keep` leaves them). A sync over an unchanged bucket costs nothing. Objects the extractors cannot read are skipped, not failed.

**Scheduling is the app's.** The nightly sync is an ordinary cron interface job whose method calls the SDK:

```typescript
// methods/sync-archive.ts — scheduled "0 3 * * *" in the cron interface (see the Scheduled Jobs skill)
export default async function () {
  const { job } = await Archive.sync();   // returns at once; the job plans and runs in the background
}
```

`Archive.jobs()` lists recent syncs and `Archive.job(id)` reads one — progress, plan, the last twenty per-document failures, and why it paused if it did. The connection itself (bucket, prefix, which secrets) is only ever made from the CLI or the dashboard; code can run a sync, not repoint one. `datasources disconnect --source archive` stops following the bucket and keeps every document.

## Mapping raw objects into documents (mappers)

A source takes every object it is given as one document through built-in extraction. When **the file is not the document** — JSON records that should become markdown plus metadata, a JSONL object that holds a thousand articles, a kill notice that means "remove this story", a bucket where only some keys matter — give the source a **mapper**: your code, one object in, documents out. This is how a structured archive becomes a corpus, and you write it.

**Inspect before you write.** `remy-admin datasources inspect --source archive --connector` (or `--store raw --prefix 2024/`) profiles the objects without reading them all: counts and bytes by extension and by key shape (`2024/#/{uuid}.json`), size buckets, and ten sampled heads with their top-level JSON keys. Report what you found and ask the questions only the user can answer (which prefixes, which schema generations, what counts as a duplicate) before writing a line.

```typescript
// datasources/archive.mapper.ts  — beside archive.ts, which exports Archive
import { defineMapper, documents, passthrough, skip, deletes } from '@mindstudio-ai/agent';
import { Archive } from './archive';

export default defineMapper(Archive, {
  map: async (object) => {
    if (!object.key.endsWith('.json')) return passthrough();           // PDFs etc. through built-in extraction
    const { item } = await object.json();
    if (item.type !== 'text') return skip(`not an article: ${item.type}`);
    if (item.pubstatus === 'canceled') return deletes([item.uri]);     // a kill notice
    return documents([{
      externalId: item.uri,                                            // the identity the platform replaces by
      title: item.headline ?? item.slugline,
      markdown: toMarkdown(item),
      metadata: { date: Number(item.versioncreated.slice(0, 10).replaceAll('-', '')), language: item.language },
      replaces: item.altids?.original_id,                              // a writethru supersedes its original
    }]);
  },
});
```

Declared in `mindstudio.json` — the compiler lifts it like a jewel and the platform runs it as an ordinary execution frame:

```json
"dataSources": [{ "slug": "archive", "mapper": { "path": "dist/datasources/archive.mapper.ts", "timeoutMs": 30000 } }]
```

`object` is `{ key, size, contentType, etag, lastModified, metadata }` plus lazy `bytes()`, `text()`, `json()`. Four outcomes: `documents([...])` (an array is one object → many documents; each `{ externalId, title, markdown, metadata?, replaces? }`), `passthrough({ metadata? })` (ingest the raw object as-is), `skip(reason)`, `deletes([externalId, ...])`. Throwing is the object's error. A mapper may call models (`runTask`) or `fetch` an API — it is your code — but every call is spend per object, so keep the common path cheap. `timeoutMs` is the per-object budget (default 30 s, max 300 s).

**Everything entering a mapped source is mapped** — jobs, syncs and `Source.add()` alike, one rule. `add()` on a mapped source returns `{ documents, document, outcome }` (several documents from one object is normal) and throws `mapper_skipped` when the mapper refused the object: surface that to the user as what it is, not as a generic failure.

The loop, in this order:

```bash
remy-admin datasources inspect --source archive --connector                        # look first
remy-admin datasources map test --source archive --connector --limit 20 --dev      # the LOCAL mapper, real objects, nothing ingested
# fix, re-run, until the outcomes read right; then push a branch and wait for its build
remy-admin releases wait
remy-admin datasources map deploy --source archive                                 # that build's mapper becomes the source's
remy-admin datasources map test --source archive --connector --limit 20            # the active mapper, same objects
remy-admin datasources sync --source archive --wait                                # or jobs start
remy-admin datasources jobs quarantine <id>                                        # what it skipped or failed on, by reason
remy-admin datasources jobs replay <id> --wait                                     # after a fix, push and map deploy: just those objects again
remy-admin datasources remap --source archive --wait                               # a changed mapper over every raw copy
```

**A mapper is a pure transform: one object in, documents out, nothing else.** `remap` and `jobs replay` run it again over the raw copies, and a frame runs in the context of the release that compiled it, so anything a mapper writes on the side is written twice and possibly into the wrong data plane. The per-document facts an app needs later belong in `metadata`; an app that wants its own view of a big corpus (a timeline, counts by year, a table of ids) builds it after ingest by walking `Source.allDocuments()` in a background task, and keeps it current from what each sync adds.

A mapper runs on the platform, so the platform has to build it. Any push builds it, and a branch push is a private preview build, which is all a mapper needs. `map deploy` then makes that build's mapper the source's active one: jobs, syncs and `add()` run it from then on, whether or not the app has ever been published. Publishing activates the mapper the live release declares — which is the one you deployed, since publishing fast-forwards the default branch to your branch. So there is nothing extra to do at publish time, and nothing to merge by hand: publishing is the merge (see the publishing skill). `jobs start` refuses with `mapper_not_deployed` while the dev session declares a mapper that is not yet active, because the job would otherwise load the raw records as documents.

`map test --dev` needs the dev session running (`npx mindstudio dev`); it runs the mapper from local source through the tunnel and prints every outcome with markdown previews. The plan of a mapped job records the mapper's outcome mix on its sample; a run whose skip share climbs past twice that pauses with `pauseReason: 'skips'` for a look at the quarantine. `remap` reads the platform's own raw copies — no origin traffic — skips unchanged markdown by hash, and supersedes changed documents, so a metadata tweak on a million-document source costs frames and little else. `externalId` is the identity everything replaces by; choose it deliberately (the record's stable id, never the key of a file that gets rewritten in place).

## Dedicated capacity

The shared pool holds a source up to a per-source cap of chunks. A corpus beyond it — a plan that answers `plan_requires_dedicated` — runs on dedicated retrieval capacity the workspace provisions and pays for hourly: `remy-admin infra list` shows the offering catalog with prices and any resources the app has, `infra provision --offering <id> --name <n> --wait` creates one, and `datasources move --source archive --to <resource-id> --wait` puts the source on it with its data intact (`create --placement <resource-id>` starts a new source there). Provisioning bills the workspace; **never provision without the user's explicit confirmation**, and show them the offering's price first. `infra --help` covers hibernate, resume, resize and destroy.

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

## Evaluating retrieval — measure before you promote

"Is the rebuilt version better?" and "which embedding model should this corpus use?" are measured, not guessed. The instrument is a query set (questions with the documents that should come back) run against a version, returning recall@k, MRR, nDCG, latency and cost per query as JSON. You present the table.

```bash
remy-admin datasources sample --source archive --size 300 --stratify year --wait      # a representative subset, same config as the parent
remy-admin datasources eval create --source archive-sample --name base --size 150 --wait    # 150 queries generated from the sample
remy-admin datasources eval run --set <setId> --label live --wait                            # score the live version
remy-admin datasources revectorize --source archive-sample --max-chars 900 --wait            # the change under test
remy-admin datasources eval run --set <setId> --candidate --label small-chunks --wait        # score the candidate
remy-admin datasources eval compare <runA> <runB>                                            # deltas + per-query wins/losses
remy-admin datasources eval result <runId> --worst 10                                        # what the misses retrieved instead
```

Rules that keep the numbers honest:

- **Work on a sample.** A sample shares the parent's exact pinned config and its documents' content hashes, so a set built on it also scores the parent (`eval run --set <id> --source archive`). Re-vectorizing a 300-document sample costs cents; the full corpus costs real money.
- **Generated queries are a start, not the truth.** The default `cloze` style holds a sentence out of a chunk — free and deterministic, but it flatters keyword matching because a real user does not type sentences from the document. `--style question` has a chat model write the question a user would ask (a model call per query). Add the questions the user actually cares about with `eval add --set <id> --query "..." --expect <filename>` or `eval import` from JSONL; tag them so `byTag` breaks the numbers down.
- **Runs cost searches.** Every query is a real search (embedding + rerank spend), capped at 2,000 per run. Say so before running a large set.
- **Read the branch breakdown.** `branches.{denseOnly, lexicalOnly, both}` says which half of hybrid found the answers; a corpus of part numbers and proper nouns lives on `lexicalOnly`, and that is the case for keeping hybrid on even when it costs latency.
- **Compare like with like.** Same set, same target, one change at a time: a version (`--candidate`), a retrieval override (`--mode`, `--rerank false`, `--rerank-model <id>`, `--hybrid false`), never both in one run.
- **Present, then recommend.** A table with run labels, recall@5, MRR, p50 latency and cost per query, then one sentence: promote or drop. Ask before promoting; it changes what the deployed app retrieves.

For anything deeper on the SDK, ask `askMindStudioSdk` rather than guessing at an API.
