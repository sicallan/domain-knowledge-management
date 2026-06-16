# @dkm/query — Query Interface (spec 006)

The consumer-facing **read** API over the populated knowledge graph. It does not
implement storage; it orchestrates queries through the [`GraphPort`](../knowledge-graph)
(spec 002). Phase 1 (feature
[04](../../docs/features/phase-1/04-query-interface.md)) ships the **graph-served
subset**; vector/PostgreSQL-backed query types are defined but deferred.

## What it does (Phase 1)

- `getEntry` — single entry by id (`null`, not an error, for an unknown id).
- `listEntries` — type listing with **cursor (keyset) pagination** (spec 006
  Decision 3): stable across concurrent inserts, default page 25, clamped to 100,
  optional `totalCount`, optional property sort.
- `traverse` — relationship walk (direction / edge-type / node-type filters, depth
  limiting) with a default `maxDepth` cap (spec 006 Open Q1) to prevent full-graph
  scans; `truncated` flags when the cap clamps the request.
- `findPaths` — path finding between two nodes.
- A **query router** (`routeQuery`) mapping each query type to its backend plan;
  the graph branch is live, the rest return a typed *"not available in Phase 1"*
  result instead of throwing.
- A **pass-through `AccessFilter`** invoked on the hot path of every query (RBAC
  seam for Phase 3) and **metrics** emission per query.

## Deferred (return a typed `BackendUnavailableResult`, never throw)

Semantic / hybrid / full-text / faceted / temporal search (`search`, `getDiff`,
`getStateAtTime`) and impact assessment (`assessImpact`) — they need the vector /
PostgreSQL backends (Phase 3+) or the Impact Assessment Agent (Phase 4). Caching
(spec 006 Decision 2) is deferred; Phase 1 queries the store directly.

## Extension points (OCP)

- **Open**: register new query types/backends in the router, and replace the access
  filter with a real RBAC implementation, behind the same seams — without touching
  the graph query code or existing routing branches.
- **Closed**: the `QueryService` method signatures and `PaginatedResult` shape.

## Tests

`pnpm exec vitest run modules/query-interface`. The adapter-agnostic contract
suite (`src/contract.ts`, `runQueryServiceContractTests`) runs against the
in-memory adapter (the CI gate) and — when `NEO4J_URI` is set — the Neo4j adapter,
proving identical results across both (D-P1.2). Without `NEO4J_URI` the Neo4j
variants skip, so CI needs no external service.
