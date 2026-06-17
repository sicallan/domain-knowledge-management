# Feature 05 — Domain Map View Projection

## 1. Feature

- **Name**: View Projection Engine + Domain Map view (first view)
- **Plan step**: 1.5 — *First view: Domain Map view projection from graph*
- **Spec(s) expanded**: [specs/007-view-projection-engine.md](../../../specs/007-view-projection-engine.md)
  (the `ViewEngine`, `ViewProjector` registration pattern, and the `DomainMapView` output schema).
  Composes query primitives from [specs/006-query-interface.md](../../../specs/006-query-interface.md).

## 2. Summary & scope

The terminal step of the vertical slice: turn the populated graph into a **UI-ready Domain Map** —
subdomains → bounded contexts → contained concepts, plus cross-context relationships. Delivers the
**View Projection Engine** (registry + projector port) with the **Domain Map** as its first registered
projector, proving the OCP extension pattern for views.

**In scope**
- `ViewEngine` (registry + `getView`/`refreshView`/`listViews`/`registerProjector`).
- `ViewProjector<TParams,TResult>` port (spec 007 §View Projection Pattern).
- **Domain Map projector** producing `DomainMapView` (spec 007 §Example View Output Schemas), built by
  composing Feature 04 query primitives (list contexts, traverse contained concepts, count edges).
- Per-view refresh policy field; Domain Map = **on-demand** in Phase 1 (cheap, well-bounded).
- `ViewResult` freshness metadata (`computedAt`, `entriesIncluded`, `stale`, `cacheHit`).

**Out of scope**
- All other views (Compliance Matrix, Vendor Coverage, etc.) — later phases.
- UI rendering / Knowledge Explorer (spec 013/014) — Phase 3.
- View **caching with event invalidation** — deferred (Phase 1 on-demand only); the `invalidatedBy`
  hook is defined on the port but unused by the on-demand Domain Map.
- OKF bundle projection target (spec 007 proposed) — deferred to spec 017.
- GraphQL serving of views (spec 011) — Phase 3.

## 3. Dependencies

- **Upstream**: Feature 04 (query primitives), Feature 03 (populated graph), Phase 0a schemas
  (view output references inventory type definitions).
- **Unblocks**: the Phase 1 demo (the visible end of the slice); the pattern every later view reuses.

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **D-P1.2 — graph adapters** | View projection runs over Feature 04 → graph port; must work on both adapters. |
| **D-P1.3 — language split** | View engine + Domain Map projector are **TypeScript**. |
| **D-P1.4 — flesh out, don't build** | Definition only. |

Spec decisions applied: Decision 1 (hybrid per-view policy — Domain Map registers as on-demand),
Decision 2 (code-based projectors via registration = the OCP point), Decision 3 (staleness metadata
surfaced even though on-demand is always fresh).

### Scope addition during build — real `Subdomain` + `BoundedContext` L1 schemas

`DomainMapView` (spec 007) nests **subdomains → bounded contexts → concepts**, but the Phase 0a
schema set had no `Subdomain` or `BoundedContext` inventory type — only six L1 leaf types — and the
demo spike had proxied a bounded context by its source document. Rather than ship that proxy, the
maintainer chose (2026-06-16) to model both tiers as **real, first-class, additive L1 inventory
schemas** (`schemas/inventory/L1/subdomain.schema.json`, `bounded-context.schema.json`), linked by
`belongsTo` edges (`BoundedContext` → `Subdomain`; `DomainConcept`/`Service` → `BoundedContext`),
with `DomainConcept`/`BoundedContext`'s denormalised `subdomain`/`boundedContext` fields as a
convenience fallback. This **extends** §2's literal in-scope list.

*Rationale*: the headline visible artifact should reflect the real domain structure, not a
source-document proxy; modelling it properly now avoids a retrofit later. *OCP*: the new types are
**new schema files only** — the `SchemaRegistry` auto-discovers them and the relationship cardinality
registry is unchanged (`belongsTo` is type-agnostic with cardinality "exactly one"), so nothing
existing was modified.

## 5. User stories

- *As an architect, I want a Domain Map of subdomains, bounded contexts, and their relationships, so
  that I can see the L1 structure the platform has extracted.*
- *As a platform developer, I want to add a new view by implementing a projector and registering it,
  so that views extend without modifying the engine.*
- *As a user, I want each view to tell me when it was computed and how many entries it covers, so that
  I can trust its freshness.*

## 6. Acceptance criteria (Given/When/Then)

1. **Structure** — *Given* a seeded graph with 2 subdomains, 3 bounded contexts, and contained
   concepts, *when* `getView('domain-map', {})` runs, *then* the `DomainMapView` matches the expected
   nested structure (plan 1.5: "view output matches expected structure for known graph state").
2. **Cross-context edges** — *Given* edges between contexts, *when* the view is projected, *then*
   `crossContextRelationships[]` lists each with `source`,`target`,`type`,`strength` (= edge count).
3. **Counts** — *Given* a context with N concepts and M services, *when* projected, *then*
   `conceptCount==N` and `serviceCount==M`.
4. **Parameter scoping** — *Given* `{subdomain: 'payments'}`, *when* projected, *then* only that
   subdomain's contexts appear.
5. **Empty graph** — *Given* an empty graph, *when* projected, *then* an empty-but-valid
   `DomainMapView` (no nulls/throws).
6. **Registration / OCP** — *Given* a second stub projector, *when* `registerProjector` is called,
   *then* `listViews()` includes it and existing Domain Map tests still pass with no engine change.
7. **Freshness metadata** — *Given* any successful projection, *when* returned, *then* `ViewResult.metadata`
   has `computedAt`, `entriesIncluded`, `cacheHit:false`, `stale:false` (on-demand).
8. **Adapter parity** — *Given* identical data, *when* projected over in-memory and Neo4j, *then*
   identical view output.

## 7. Interface contracts

Reuse spec 007 verbatim: `ViewEngine`, `ViewProjector<TParams,TResult>`, `ViewResult<T>`,
`ViewMetadata`, and the `DomainMapView` output schema. The Domain Map projector:

```typescript
class DomainMapProjector implements ViewProjector<DomainMapParams, DomainMapView> {
  readonly viewType = "domain-map";
  project(params, context): Promise<DomainMapView>;   // composes QueryService primitives
  invalidatedBy(event): boolean;                      // defined; unused while on-demand
}
```

Registered with `refreshPolicy: 'on-demand'`.

## 8. TDD test plan (write these first)

- **Contract — `view-projector.contract.test.ts`**: any projector honours the port (project returns a
  well-formed `ViewResult`, `viewType` stable, `invalidatedBy` total). Future views reuse it.
- **Unit — `view-engine.test.ts`**: register/list/getView dispatch; unknown viewType error; OCP —
  registering a stub projector doesn't disturb existing registrations.
- **Unit — `domain-map-projector.test.ts`**: nesting, counts, cross-context strength aggregation,
  parameter scoping, empty-graph case — driven by an in-memory seeded graph.
- **Integration — `domain-map.int.test.ts`**: full slice — load Feature 03 JSONL fixtures → query →
  project → assert `DomainMapView` over both adapters (the demo path).

## 9. Task breakdown

1. [ ] Define/confirm `ViewEngine`, `ViewProjector`, `ViewResult`, `ViewMetadata`, `DomainMapView` (spec 007).
2. [ ] Write view-projector contract + view-engine tests (failing).
3. [ ] Implement `ViewEngine` registry (register/list/getView, per-view refresh policy field).
4. [ ] Implement `DomainMapProjector` composing Feature 04 query primitives.
5. [ ] Implement freshness metadata population.
6. [ ] Implement parameter scoping (`subdomain?`, `depth`).
7. [ ] Integration test over the loaded graph (both adapters) — the slice demo.

## 10. OCP extension points

- **Open**: new views via `implements ViewProjector` + `registerProjector()` (spec 007 Decision 2);
  per-view refresh policies; later, caching with `invalidatedBy` can be switched on per view without
  changing projectors.
- **Closed**: the `ViewEngine`/`ViewProjector` signatures and `ViewResult` shape; the `DomainMapView`
  output schema (extend additively only). Adding a new view must not modify the Domain Map projector
  or the engine core.

## 11. Open questions / risks

- Spec Open Q1 (view composability) — out of scope for Phase 1; single independent view only.
- Spec Open Q2 (view versioning) — `DomainMapView` evolves additively (OCP); confirm consumer
  tolerance before any breaking change.
- Spec Open Q3 (large-view pagination) — Domain Map is bounded for the pilot; if a subdomain grows
  large, decide whether pagination sits in the engine or the (future) GraphQL layer.
- Caching deferred — confirm on-demand latency is acceptable for the pilot Domain Map size.
