# Feature 02 — GraphQL API Gateway

## 1. Feature

- **Name**: `apps/api-gateway` — a **GraphQL Yoga + Pothos** server that wraps the existing **Query
  Interface port** (`@dkm/query-interface`) and the **View Projection engine** (`@dkm/view-projection`),
  exposing inventory entries, relationships, traversals, listings, and the coverage/gap views to the
  UI. SDL-as-contract (snapshot-tested); resolvers tested over the **in-memory graph adapter**, seeded
  from `demo/*.jsonl`. The "mock backend" that is actually the *real* read path on an ephemeral store.
- **Plan step**: UI-3.2 — *GraphQL API schema: types for inventory entries, relationships, views*
  ([ui-backend-plan.md §Backend API Architecture](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ADR-0006](../../adr/0006-graphql-server-framework.md) (Yoga+Pothos);
  [spec 006/008 Query Interface](../../../specs/README.md) (the wrapped port);
  [spec 007 View Projection](../../../specs/007-view-projection-engine.md) (the view shapes);
  [ui-backend-plan.md §API Domains](../../../ui-backend-plan.md) (Graph Query, View Projection). Realises
  UI-D2 (the three-tier seam) and UI-D3 (adapter-over-port).

## 2. Summary & scope

The backend half of the first slice, and the keystone of the whole track's mock strategy. It is a
**thin, stateless adapter**: every resolver delegates to an injected `QueryService` (Graph Query
domain) or `ViewEngine`/projector (View Projection domain), transforms the typed result into the
GraphQL shape, and returns it. It implements **no storage logic** and holds **no second data model**.

> **Wrap the shipped port, do NOT re-implement it.** The `QueryService`
> ([modules/query-interface](../../../modules/query-interface/src/index.ts)) already implements entity
> lookup, type listing (cursor pagination), traversal, and path finding over a `GraphPort`, and already
> returns a typed **`BackendUnavailableResult`** for the not-yet-wired query types (semantic/full-text/
> faceted/temporal search, impact). The `ViewEngine`/projectors already produce the Domain Map,
> Behaviour Flow, Vendor Coverage, and Gap views. This feature **exposes** them over GraphQL — it adds
> resolvers + SDL, nothing in the data path. Adapter parity (in-memory ↔ Neo4j, D-P1.2) is inherited.

**In scope**
- `apps/api-gateway`: Yoga HTTP server + Pothos schema builder; added to the workspace (UI-D6).
- **GraphQL types** projecting the port's result types: `InventoryEntry` (with the base-entry fields —
  `id`, `type`, `version`, `lifecycleStatus`, `validFrom`/`validTo`, `confidence`, `evidencedBy`),
  `Relationship`, `Subgraph`, `PageInfo`/connection for listings, the **view** types
  (`VendorCoverageView`, `GapAnalysisView`, `DomainMapView`, …), and the **`BackendUnavailable`** union
  member for deferred queries.
- **Resolvers** (Graph Query): `entry(id)`, `entries(type, filter, sort, page)`, `traverse(...)`,
  `paths(...)`; (View Projection): `coverageMap(params)`, `gapAnalysis(params)`, `domainMap(params)`,
  `behaviourFlow(params)` — each delegating to the injected service/engine.
- **`search`/`assessImpact`** resolvers that return the typed **unavailable** result (Tier 2) rather
  than throwing — surfaced as a GraphQL union the UI renders as "coming soon".
- **SDL emission + snapshot test** (the contract gate) and a **`seedInMemoryGraph()`** util loading
  `demo/*.jsonl` via `GraphLoader` into an `InMemoryGraphAdapter` — the single canonical seed shared by
  the dev server, resolver tests, and the studio's MSW handlers (UI-D2).
- A **dev server entry** (`pnpm --filter @dkm/api-gateway dev`) booting over the seeded in-memory graph.
- `QueryContext` plumbing: every resolver passes a `QueryContext` (from auth, Feature 03; dev-fake in
  the meantime — UI-D8) so the `AccessFilter` seam is on the hot path from day one.

**Out of scope**
- Auth/OIDC itself (Feature 03 — this exposes the `context` seam it fills).
- The Neo4j wiring for production (D-P1.2 adapter exists; swapping it in is a deployment concern, not
  this feature — the resolver tests already prove parity-readiness via the port).
- Subscriptions / real-time (Phase 5); mutations beyond what reads need (the data is loader-populated).
- Any UI (Features 01, 04–06 consume this).

## 3. Dependencies

- **Upstream**: `@dkm/query-interface` (`GraphQueryService`, `QueryService`), `@dkm/knowledge-graph`
  (`InMemoryGraphAdapter`, `Neo4jGraphAdapter`), `@dkm/view-projection` (`ViewEngine` + projectors),
  `@dkm/loaders` (`GraphLoader`, `JsonlReader`), `@dkm/schema` (types); `demo/*.jsonl` (seed). UI-D6
  workspace wiring.
- **Unblocks**: every data-bearing UI feature (UI-3.4 canvas via `traverse`, UI-3.5 list via `entries`,
  UI-3.6 context panel via `entry`/`traverse`); the studio's MSW handlers (shared SDL + seed).
- **Cross-feature**: owns the **SDL contract** and the **`seedInMemoryGraph()`** util the studio's MSW
  imports; consumes the `QueryContext` Feature 03 produces.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D2** ⭐ | Resolvers go through `QueryService`/`ViewEngine` only; fakeness lives in the in-memory adapter + seed, never in resolvers. SDL is the contract; one shared `seedInMemoryGraph()`. |
| **UI-D3** | The gateway is an *adapter over the port* — no graph driver, no `demo/*.jsonl` read in resolvers, no second data model. |
| **UI-D4** | Stateless; no PostgreSQL. RBAC enforcement deferred — the `AccessFilter` seam stays pass-through (Phase 5). |
| **UI-D5** | Resolver tests over the in-memory adapter + SDL snapshot are the CI gate; a Neo4j parity e2e auto-skips unless `NEO4J_URI` set. |
| **D-P1.2** | Adapter parity inherited via the port — swapping in-memory ↔ Neo4j needs no schema/resolver change. |
| **spec 006 — deferred queries return a marker, not a throw** | `search`/`assessImpact` expose the typed `BackendUnavailable` union (Tier 2), never error. |

## 5. User stories

- *As the Knowledge Studio, I want one typed GraphQL endpoint for entries, relationships, traversals,
  and views, so that every screen reads from one contract.*
- *As a frontend developer, I want a dev server over seeded payments data, so that I can build and click
  through screens before any production store exists.*
- *As a maintainer, I want the schema snapshot-tested and resolvers tested over the in-memory adapter,
  so that the contract is guarded and CI is green with no live service.*
- *As a platform engineer, I want to swap the in-memory adapter for Neo4j without touching the schema or
  the UI, so that going to production is a wiring change, not a rewrite.*

## 6. Acceptance criteria (Given/When/Then)

1. **SDL contract** — *Given* the Pothos schema, *when* SDL is emitted, *then* it matches the committed
   snapshot (changes are deliberate + reviewed). The schema validates and includes the inventory,
   relationship, listing-connection, view, and `BackendUnavailable` types.
2. **Entry resolver** — *Given* a seeded graph, *when* `entry(id)` is queried for a known id, *then* the
   typed entry (base-entry fields) is returned; for an unknown id, `null` (not an error).
3. **Entries listing + pagination** — *Given* seeded entries of a type, *when* `entries(type, page)` is
   queried, *then* the connection paginates with stable cursors, `hasMore`, and `totalCount` matching
   the seed (delegated to `listEntries`).
4. **Traverse resolver** — *Given* a seeded subgraph, *when* `traverse(start, depth, edgeTypes)` is
   queried, *then* the returned nodes/edges match the expected subgraph (delegated to `traverse`,
   `includeEdges` honoured).
5. **View resolvers** — *Given* the seeded graph, *when* `coverageMap`/`gapAnalysis`/`domainMap` are
   queried, *then* each returns the projector's `ViewResult` shape for the seed (delegated to the
   `ViewEngine`; matches the data-track projector output).
6. **Deferred queries are honest** — *Given* `search` or `assessImpact`, *when* queried in Phase 3,
   *then* the response is the typed **`BackendUnavailable`** union member (reason + required backends),
   **not** an error and **not** a fake success.
7. **Adapter-over-port (no reach-through)** — *Given* the resolver modules, *then* a lint/test guard
   confirms no resolver imports a graph adapter, a Neo4j driver, or reads `demo/*.jsonl` directly — only
   `QueryService`/`ViewEngine` are used.
8. **Context seam on the hot path** — *Given* any resolver, *then* a `QueryContext` is threaded to the
   service call (dev-fake identity until Feature 03), so the `AccessFilter` is always invoked.
9. **Shared seed** — *Given* `seedInMemoryGraph()`, *then* the dev server, the resolver tests, and the
   studio's MSW handlers all import the same util over `demo/*.jsonl` (no divergent fixtures).
10. **Neo4j parity (opt-in)** — *Given* `NEO4J_URI` set, *when* the parity e2e runs the same queries
    over the Neo4j adapter, *then* results equal the in-memory results; the test **auto-skips** when the
    env is unset (UI-D5), with real-world verification tracked as a follow-up issue.
11. **CI green, no service** — *Given* CI, *then* `pnpm --filter @dkm/api-gateway test` (SDL snapshot +
    resolver suite over in-memory) passes with no Neo4j/Postgres/secret.

## 7. Interface contracts

The GraphQL types **project** the Query Interface result types (`@dkm/query-interface` `types.ts`) —
they are not a new model. Indicative SDL (emitted by Pothos; the snapshot is the source of truth):

```graphql
type InventoryEntry { id: ID!  type: String!  version: String!  lifecycleStatus: String!
  validFrom: String  validTo: String  confidence: Float  evidencedBy: [Evidence!]!  # + type-specific via JSON/extension
}
type Relationship { id: ID!  relationshipType: String!  sourceId: ID!  targetId: ID! }
type Subgraph { nodes: [InventoryEntry!]!  edges: [Relationship!]!  truncated: Boolean! }
type EntryConnection { items: [InventoryEntry!]!  cursor: String  hasMore: Boolean!  totalCount: Int }
type BackendUnavailable { available: Boolean!  reason: String!  queryType: String!  requiredBackends: [String!]! }
union SearchResult = SearchHits | BackendUnavailable
# view types: VendorCoverageView, GapAnalysisView, DomainMapView, BehaviourFlowView (project spec 007 shapes)

type Query {
  entry(id: ID!): InventoryEntry
  entries(type: String, filter: [PropertyFilterInput!], sort: SortInput, limit: Int, cursor: String): EntryConnection!
  traverse(startNodeId: ID!, direction: Direction!, edgeTypes: [String!], nodeTypes: [String!], maxDepth: Int!, includeEdges: Boolean!): Subgraph!
  paths(sourceId: ID!, targetId: ID!, edgeTypes: [String!], maxDepth: Int, limit: Int): PathResult!
  coverageMap(vendor: String, domain: String): VendorCoverageView!
  gapAnalysis(layer: String, rowKind: String): GapAnalysisView!
  search(query: String!, mode: SearchMode!): SearchResult!          # Phase 3: BackendUnavailable
  assessImpact(triggerNodeId: ID!, traversalDepth: Int!): ImpactResult!   # Phase 3: BackendUnavailable
}
```

Resolver context: `{ queryService: QueryService, views: ViewEngine, context: QueryContext }` — injected
at server construction (in-memory + seed for dev/test; Neo4j for prod). New files (indicative):

```
apps/api-gateway/
  package.json  tsconfig.json
  src/server.ts                 # Yoga handler; builds context (injected service + QueryContext)
  src/schema/builder.ts         # Pothos schema; src/schema/{entry,relationship,view,search}.ts resolvers
  src/schema/sdl.ts             # emit SDL (for the snapshot test + studio codegen)
  src/seed.ts                   # seedInMemoryGraph() over demo/*.jsonl (SHARED — UI-D2)
  test/{sdl.snapshot,resolvers,neo4j-parity}.test.ts
```

## 8. TDD test plan (write these first)

- **SDL snapshot — `sdl.snapshot.test.ts`**: emit SDL → match committed snapshot (criterion 1).
- **Resolvers over in-memory — `resolvers.test.ts`**: seed via `seedInMemoryGraph()`, then assert
  `entry`/`entries`/`traverse`/`paths`/views against the seed (criteria 2–5); `search`/`assessImpact`
  return the `BackendUnavailable` union (6); context threaded (8).
- **No-reach-through guard**: a test/lint rule asserting resolvers import only `QueryService`/`ViewEngine`
  (criterion 7).
- **Shared seed**: assert the studio MSW handlers and the resolver tests import the *same* `seed.ts` (9).
- **Neo4j parity (skip-guarded) — `neo4j-parity.test.ts`**: same queries, in-memory vs Neo4j; auto-skip
  unless `NEO4J_URI` (criterion 10); follow-up issue for the live run.

## 9. Task breakdown

1. [ ] Scaffold `apps/api-gateway` (Yoga + Pothos) as a workspace package (UI-D6).
2. [ ] Implement `seedInMemoryGraph()` over `demo/*.jsonl` via `GraphLoader` (shared util).
3. [ ] Build Pothos types projecting the port result types + the `BackendUnavailable` union.
4. [ ] Implement Graph Query resolvers delegating to `QueryService` (entry/entries/traverse/paths).
5. [ ] Implement View Projection resolvers delegating to `ViewEngine` (coverage/gap/domain/behaviour).
6. [ ] Wire deferred `search`/`assessImpact` to the typed unavailable result (Tier 2).
7. [ ] Emit SDL + commit the snapshot; thread `QueryContext` (dev-fake until Feature 03).
8. [ ] Tests first (SDL snapshot, resolvers over in-memory, no-reach-through guard, Neo4j parity skip).

## 10. OCP extension points

- **Open**: new resolvers/types as new query types or views land (additive to the schema); new view
  projectors exposed without touching existing resolvers; swapping the injected adapter (in-memory ↔
  Neo4j) with no schema change; mutations/subscriptions added later (Phase 5).
- **Closed**: the `QueryService`/`ViewEngine` interfaces (the gateway depends on them, doesn't change
  them); the SDL contract (changes are deliberate, snapshot-guarded); the no-reach-through rule.

## 11. Open questions / risks

- **`InventoryEntry` type-specific fields over GraphQL.** The base entry is fixed but each type carries
  extra fields. *Recommendation:* expose the common base fields as typed GraphQL fields + a `data: JSON`
  (or per-type GraphQL types generated from the JSON Schemas) for the type-specific payload. Phase 3:
  base fields typed + `JSON` escape hatch; per-type GraphQL objects are an additive refinement. Confirm.
- **Connection style.** The plan/port use a simple `{items, cursor, hasMore, totalCount}`. *Recommendation:*
  expose that shape directly (it already matches `PaginatedResult`) rather than forcing Relay
  connections; revisit if a Relay client is adopted.
- **Codegen for the studio.** The studio needs typed operations. *Recommendation:* generate client
  types from the **emitted SDL** in CI (cross-cutting README Q), so client and server can't drift.
  Confirm the tool (graphql-codegen) in this feature since it owns the SDL.
- **View params drift.** View resolvers must pass through the projectors' real params (e.g. coverage
  `rowKind`, gap `layer`). *Mitigation:* type the resolver args from the projector param types in
  `@dkm/view-projection`, not hand-redeclared.
