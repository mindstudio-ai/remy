# Data Sources (Search Over Documents)

Per-app searchable document corpora. Upload PDFs, docs and text; ask questions in plain language; get back the passages that answer them, each with a citation pointing at the source document.

**Most apps should not use one.** If your data is structured — rows with fields you filter on — a table and a `WHERE` clause is the right tool, and it is faster, cheaper and exact. A data source earns its cost in one specific situation: **unstructured documents, queried by meaning rather than by value.** "Find the contract clause about early termination" is a data source. "Find contracts signed after March" is a `db` query. If you can express the question as a filter, it isn't a search problem.

```typescript
import { dataSources } from '@mindstudio-ai/agent';

export const Policies = dataSources.defineDataSource('policies');

const { results } = await Policies.search('what are the payment terms?');
```

The platform owns parsing, chunking, embedding, indexing and tenant isolation. You declare the source, load documents into it, and search it.

## How a Data Source Behaves

- **One corpus, shared across dev and prod — like a file store, not like a table.** There is no dev copy and no per-release isolation. A document you add while building is *already there in prod*. Adding or removing one changes what the deployed app retrieves, immediately.
- **Scenarios never reset a data source.** A scenario truncates DB tables to seed test *rows*; a corpus is durable and left alone. Don't write `clear()`-style reset helpers, and don't expect a clean slate per run.
- **Re-adding the same bytes is free.** Documents are content-addressed, so re-running your ingest over an unchanged corpus transfers nothing and embeds nothing. Ingest scripts are safe to re-run.
- **Ingest is asynchronous.** `add()` returns as soon as the document is queued; parsing and embedding run in the background and take a while. Poll `documents()` for status, or use `--wait` from the CLI.
- **Reprocessing costs real money.** Every document has to be parsed and embedded. Changing how a corpus is built is therefore deliberate, never a side effect (see *Tuning*, below).
- **There are limits.** 25 data sources per app, 5,000 documents per source, 10,000 chunks per document, and 300 searches per minute. They sit well clear of normal use, and if you have a real reason to exceed one, get in touch — they're not a plan tier. The one worth designing around is the source limit: because naming a source creates it, a name computed per user or per request will run through it. Use one source and a metadata filter instead: tag documents at add time (`metadata: { userId }`) and scope searches with `filter: { metadata: { userId } }` (see *Filtering*, below).

## Defining a Data Source

Like `db.defineTable` and `files.defineStore`, define at module scope and import the handle into methods. Nothing executes until you await a method.

```typescript
import { dataSources } from '@mindstudio-ai/agent';

export const Policies = dataSources.defineDataSource('policies');
```

Names are lowercase `[a-z0-9_-]`, ≤ 64 chars. The source is created on first use, so naming one the build hasn't populated yet isn't an error — it just searches empty.

**Configuration is not declared in code.** How documents are chunked and embedded lives on the corpus itself and is set with the CLI (see *Tuning*). That's deliberate: it keeps one source of truth for how a corpus was actually built, so code and reality can't drift apart.

## Loading Documents — Usually at Build Time

**Normally you load a corpus yourself, during the build, from the CLI** — not through app code. Upload the files into the project, then:

```bash
mindstudio-prod datasources add --source policies --wait docs/*.pdf
```

`--wait` blocks until processing finishes, so you can search immediately afterwards, and it exits non-zero if a document failed. Then sanity-check the corpus before writing code against it:

```bash
mindstudio-prod datasources search --source policies "what are the payment terms?"
```

Other subcommands: `datasources list` (sources with counts), `datasources status` (per-document state and ingest errors), `datasources rm --document <id>`, and `datasources delete --source <slug>` — the whole source: every version, document and vector. Deletion requires an explicit `--source` (it never falls back to the default) and refuses while documents are still ingesting. Extraction caches survive by content hash, so re-ingesting the same files elsewhere costs no re-extraction. Run `mindstudio-prod datasources --help` for flags.

Supported formats: `pdf`, `docx`, `pptx`, `xlsx`, `odt`, `rtf`, `epub`, images (`png`, `jpg`, `webp`, `gif`, `avif`, `tiff`), and text (`txt`, `md`, `markdown`, `json`, `csv`, `tsv`, `log`, `html`).

### Seeding a corpus for testing

Scenarios seed database tables and deliberately don't touch data sources (durable, shared, nothing to reset). The supported way to get a known corpus into dev is the same `add` command, in a setup script next to your scenarios:

```bash
mindstudio-prod datasources add --source policies --wait fixtures/*.pdf
```

Re-running it is free (content-addressing means an unchanged corpus transfers nothing and embeds nothing), so it's safe to run on every setup rather than guarding it.

### When the app loads documents instead

Use `add()` when *users* upload documents that need to be searchable — a knowledge base the customer maintains. For an ingest you control, prefer the CLI.

```typescript
await Policies.add(buffer, {
  filename: 'policy.pdf',
  contentType: 'application/pdf',
  metadata: { department: 'legal', year: 2026 },   // filterable at search time
});
const docs = await Policies.documents();   // status: 'processing' | 'done' | 'error'
await Policies.remove(documentId);
```

`add()` carries bytes in the request body, so it's for ordinary-sized documents. Very large files belong on the CLI path.

`metadata` tags the document for search-time filtering: scalars only (string / number / boolean), up to 16 keys, keys `[a-zA-Z0-9_-]`. From the CLI it's `datasources add --metadata department=legal,year=2026 <file>`. Re-adding the same bytes with different metadata updates the tags in place — no re-processing, no cost. Supplying metadata replaces the document's whole metadata object.

## Searching

```typescript
const { results } = await Policies.search('what are the payment terms?', { topK: 5 });

const context = results.map((r) => r.text).join('\n\n');
```

Each hit is `{ score, text, citation }`, where `citation` is `{ documentId, filename, pageNumber, chunkIndex, headingPath, boundingBox?, url }`.

**Always show the citation.** `citation.url` is a stable, on-domain link to the source document — put it in an `<a href>` next to the answer. Retrieval is approximate by nature, and a user who can click through to the source can tell for themselves whether the answer is grounded. An answer with no citation is an assertion.

Options: `topK` (default 5, max 50), `scoreThreshold`, `filter`, `mode`, `maxPerDocument`, `highlight`, and two switches covered under *Tuning* (`rerank`, `hybrid`).

Each hit also carries `retrievalRank` and `retrievalScore` — where retrieval put it *before* reranking. Comparing that with its final position is how you see what reranking actually did.

**Score semantics.** `score`'s scale depends on how the search ran: cosine similarity in `semantic` mode, a rank-fusion reciprocal in `hybrid` (small numbers that are not similarities), keyword-overlap weight in `lexical`. When reranking ran, `score` is the reranker's 0–1 relevance instead, and the retrieval value is preserved as `retrievalScore`. With reranking on (the default), `score` is the one scale stable across modes, so put quality cutoffs there. `scoreThreshold` is different: it floors the retrieval branch *before* fusion and reranking (a per-embedding-model cosine floor, not a relevance cutoff), so leave it unset unless you've measured it on your corpus.

Alongside `results` the call returns `latencyMs` and `mode` — what the search **actually did**: `{ search, hybrid, reranked, pipelineVersion }`. Check it when a result surprises you: an omitted `mode` option falls back to the corpus's own configuration, and `reranked` is false when reranking was skipped or failed open. It's how you tell a deliberate lexical search from one whose option never arrived.

### Filtering

`filter` narrows a search **before** ranking, and every condition ANDs — a filter can only narrow:

```typescript
await Policies.search('termination clause', {
  filter: {
    metadata: { department: 'legal', signedAt: { gte: 20250101 } },  // scalar = equals; array = any-of; {gte,lte} = numeric range
    pages: { max: 10 },
    phrase: 'notice period',           // exact adjacent word sequence
  },
  maxPerDocument: 2,                   // stop one document monopolizing the results
});
```

Fields: `metadata`, `filename` (one or several), `documentIds`, `pages: { min?, max? }`, `contains` (all these words, any order), `phrase` (exact sequence). Metadata ranges are numeric only — to filter by date, store dates as sortable integers at add time (`20250315`-style YYYYMMDD, or epoch seconds) and range on those. Filters scope *retrieval* — per-user partitions, categories, a date window, a required identifier. They are not a substitute for a `db` query: if the whole question is expressible as a filter, it belongs in the database.

### Modes

`mode` selects which retrieval branches run: `'hybrid'` (default — semantic and keyword fused), `'semantic'` (the embedding alone), or `'lexical'` — keyword matching only, with **no query embedding**. Lexical is the cheapest and fastest mode, and the right one when the query is an identifier rather than a meaning:

```typescript
await Logs.search('ERR-7741X', { mode: 'lexical' });
```

### Highlighting

`highlight: true` adds `matches` to each hit — `{ start, end, token }` offsets into `text` (`text.slice(start, end)` is the matched term, and `token` says which query term it was, for colouring or grouping). Matching is keyword-based, so a hit that matched semantically may report an empty array.

Only the query's **distinctive** terms are marked, not all of them. English function words (`the`, `for`, `is`, `of`) are never marked, and where a passage holds more matches than it can usefully show, the rarest terms win the space. So `what is the policy for parental leave` marks `policy`, `parental` and `leave` and nothing else — otherwise a natural-language query lights up most of the passage and you'd need your own stopword list to render anything. Words you filtered on (`contains`, `phrase`) are always marked.

### Reproducibility

Search is **deterministic**: the same query against the same corpus, with the same settings, returns the same hits in the same order. There is no seed to set, and none is needed. So an eval set or a regression check measures your changes rather than noise.

Two things legitimately move results, both yours: adding or removing documents, and changing the corpus configuration.

Key those checks on `(documentId, chunkIndex)`, not on the chunk text. That pair is a chunk's stable identity for as long as the corpus keeps its current configuration. A rebuild-class change moves the chunk boundaries and therefore renumbers them, which is expected rather than a sign of nondeterminism.

### Debugging retrieval

Two opt-in options, both off by default because they cost something and neither changes the results or their order:

```typescript
const { results } = await Policies.search(question, { explain: true, expand: 1 });

results[0].explain;    // { dense, lexical, matchedVia } — which half of hybrid found it
results[0].neighbors;  // { before, after } — the chunks either side, for context
```

`explain` costs two extra round trips: a hybrid result carries one fused score, so the dense and lexical branches have to be asked separately. It's what turns "the results changed when I toggled hybrid" into "this passage was found by the keyword branch only" — worth reaching for when a search returns something you can't account for.

When the puzzle is a document that *never* comes back, the answer is usually in how it was split:

```typescript
const stats = await Policies.stats();          // counts + the config actually in effect
const chunks = await Policies.chunks(docId);   // exactly how one document was split
```

### Feeding results to a model

The common shape is retrieve-then-answer: search, join the passages into context, ask a model to answer *from that context*, and render the citations alongside. Don't paste raw chunks at the user — they're fragments, not prose.

For agentic flows, hand search to the model as a tool rather than retrieving once up front. It can then search several times, refine its query, and stop when it has enough — which beats a single fixed retrieval on anything but the simplest question.

## Tuning

There is no chunking or retrieval setup that suits every dataset, so these are yours to change. Settings come in two kinds, and the difference is what a change costs.

| Kind | Settings | Cost to change |
|---|---|---|
| **Free** — how results are ranked | `--rerank`, `--rerank-model`, `--hybrid`, `--top-k` | none; effective on the next search |
| **Rebuild** — how documents become vectors | `--max-chars`, `--min-chars`, `--drop-blocks`, `--contextual`, `--contextual-model`, `--describe-images`, `--embedding-model`, `--extraction-model` | every document must be reprocessed |

```bash
mindstudio-prod datasources config --source policies                 # show current settings
mindstudio-prod datasources config --source policies --top-k 8       # free, applies immediately
```

The free switches are also per-query, for the rare case where one call needs different behaviour — as are `mode`, `filter`, `maxPerDocument` and `highlight`, which are per-query only:

```typescript
await Policies.search(query, { rerank: false });   // e.g. a latency-sensitive path
```

**Images inside documents are described by a vision model and the description is substituted into the searchable text** (`--describe-images`, on by default). Without it a chart or diagram contributes nothing to search at all — it isn't ranked lower, it's absent. A document with no images costs nothing, which is why this is on rather than opt-in.

Both `rerank` and `hybrid` default **on** and are usually right. `rerank` re-scores candidates with a model that reads the query and passage together — the biggest single gain in result quality. `hybrid` combines meaning-based search with exact keyword matching, which is what finds part numbers, error codes and proper nouns that a semantic model never learned.

### Changing how documents are processed

**A rebuild-class change on a corpus that already has documents is rejected.** Nothing happens silently — you're told what would be invalidated and what it costs. To actually make the change, build a new version alongside the live one:

```bash
mindstudio-prod datasources revectorize --source policies --max-chars 900 --wait
mindstudio-prod datasources search --source policies --candidate "payment terms"   # compare
mindstudio-prod datasources promote --source policies                              # go live
```

Search keeps serving the current version the whole time, so nothing degrades while the new one builds, and you can compare before committing. `datasources drop` discards a candidate you don't want.

Re-processing reuses the stored parse of each document, so changing chunking never re-runs document extraction — only re-chunking and re-embedding.

## Deeper SDK Questions

`askMindStudioSdk` knows the full `@mindstudio-ai/agent` surface — every method, option and return type. Ask it rather than guessing at an API.

## When to Use a Data Source — and When Not To

**Use one when:** the content is unstructured prose (contracts, policies, manuals, research, support history, transcripts), the question is about meaning rather than field values, and users would otherwise be reading documents to find answers.

**Don't use one when:**

- **The data is structured.** Products, orders, users, events — that's `db`. Filtering and sorting on fields is what a database is for; retrieval is worse at it in every respect.
- **You only need to store files.** If nobody is searching the *contents*, use `files`. A data source is a search index that happens to hold documents, not a place to keep them.
- **Exact matching is the requirement.** "Find the invoice numbered INV-4021" is a lookup. Retrieval ranks by similarity and can rank the wrong thing first.
- **The corpus is tiny and fixed.** A handful of short documents that fit in a prompt don't need an index — just include them.
