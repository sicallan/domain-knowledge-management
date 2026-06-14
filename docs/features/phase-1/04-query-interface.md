# Feature 04 — Query Interface (entity lookup + relationship traversal)

## 1. Feature

- **Name**: Query Interface — typed API to retrieve inventory items and traverse relationships
- **Plan step**: 1.4 — *Query interface: simple API to retrieve inventory items and traverse relationships*
- **Spec(s) expanded**: [specs/006-query-interface.md](../../../specs/006-query-interface.md)
  (the `QueryService` contract, query routing, cursor pagination). Reads through the graph port from
  [specs/002-graph-persistence-port.md](../../../specs/002-graph-persistence-port.md).

## 2. Summary & scope

Provide the consumer-facing read API over the populated graph. Phase 1 implements the **graph-served
subset** of the `QueryService`: entity lookup, type listing, relationship traversal, and (best-effort)
path finding — enough to feed the Domain Map view (Feature 05) and prove the slice is queryable.
Vector/PostgreSQL-backed query types are defined in the contract but stubbed/deferred.

**In scope**
- `QueryService` with the **graph-only** operations: `getEntry`, `listEntries`, `traverse`,
  `findPaths`.
- Query routing skeleton (spec 006 §Query Routing) — graph branch live; vector/postgres branches
  return a clear "not available in Phase 1" result, not a crash.
- **Cursor-based pagination** with optional total count (spec 006 Decision 3).
- `QueryContext` plumbing (userId/roles/scopes/requestId). RBAC enforcement is a **no-op pass-through
  filter** in Phase 1 (auth lands Phase 3) but the seam exists so it can be pushed down later.
- Query metrics emission (`{queryType, duration, backendsCalled, cacheHit}`).

**Out of scope**
- Semantic/hybrid/full-text/faceted/temporal queries — need vector/PostgreSQL (Phase 3+).
- `assessImpact` — Phase 4 (Impact Assessment Agent).
- Caching layer with event invalidation (spec 006 Decision 2) — **deferred**; Phase 1 queries the
  store directly (cache "off in development" is the spec's own default).
- GraphQL schema (spec 011, Phase 3) and NL translation (spec 015, Phase 4).

## 3. Dependencies

- **Upstream**: Feature 03 (populated graph) + Phase 0b graph port; Phase 0a schemas (typed results).
- **Unblocks**: Feature 05 (View Engine composes these query primitives); later GraphQL layer and
  agents consume the same service.
- **Note**: spec 006 lists Authentication as a dependency — not available until Phase 3, hence the
  pass-through `QueryContext` seam.

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **D-P1.2 — graph adapters** | Queries run through the graph port and must pass against **both** in-memory and Neo4j adapters. |
| **D-P1.3 — language split** | Query Interface is **TypeScript**. |
| **D-P1.4 — flesh out, don't build** | Definition only. |

Spec decisions applied: Decision 1 (dedicated Query Service, not direct storage access), Decision 3
(cursor pagination). Decision 2 (caching) deferred per scope above.

## 5. User stories

- *As a UI/view developer, I want a typed API to fetch an entry and walk its relationships, so that I
  can build views without writing graph queries.*
- *As an agent author, I want the same query primitives the UI uses, so that reasoning code and the UI
  share one access path.*
- *As an operator, I want stable pagination, so that browsing large type listings is consistent under
  concurrent ingestion.*
- *As a security owner, I want a query-context seam from day one, so that RBAC can be pushed down
  without reworking callers when auth arrives.*

## 6. Acceptance criteria (Given/When/Then)

1. **Entity lookup** — *Given* a seeded graph, *when* `getEntry(id)` is called, *then* the typed entry
   is returned; an unknown id returns `null` (not an error).
2. **Type listing + pagination** — *Given* 60 `DomainConcept` nodes and `limit:25`, *when*
   `listEntries` is called twice following the cursor, *then* pages of 25 then 25 then 10 are returned
   with `hasMore` true,true,false and **no duplicates/skips** across pages.
3. **Traversal** — *Given* a node with out-edges of types A and B, *when* `traverse({direction:'out',
   edgeTypes:['A'], maxDepth:2})`, *then* only A-edges are followed to depth 2 and the returned
   subgraph includes edges when `includeEdges:true`.
4. **Path finding** — *Given* two connected nodes, *when* `findPaths` is called, *then* at least one
   correct path is returned; for unconnected nodes an empty path set.
5. **Routing fallback** — *Given* a `semanticSearch` request in Phase 1, *when* called, *then* the
   service returns a structured "backend unavailable" result (documented), not an exception.
6. **Context seam** — *Given* a `QueryContext`, *when* any query runs, *then* the (pass-through) access
   filter is invoked and `requestId` appears in emitted metrics.
7. **Adapter parity** — *Given* the same seeded data, *when* queries run against in-memory and Neo4j
   adapters, *then* results are identical.
8. **Metrics** — *Given* any query, *when* it completes, *then* a metric with `queryType`, `duration`,
   `backendsCalled` is emitted.

## 7. Interface contracts

Reuse spec 006 verbatim: `QueryService`, `QueryContext`, `ListQuery`, `TraversalRequest`,
`SearchRequest`, `ImpactRequest`, `PaginatedResult<T>`, `EntryResult`, `SubgraphResult`, `PathResult`.
Phase 1 implements `getEntry`, `listEntries`, `traverse`, `findPaths`; the remaining methods exist
and return a typed "not-available-in-phase-1" result. Performance budgets (spec 006) are **targets**
to measure, not Phase 1 gates.

## 8. TDD test plan (write these first)

- **Contract — `query-service.contract.test.ts`**: runs against a seeded graph on **both** adapters;
  covers getEntry/listEntries/traverse/findPaths semantics + null/empty edge cases.
- **Unit — `pagination.test.ts`**: cursor encode/decode; stability across an inserted node mid-paging;
  page-size clamp to max 100; optional total count.
- **Unit — `query-router.test.ts`**: each query type maps to the right backend set; Phase-1
  unavailable branches return the documented structured result.
- **Unit — `traversal.test.ts`**: direction in/out/both; edgeType/nodeType filters; depth limiting.
- **Unit — `access-filter.test.ts`**: pass-through filter invoked with context; seam ready for push-down.
- **Integration — `query-over-loaded-graph.int.test.ts`**: load Feature 03 fixtures, run the query
  set, assert expected results (plan 1.4 "query returns expected results for seeded graph").

## 9. Task breakdown

1. [ ] Define/confirm `QueryService` + request/result types (spec 006).
2. [ ] Write query-service contract suite + pagination tests (failing).
3. [ ] Implement `getEntry` + `listEntries` (cursor pagination) over the graph port.
4. [ ] Implement `traverse` (direction/filters/depth) + `findPaths`.
5. [ ] Implement the query router skeleton with documented Phase-1 unavailable branches.
6. [ ] Implement `QueryContext` pass-through access filter + metrics emission.
7. [ ] Run the contract suite against both graph adapters.
8. [ ] Integration test over a loaded graph.

## 10. OCP extension points

- **Open**: new query types added to the router (vector, postgres, hybrid) without changing existing
  branches; the access filter can be replaced with a real RBAC implementation behind the same seam;
  new backends registered without touching graph query code.
- **Closed**: the `QueryService` method signatures and `PaginatedResult` shape; existing routing
  branches. Adding semantic search later must not alter `getEntry`/`traverse`.

## 11. Open questions / risks

- Spec Open Q1 (query complexity limits) — recommend a default `maxDepth` cap on traversal/path to
  prevent full-graph scans even in Phase 1; agree the cap.
- Spec Open Q2 (query logging) — metrics yes; full query logging/privacy deferred.
- Spec Open Q3 (batch queries) — defer to GraphQL batching (Phase 3).
- RBAC is a no-op until Phase 3 — ensure the pass-through seam is genuinely on the hot path so it is
  not retrofitted later.
