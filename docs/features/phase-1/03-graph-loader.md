# Feature 03 — Graph Loader (JSONL → graph store)

## 1. Feature

- **Name**: Graph Loader — first `LoaderPort` implementation populating the graph store from JSONL
- **Plan step**: 1.3 — *Graph loader: first loader implementation reading from intermediate JSONL and
  populating graph store (in-memory for dev, Neo4j for integration)*
- **Spec(s) expanded**:
  [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md)
  (`LoaderPort`, orchestration, idempotency, ordering) and
  [specs/002-graph-persistence-port.md](../../../specs/002-graph-persistence-port.md)
  (the graph port + its in-memory and Neo4j adapters this loader writes through).

## 2. Summary & scope

Consume the intermediate JSONL from Feature 02 and populate the graph store: entities become nodes,
relationship entries become edges. The loader writes through the **Phase 0b graph persistence port**,
not a concrete DB — and per [D-P1.2](../../phase-1/decisions.md) the port gets **two adapters** this
phase: **in-memory** (unit/contract/dev) and **Neo4j** (integration). This closes the loop from
source to a populated, queryable graph.

**In scope**
- `graph-loader` implementing `LoaderPort` (spec 003 §Loader Port Interface).
- Streaming consumption (`AsyncIterable<JsonlEntry>`) — never load whole file into memory (Decision 4).
- **Entity-first then relationship** ordering so edge endpoints exist (spec 003 §Ordering, Decision 2).
- **Idempotency**: `hasProcessed(id, runId)`; re-run skips processed entries (spec 003 §Idempotency).
- Skip-and-continue + retriable/non-retriable error classification (Decision 3).
- `rollbackRun(runId)` and a `LoadResult` report.
- **Two graph adapters** behind the port: in-memory + Neo4j (D-P1.2). Mutations recorded to the
  event log (from the 0b port) for downstream cache invalidation/quality re-scoring.
- A minimal `LoaderOrchestrator` to run the loader against a run's two JSONL files.

**Out of scope**
- The second (vector) loader — Feature 07 (OCP validation).
- Full DLQ infrastructure — Phase 1 logs retriable errors; automatic DLQ retry is a later refinement.
- Cross-run deduplication / entity reconciliation (spec 003 Open Q3) — Phase 5.
- PostgreSQL loader — Phase 3.

## 3. Dependencies

- **Upstream**: Feature 02 (produces the JSONL); **Phase 0b** graph persistence port + loader port
  (002, 003 §0b deliverables); **Phase 0a** schemas (the loader validates/maps typed `data`).
- **Decision due this phase**: **Graph DB ADR** — D-P1.2 commits to in-memory + Neo4j adapters; the
  *production* graph DB choice still resolves via ADR (deferred, end of Phase 0 per CLAUDE.md) but
  Neo4j is the Phase 1 integration target.
- **Unblocks**: Feature 04 (queries the populated graph), Feature 05 (Domain Map view), Feature 07
  (proves a second loader needs no change here).

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **D-P1.2 — in-memory + Neo4j adapters** | Loader writes through the port; **both** adapters delivered and run the same contract tests. No graph-DB API leaks above the port. |
| **D-P1.3 — language split** | Loader is **TypeScript**; consumes JSONL produced by the Python pipeline purely via files. |
| **D-P1.4 — flesh out, don't build** | Definition only. |
| **OCP target — second loader** | The `LoaderPort` + orchestrator must let Feature 07's vector stub register **without modifying** this loader or the orchestrator. |

## 5. User stories

- *As a platform developer, I want JSONL turned into graph nodes/edges through an abstract port, so
  that the graph DB choice stays swappable.*
- *As an operator, I want loads to be idempotent and replayable, so that re-running after a failure
  never duplicates data.*
- *As a developer, I want an in-memory adapter, so that the whole slice is testable with no external
  service.*
- *As an SRE, I want one bad entry not to abort a load, so that a 99%-valid run still populates the graph.*

## 6. Acceptance criteria (Given/When/Then)

1. **Round-trip** — *Given* an extractions + relationships JSONL pair, *when* the loader runs against
   the in-memory adapter, *then* the graph contains exactly the expected nodes and edges (the
   `JSONL→graph round-trip produces expected state` test from plan 1.3).
2. **Entity-first ordering** — *Given* a relationship referencing two entities, *when* loaded, *then*
   both endpoint nodes exist before the edge is created; a relationship with a missing endpoint is
   reported as a (non-retriable) error, not a crash.
3. **Idempotency** — *Given* a completed run, *when* the same JSONL+runId is loaded again, *then*
   `skipped == totalEntries`, `loaded == 0`, and the graph is unchanged.
4. **Streaming** — *Given* a large JSONL, *when* loaded, *then* consumption is via `AsyncIterable` and
   peak memory does not scale with file size (no full-file buffering).
5. **Partial failure** — *Given* one schema-invalid entry among 100, *when* loaded, *then* 99 load,
   the failure is in `errors[]` with correct `retriable`, and `LoadResult` totals reconcile.
6. **Rollback** — *Given* a loaded run, *when* `rollbackRun(runId)` is called, *then* all nodes/edges
   from that run are removed and the event log records the reversal.
7. **Adapter parity** — *Given* the graph port contract test suite, *when* run against **both**
   in-memory and Neo4j adapters, *then* both pass identically (D-P1.2 / OCP boundary).
8. **Event log** — *Given* a load, *when* nodes/edges are written, *then* a mutation event is emitted
   per change (consumed later by Query cache + Quality re-scoring).

## 7. Interface contracts

Reuse spec 003 verbatim: `LoaderPort`, `LoadResult`, `LoadError`, `LoaderOrchestrator`,
`OrchestratorResult`, `RunStatus`. Write through spec 002's graph persistence port (node/edge upsert,
event log). The loader declares:

```typescript
const graphLoader: LoaderPort = {
  name: "graph-loader",
  targetStore: "graph",                 // backed by in-memory OR neo4j adapter (D-P1.2)
  requiredFields: ["type", "data"],     // beyond fixed core
  // initialize / healthCheck / load / loadSingle / hasProcessed / rollbackRun
};
```

`orderedProcessing: true` (entities before relationships).

## 8. TDD test plan (write these first)

- **Contract — `loader-port.contract.test.ts`**: the suite every loader must pass (load/loadSingle,
  idempotency via `hasProcessed`, `rollbackRun`, well-formed `LoadResult`). Feature 07 reuses it.
- **Contract — `graph-port.contract.test.ts`**: run against **both** adapters (in-memory + Neo4j) —
  node/edge upsert, traversal primitives, event-log emission. Asserts D-P1.2 parity.
- **Unit — `jsonl-reader.test.ts`**: streaming line parse; malformed-line handling; ordering guarantee.
- **Unit — `entity-mapping.test.ts`** / **`relationship-mapping.test.ts`**: `JsonlEntry.data` → node
  props; relationship entry → typed edge; missing-endpoint error path.
- **Unit — `idempotency.test.ts`**: processed-set semantics across re-runs.
- **Integration — `graph-loader.int.test.ts`**: JSONL fixtures → in-memory graph round-trip; plus a
  Neo4j-backed variant (testcontainer/ephemeral) producing identical state.

## 9. Task breakdown

1. [ ] Define/confirm `LoaderPort`, `LoadResult`, `LoadError`, orchestrator types (spec 003).
2. [ ] Write loader-port + graph-port contract suites (failing).
3. [ ] Implement streaming `jsonl-reader` (AsyncIterable) + tests.
4. [ ] Implement in-memory graph adapter (behind 0b port) + event log + tests.
5. [ ] Implement Neo4j graph adapter (behind same port) + integration test harness.
6. [ ] Implement `graph-loader`: entity→node, relationship→edge mapping, entity-first ordering.
7. [ ] Implement idempotency (`hasProcessed`) + `rollbackRun`.
8. [ ] Implement skip-and-continue error handling + `LoadResult` reporting.
9. [ ] Implement minimal `LoaderOrchestrator` (single-loader run over a run's file pair).
10. [ ] End-to-end: Feature 02 JSONL → populated graph integration test.

## 10. OCP extension points

- **Open**: new loaders (vector, PostgreSQL) via `LoaderPort` + `orchestrator.registerLoader()`; new
  graph adapters behind the 0b port (this feature adds in-memory + Neo4j; more can follow); new
  inventory types map through the generic entity mapper (data-driven, no loader edit).
- **Closed**: `LoaderPort` signature, the JSONL fixed-core contract, the graph port. Feature 07 must
  require **zero edits** to this loader or the orchestrator.

## 11. Open questions / risks

- **Production graph DB choice** stays an ADR (deferred); Neo4j is only the Phase 1 integration target,
  not a hard commitment above the port — keep the port clean to honour that.
- Spec Open Q1 (compression) / Q2 (schema version in filename) — loader should tolerate gzip and a
  versioned filename; confirm convention with Feature 02.
- Spec Open Q3 (cross-run dedup ownership) — **deferred to Phase 5**; Phase 1 loader does not dedup
  across runs (idempotency is within-run by `id`+`runId`).
- DLQ is stubbed (log only) in Phase 1; confirm that is acceptable for the pilot.
