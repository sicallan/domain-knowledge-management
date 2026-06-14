# Feature 07 — In-Memory Vector-Store Loader Stub (OCP validation: second loader)

## 1. Feature

- **Name**: In-memory vector-store loader stub — second loader proving the loader OCP boundary
- **Plan step**: 1.x **OCP validation** — *"Add a second loader (e.g., in-memory vector store) — must
  work without modifying extraction or the first loader."*
- **Spec(s) expanded**: [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md)
  (a second `LoaderPort` implementation + the orchestrator running multiple loaders against one JSONL).

## 2. Summary & scope

The loader-side OCP proof. Add a second loader — an **in-memory vector-store stub** — that reads the
**same** intermediate JSONL as the graph loader and populates an in-memory embedding index. The point
is to demonstrate "**extract once, load many**" (spec 003 Core Principle) and that a new loader needs
**zero edits** to extraction (Feature 02) or the graph loader (Feature 03). It is deliberately a
**stub**: it proves the plumbing (registration, orchestration, idempotency, the `requiredFields`
contract), not production vector search.

**In scope**
- `vector-loader` implementing the **unchanged** `LoaderPort` (spec 003).
- In-memory vector index: store `{entryId, embedding, payload}`; embeddings via the **LLM gateway's
  `embed()`** (Feature 02's gateway) **or** a deterministic fake embedder for tests — chosen by config.
- Declares its own `requiredFields` (e.g. text to embed from `data`); **ignores** fields/relationships
  it doesn't need (spec 003: vector loaders typically ignore the relationship file).
- Runs **in parallel** with the graph loader under the `LoaderOrchestrator`, independent failure
  (spec 003 §Loader Orchestration).
- Idempotency (`hasProcessed`) and `rollbackRun` against the in-memory index.

**Out of scope**
- A real vector DB (pgvector/Qdrant/etc.) — that selection is the **Vector DB ADR** (deferred); this
  stub keeps the choice open by proving the port suffices.
- Semantic search query wiring — Feature 04 leaves `semanticSearch` unavailable in Phase 1; this stub
  populates an index but the query path is Phase 3+.
- Embedding-based entity resolution in extraction (deferred in Feature 02).

## 3. Dependencies

- **Upstream**: Feature 03 (the `LoaderPort` + orchestrator + loader contract suite — reused
  unchanged); Feature 02 (the same JSONL output; optionally its gateway `embed()`).
- **Decision context**: informs the **Vector DB ADR** (due Phase 1 per CLAUDE.md/plan) without
  committing to a product — the stub demonstrates requirements behind the port.
- **Unblocks**: the Phase 1 **OCP validation gate** for loaders.

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **OCP validation targets — second loader: in-memory vector-store stub** | This *is* that target. Added without modifying extraction or the graph loader. |
| **D-P1.1 — LLM gateway** | If real embeddings are used, they come via the gateway's `embed()`, not a vendor SDK. A fake embedder is used for deterministic tests. |
| **D-P1.3 — language split** | TypeScript (loader), consuming the Python pipeline's JSONL via files. |
| **D-P1.4 — flesh out, don't build** | Definition only. |

## 5. User stories

- *As a platform developer, I want a second loader to consume the same JSONL with no change to
  extraction or the graph loader, so that "extract once, load many" is demonstrably true.*
- *As an architect, I want to defer the vector DB choice while proving the loader port supports a
  vector target, so that the decision is made at the last responsible moment.*
- *As an SRE, I want loaders to fail independently, so that a vector-loader error never blocks the
  graph load.*

## 6. Acceptance criteria (Given/When/Then)

1. **Contract reuse** — *Given* the **unmodified** `loader-port.contract.test.ts` from Feature 03,
   *when* run against the vector loader, *then* it passes.
2. **Zero core edits (the OCP gate)** — *Given* the diff adding this feature, *when* reviewed, *then*
   it touches only the new vector-loader file(s), its tests, and the orchestrator **registration**
   call — **not** extraction, the graph loader, or the `LoaderPort`/orchestrator internals.
3. **Existing tests green** — *Given* the prior suite, *when* this feature is added, *then* all earlier
   tests still pass unchanged.
4. **Same JSONL** — *Given* the exact `{runId}-extractions.jsonl` the graph loader consumed, *when* the
   vector loader runs, *then* it indexes the entities with no re-extraction and no separate file format.
5. **Ignores relationships** — *Given* the `{runId}-relationships.jsonl`, *when* the vector loader runs,
   *then* it ignores it (declares it does not require it) without error.
6. **Parallel + independent failure** — *Given* both loaders registered, *when* `executeRun` runs them,
   *then* they run concurrently and a forced vector-loader error does not block the graph loader's
   success (orchestrator reports per-loader status).
7. **Idempotency** — *Given* a completed vector load, *when* re-run with the same runId, *then* entries
   are skipped, not re-indexed.
8. **requiredFields validation** — *Given* the loader declares `requiredFields`, *when* a run lacks
   them, *then* the orchestrator surfaces a clear validation error (spec 003: "loaders declare required fields").

## 7. Interface contracts

No new interfaces. Implements spec 003 `LoaderPort` exactly:

```typescript
const vectorLoader: LoaderPort = {
  name: "vector-loader",
  targetStore: "in-memory-vector",      // ADR-deferred real store slots in behind this later
  requiredFields: ["data"],             // text to embed; ignores relationship entries
  orderedProcessing: false,             // order-independent (spec 003 §Ordering)
  // initialize / healthCheck / load / loadSingle / hasProcessed / rollbackRun
};
```

Registered via `orchestrator.registerLoader(vectorLoader)`. Embeddings via `LLMGateway.embed()` or a
fake embedder (config-selected).

## 8. TDD test plan (write these first)

- **Contract — reuse `loader-port.contract.test.ts` unchanged** against the vector loader (primary OCP
  evidence).
- **Unit — `vector-loader.test.ts`**: entity → index entry; relationship file ignored; idempotency;
  `rollbackRun`; deterministic fake embedder produces stable vectors.
- **Unit — `loader-orchestrator-multi.test.ts`**: graph + vector loaders run in parallel against one
  JSONL; independent failure; per-loader status; all-complete archival gate (spec 003 §Orchestration).
- **OCP guard — `loader-ocp.test.ts`** (or CI diff check): asserts extraction, the graph loader, and
  the `LoaderPort`/orchestrator files are unchanged from their prior state.
- **Integration — `extract-once-load-many.int.test.ts`**: one extraction run → both loaders → assert
  the graph is populated **and** the vector index contains the same entities (the "load many" demo).

## 9. Task breakdown

1. [ ] Confirm `LoaderPort` + orchestrator + contract suite from Feature 03 are stable (no edits).
2. [ ] Write vector-loader unit tests, multi-loader orchestration tests, OCP guard (failing).
3. [ ] Implement the in-memory vector index + deterministic fake embedder.
4. [ ] Implement `vector-loader` (LoaderPort): embed `data`, index, idempotency, rollback, ignore rels.
5. [ ] Wire optional real embeddings via `LLMGateway.embed()` behind config.
6. [ ] Register the loader with the orchestrator (registration call only).
7. [ ] Run the **unmodified** loader contract suite + full prior suite (all green).
8. [ ] Integration test: extract-once → load-many across both loaders.

## 10. OCP extension points

- **Open**: this feature *is* the open extension — a second loader with no core change. Behind
  `targetStore`, a real vector DB adapter can replace the in-memory index later without touching the
  loader's callers.
- **Closed**: the `LoaderPort` signature, the orchestrator internals, the extraction pipeline, and the
  graph loader. Any forced change is a spec deviation to record and a signal the port needs hardening.

## 11. Open questions / risks

- **Vector DB ADR** is due this phase — this stub should capture the *requirements* it places on the
  port (embedding dimensions, upsert, idempotency, payload filtering) to inform that ADR; the product
  choice stays deferred.
- **Risk**: the embedding source — using the real gateway `embed()` introduces a Claude dependency and
  cost into a "stub"; default tests to the **fake embedder**, gate real embeddings behind config.
- Without a Phase 1 semantic-search query path (Feature 04), the index is write-only this phase —
  confirm that is acceptable as an OCP proof rather than a usable search feature.
