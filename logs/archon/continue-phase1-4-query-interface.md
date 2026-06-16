Resume the Phase 1 Feature 04 — Query Interface build in this worktree. The previous run hit the
Claude session limit DURING the implement step, AFTER scaffolding but BEFORE writing the
implementation. Do NOT re-scaffold and do NOT change the intent of the already-written tests.

Already present in modules/query-interface (keep these):
- package.json (@dkm/query, deps @dkm/schema + @dkm/knowledge-graph), tsconfig.json
- src/types.ts (QueryService + QueryContext + QueryMetric + request/result types — spec 006 verbatim)
- src/contract.ts (reusable runQueryServiceContractTests(name, factory); harness = { graph, service,
  metrics })
- test/: query-service.contract.test.ts, pagination.test.ts, query-router.test.ts, traversal.test.ts,
  access-filter.test.ts, query-over-loaded-graph.int.test.ts, helpers.ts

WHAT'S LEFT — implement the QueryService over the GraphPort so ALL the already-written tests pass:
1. Create src/index.ts (plus any small src/ helpers you need, e.g. pagination/router/access-filter/
   metrics) implementing the graph-served subset exactly as the contract suite and tests expect:
   - getEntry(id, ctx) -> { entry } | null  (null, not error, for unknown id)
   - listEntries({type, filters?, sort?, cursor?, limit?}, ctx) -> { items, cursor, hasMore,
     totalCount }: cursor-based pagination over the graph port's findByType; stable across inserts
     (no dup/skip), default limit 25, clamp to max 100, cursor encodes last-seen id + sort key.
   - traverse({startNodeId, direction, edgeTypes?, nodeTypes?, maxDepth, includeEdges}, ctx) ->
     { nodes, edges }: delegate to GraphPort.traverse; enforce a default maxDepth cap; empty subgraph
     (no crash) for an unknown start node; omit edges when includeEdges is false.
   - findPaths({sourceId, targetId, ...}, ctx) -> { found, paths:[{nodeIds, edges}] }: delegate to
     GraphPort.findPath; found=false + [] for unconnected nodes.
   - Query router skeleton: graph branch live; semanticSearch/facetedBrowse/temporal/fullText/hybrid
     and assessImpact/search/getStateAtTime/getDiff return a typed, documented
     "not-available-in-phase-1" result — NEVER throw.
   - No-op pass-through access filter genuinely invoked on the hot path of EVERY query (RBAC seam for
     Phase 3), and metrics emission { queryType, duration, backendsCalled, cacheHit, requestId } on
     every query.
2. Wire the contract suite into test/query-service.contract.test.ts to run against BOTH a QueryService
   over InMemoryGraphAdapter (the always-on CI gate) AND over Neo4jGraphAdapter (only when NEO4J_URI is
   set; describe.skip otherwise so it is never a CI gate) — mirror modules/knowledge-graph/test/
   graph-port.contract.test.ts. The harness must capture emitted metrics into its `metrics` array.
3. Make sure the new module is wired into the workspace (root tsconfig path alias for @dkm/query if the
   previous run didn't finish it) so `pnpm install` then `pnpm run validate` (typecheck + lint + test)
   passes GREEN from the repo ROOT. Fix a test only if it is genuinely wrong; otherwise implement to it.
4. British spelling throughout. Honour the OCP open/closed surfaces (feature doc §10): adding new query
   types/backends later must not change existing routing branches or the QueryService signatures /
   PaginatedResult shape.

THEN, because this is a `continue` (archon-assist) run and the create-PR DAG node will NOT fire, you
must do the release steps yourself: commit the work on branch feat/phase1-4-query-interface, push it,
and OPEN A PR targeting main with `gh pr create`. The PR body should summarise what was implemented,
the `pnpm run validate` results, confirm the in-memory contract suite is the CI gate, and note that
real Neo4j query-parity verification is deferred and should be tracked as a follow-up issue.
