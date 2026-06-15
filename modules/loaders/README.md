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

## Running the Neo4j-backed integration test locally (opt-in)

The Neo4j variant of `graph-loader.int.test.ts` **auto-skips unless `NEO4J_URI` is set** (never a
CI gate). To exercise the full JSONL → Neo4j round-trip locally:

```bash
docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5

NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
  pnpm exec vitest run modules/loaders
```
