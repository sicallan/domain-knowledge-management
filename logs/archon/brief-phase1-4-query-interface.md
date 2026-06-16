Implement ONLY Phase 1 Feature 04 — Query Interface (entity lookup + relationship traversal),
per docs/features/phase-1/04-query-interface.md and specs/006-query-interface.md. Phase 1, Layer:
query (reads through the graph port). This is the graph-served subset only.

BUILD ON existing modules — do NOT re-scaffold. Reuse:
- @dkm/knowledge-graph: the GraphPort interface and its InMemoryGraphAdapter + Neo4jGraphAdapter.
  The port already exposes getNode, getEdges, traverse(TraversalQuery), findByType(type, filters),
  findPath(PathQuery), getEvents. Your QueryService orchestrates THESE — it must not implement graph
  storage logic or talk to a DB driver directly.
- @dkm/schema: InventoryEntry, RelationshipEntry, InventoryType and shared types for typed results.
- Mirror the proven contract-suite pattern in modules/knowledge-graph (src/contract.ts +
  test/graph-port.contract.test.ts): expose ONE reusable runQueryServiceContractTests(label, factory)
  that runs the identical suite against BOTH a graph-backed QueryService over InMemoryGraphAdapter
  (the CI gate, always runs) and over Neo4jGraphAdapter (opt-in: only when NEO4J_URI is set;
  describe.skip otherwise so it is NEVER a CI gate and needs no external service).

Create a new module modules/query-interface, package name @dkm/query (match the existing
loaders/knowledge-graph workspace layout, package.json + tsconfig.json + README.md). Do NOT use
modules/indexing-retrieval — that planned module is for vector/lexical retrieval, not this graph-only
query orchestrator.

SCOPE (in) — implement exactly these QueryService operations over the graph port, with spec 006 /
feature-doc-§7 signatures verbatim (QueryService, QueryContext, ListQuery, TraversalRequest,
PathRequest, SearchRequest, ImpactRequest, PaginatedResult<T>, EntryResult, SubgraphResult,
PathResult):
- getEntry(id, context): typed entry, or null for unknown id (not an error).
- listEntries(query, context): cursor-based pagination (spec Decision 3) — stable across concurrent
  inserts (no dup/skip), page-size default 25, clamp to max 100, optional totalCount; cursor encodes
  last-seen id + sort key.
- traverse(query, context): direction in/out/both, edgeTypes/nodeTypes filters, depth limiting,
  includeEdges; enforce a default maxDepth cap (resolve spec Open Q1) to prevent full-graph scans.
- findPaths(query, context): >=1 correct path between connected nodes; empty path set for unconnected.
- Query router skeleton (spec §Query Routing): the graph branch is live; semanticSearch / facetedBrowse
  / temporal / fullText / hybrid branches return a typed, documented "backend unavailable in Phase 1"
  result — NEVER throw/crash.
- QueryContext plumbing (userId/roles/scopes/requestId) with a NO-OP pass-through access filter that
  is genuinely invoked on the hot path of every query (so real RBAC can be pushed down later behind
  the same seam without reworking callers).
- Query metrics emission: { queryType, duration, backendsCalled, cacheHit } including requestId.

OUT OF SCOPE (do not build): semantic / hybrid / full-text / faceted / temporal queries;
assessImpact (Phase 4); caching layer + event invalidation (spec Decision 2 — deferred, query the
store directly); GraphQL schema; NL translation. assessImpact / search / getStateAtTime / getDiff
exist on the interface but return the typed "not-available-in-phase-1" result.

TDD FIRST — write these failing tests before implementation (feature doc §8), then implement the
minimum to pass:
- query-service.contract.test.ts (reusable suite, runs on BOTH adapters): getEntry/listEntries/
  traverse/findPaths semantics + null/empty edge cases.
- pagination.test.ts: cursor encode/decode; stability across an inserted node mid-paging; page-size
  clamp to 100; optional total count.
- query-router.test.ts: each query type maps to the right backend set; Phase-1 unavailable branches
  return the documented structured result.
- traversal.test.ts: direction in/out/both; edgeType/nodeType filters; depth limiting + cap.
- access-filter.test.ts: pass-through filter invoked with context; seam ready for push-down.
- query-over-loaded-graph.int.test.ts: load the Feature 03 loader fixtures into a graph, run the
  query set, assert expected results.

ACCEPTANCE (feature doc §6): all 8 criteria, incl. adapter parity (identical results in-memory vs
Neo4j) and metrics emission. Performance budgets are targets to measure, not Phase 1 gates.

OCP (feature doc §10):
- Open: new query types added to the router (vector/postgres/hybrid) without changing existing
  branches; the access filter replaceable by a real RBAC impl behind the same seam; new backends
  registered without touching graph query code.
- Closed: QueryService method signatures and PaginatedResult shape; existing routing branches.
  Adding semantic search later must not alter getEntry/traverse.

CONSTRAINTS:
- CI must stay green WITHOUT secrets or external services: the in-memory-backed suite is the gate;
  the Neo4j parity run auto-skips unless NEO4J_URI is set. Note in the PR body that real Neo4j query
  parity verification should be tracked as a follow-up issue.
- British spelling throughout (Authorisation, Realisation, Behaviour, prioritise, etc.).
- Wire the new module into the workspace so `pnpm run validate` (typecheck + lint + test) passes from
  the repo root.

When done, open a PR targeting main with a summary of what was implemented, the test plan results,
and the deferred-Neo4j-verification note.
