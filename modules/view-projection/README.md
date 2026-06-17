# @dkm/view-projection — View Projection Engine (spec 007)

Materialises **UI-ready views** from the populated knowledge graph. It does not query
the graph directly — it composes the [`@dkm/query`](../query-interface) primitives
(`listEntries`, `traverse`), which are the only way a projector touches the graph.
Phase 1 (feature [05](../../docs/features/phase-1/05-domain-map-view.md)) ships the
**View Engine** (registry + projector port) with the **Domain Map** as its first
registered projector, proving the OCP extension pattern for views.

## What it does (Phase 1)

- `ViewEngine` (`DefaultViewEngine`) — `getView` / `refreshView` / `listViews` /
  `registerProjector`. `getView` dispatches to the registered projector and wraps the
  result in a `ViewResult` with freshness metadata (`computedAt`, `entriesIncluded`,
  `stale`, `cacheHit`).
- `ViewProjector<TParams, TResult>` — the projector port (spec 007 §View Projection
  Pattern): `viewType`, `project`, `invalidatedBy`, plus the additive optional
  `describe`/`entriesIncluded` self-description hooks.
- **Domain Map projector** (`viewType: "domain-map"`, refresh policy `on-demand`) —
  produces a `DomainMapView`: subdomains → bounded contexts (with concept/service
  counts and per-context relationships) plus aggregated `crossContextRelationships`
  (edges between concepts in different contexts; `strength` = edge count). It reads
  the real `Subdomain` / `BoundedContext` nodes, nests members via `belongsTo` edges,
  and scopes to a single subdomain via `{ subdomain }`.

## Deferred (defined but unused in Phase 1)

`invalidatedBy` is defined on the port but unused: the Domain Map is **on-demand**, so
there is no cache to invalidate (`cacheHit` is always `false`, `stale` always `false`).
View caching with event invalidation, and all other views (Compliance Matrix, Vendor
Coverage, …), land in later phases.

## Extension points (OCP)

- **Open**: add a new view by `implements ViewProjector` + `registerProjector()` — no
  engine change. Add a new inventory type (e.g. `Subdomain`, `BoundedContext`) by
  adding a schema file — the registry auto-discovers it.
- **Closed**: the `ViewEngine`/`ViewProjector` signatures, the `ViewResult` shape, and
  the `DomainMapView` output schema. Extend these additively only.

## Tests

`pnpm exec vitest run modules/view-projection`. The reusable port contract suite
(`src/contract.ts`, `runViewProjectorContractTests`) is satisfied by any projector and
reused by future views. The integration test (`domain-map.int.test.ts`) loads the demo
JSONL fixtures through the `GraphLoader` and asserts the projected `DomainMapView` over
the in-memory adapter (the CI gate) and — when `NEO4J_URI` is set — the Neo4j adapter,
proving adapter parity (D-P1.2). Without `NEO4J_URI` the Neo4j variant skips, so CI
needs no external service.
