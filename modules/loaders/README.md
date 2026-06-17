# @dkm/loaders — Loader Port + Graph Loader (spec 003)

The pluggable **loader architecture** that consumes the intermediate JSONL and fans it
out to storage ("extract once, load many"). Phase 1 delivers the first concrete loader —
the **graph loader** — plus the orchestrator that runs loaders over a run's JSONL files.

See [specs/003-intermediate-jsonl-and-loaders.md](../../specs/003-intermediate-jsonl-and-loaders.md)
and the feature doc [docs/features/phase-1/03-graph-loader.md](../../docs/features/phase-1/03-graph-loader.md).

## Layout

- `src/port.ts` — `LoaderPort`, `LoadResult`/`LoadError`, and the `LoaderOrchestrator` contract.
- `src/contract.ts` — `runLoaderPortContractTests(name, factory)`: the suite every loader passes.
- `src/jsonl-reader.ts` — streaming `readJsonl`/`concatJsonl` (`AsyncIterable`, never buffers a file).
- `src/mapping.ts` — `entryToNode` / `entryToEdge` (data-driven; new inventory types need no edit).
- `src/graph-loader.ts` — `GraphLoader`: writes through the spec-002 `GraphPort`.
- `src/orchestrator.ts` — `MultiLoaderOrchestrator`: register loaders; run a run's two files.
- `src/in-memory-stub.ts` — a reference `LoaderPort` for contract testing.
- `src/vector-loader.ts` — `VectorLoader`: the **second** loader (Feature 07), embeds entities
  into an `InMemoryVectorIndex` via an `Embedder` seam (`src/embedder.ts`, `src/vector-index.ts`).

## GraphLoader behaviour

- **Streaming**, **entity-first** (`orderedProcessing: true`): inventory entries become nodes;
  relationship entries become edges only once both endpoints exist — a missing endpoint is a
  **non-retriable** error in `errors[]`, not a crash.
- **Idempotent**: a re-run of the same `runId` reports `skipped == total`, `loaded == 0`, graph
  unchanged. `rollbackRun(runId)` removes that run's nodes/edges (reversal recorded in the event log).
- **Skip-and-continue**: one bad entry never aborts the load; errors are classified retriable vs not.
- **OCP**: a future vector/PostgreSQL loader joins via `orchestrator.registerLoader()` with **no
  change** to this loader or the orchestrator. The closed surfaces are the `LoaderPort` signature,
  the JSONL fixed core, and the graph port.

The loader consumes the Python pipeline's JSONL **purely via files** — no in-process coupling.

## VectorLoader behaviour (Feature 07 — the loader OCP proof)

`VectorLoader` is the **second** `LoaderPort`. It reads the **same** `{runId}-extractions.jsonl`
the graph loader does and embeds each entity into an in-memory vector index — "extract once,
load many" — added with **zero edits** to extraction, the graph loader, the port, or the
orchestrator (it joins a run via `orchestrator.registerLoader(...)` only).

- **Embeds entities**: text from `data` (name/description, else JSON) → vector via the
  `Embedder` seam → upsert `{ entryId, embedding, payload }` keyed by `entryId`.
- **Ignores relationships** (`orderedProcessing: false`): a `type: "Relationship"` entry is
  skipped without error (spec 003 D2 — vector loaders ignore the relationship file).
- **Idempotent / rollback**: re-running a `runId` skips (never re-embeds); `rollbackRun(runId)`
  removes that run's vectors. `requiredFields: ["data"]` — a missing `data` is a non-retriable
  failure surfaced by the orchestrator.
- **Embedder**: there is **no in-process TypeScript LLM gateway** (Feature 02's gateway is
  Python, cross-process), so the default is a deterministic **`FakeEmbedder`** (stable
  hash-based vectors, fixed dimension) — no API key, no network, CI-green. A real embedder is
  **deferred** behind the same seam (Phase 3+).

### Vector DB — deferred (ADR-0002)

This is deliberately a **stub**: it proves the port suffices for a vector target while the
product choice (pgvector / Qdrant / …) stays **deferred** behind `targetStore:
"in-memory-vector"`. The requirements it places on a real store — embedding dimension, upsert
by id, idempotency keyed by `(entryId, runId)`, run-scoped delete, payload filtering — are
captured in [ADR-0002](../../docs/adr/0002-vector-store-selection-deferred.md). The index is
**write-only** this phase; the semantic-search query path is Phase 3+ (Feature 04).

## Running the Neo4j-backed integration test locally (opt-in)

The Neo4j variant of `graph-loader.int.test.ts` **auto-skips unless `NEO4J_URI` is set** (never a
CI gate). To exercise the full JSONL → Neo4j round-trip locally:

```bash
docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5

NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
  pnpm exec vitest run modules/loaders
```
