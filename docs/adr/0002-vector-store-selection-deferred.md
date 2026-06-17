# ADR-0002 — Vector store selection (deferred behind the loader port)

- **Status**: Proposed (deferred — Last Responsible Moment)
- **Date**: 2026-06-17
- **Deciders**: Platform architecture
- **Related**: [specs/003 — Intermediate JSONL & Loaders](../../specs/003-intermediate-jsonl-and-loaders.md), [Feature 07 — In-Memory Vector-Store Loader Stub](../features/phase-1/07-vector-loader-stub-ocp.md), [ADR-0001 — Intermediate JSONL vs OKF](./0001-intermediate-jsonl-vs-okf-interchange.md), CLAUDE.md *Deferred decisions* (Vector DB — Phase 1)

## Context

CLAUDE.md lists the **Vector DB** as a Phase 1 deferred decision, to be captured as an ADR
without committing to a product before the Last Responsible Moment. Feature 07 ships the
**second loader** — an in-memory vector-store stub (`@dkm/loaders` → `VectorLoader`) — whose
sole purpose is to prove the loader **OCP boundary** ("extract once, load many"): a new loader
consumes the same intermediate JSONL as the graph loader with zero edits to extraction, the
graph loader, the `LoaderPort`, or the orchestrator.

Building the stub forces us to make concrete the requirements a real vector store must satisfy
*behind the port*, which is exactly what should inform the eventual product choice.

## Decision

**Do not pick a vector database yet.** Keep the choice deferred behind the loader's
`targetStore: "in-memory-vector"` and the `InMemoryVectorIndex` shape. A real adapter
(pgvector / Qdrant / Weaviate / Milvus / …) slots in behind that shape later **without changing
the loader's callers**, the orchestrator, or extraction.

This ADR records the requirements; the product selection supersedes it in a later ADR when a
semantic-search query path (Feature 04, Phase 3+) makes the trade-offs real.

## Requirements the stub places on any vector store (what to evaluate later)

| Requirement | How the stub models it | Why it matters for product selection |
|---|---|---|
| **Embedding dimension** | Fixed `EMBEDDING_DIMENSION` (16) from the `Embedder` seam | Real stores fix dimension per collection/index; must match the chosen embedding model. |
| **Upsert by id** | `InMemoryVectorIndex.upsert({ entryId, … })` keyed by `entryId` | Re-extraction must replace, not duplicate; the store needs id-keyed upsert. |
| **Idempotency key `(entryId, runId)`** | Loader tracks processed `(entryId, runId)`; re-runs skip | Safe replay/retry without re-embedding; store must allow per-run provenance. |
| **Run-scoped delete (rollback)** | `removeRun(runId)` deletes that run's vectors | Operational rollback needs metadata-filtered delete by `runId`. |
| **Payload filtering** | `payload` carries `{ type, name, text, source }` — never the raw embedding | Stores must hold filterable metadata alongside vectors for typed/provenance filtering. |
| **Embedder seam (no vendor SDK in-process)** | `Embedder` interface; deterministic `FakeEmbedder` default | The embedder is **deferred** too — this repo has no in-process TS LLM gateway (Feature 02's gateway is Python, cross-process). No API key / network in CI. |

## Consequences

- **Now**: CI is green with no secrets or services — a deterministic fake embedder and an
  in-memory index. The index is **write-only** this phase; the query/search path is Phase 3+
  (Feature 04 leaves `semanticSearch` unavailable in Phase 1). That is acceptable as an OCP
  proof, not a usable search feature.
- **Later**: when semantic search lands, evaluate products against the table above and replace
  `InMemoryVectorIndex` behind `targetStore`. The real embedder arrives via the cross-process
  Python gateway, still behind the `Embedder` seam — no change to the loader's port surface.
- **Not decided here**: the product, the embedding model/dimension, and the hosting model.
