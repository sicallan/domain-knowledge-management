# Feature 03 — Vendor Coverage Map View

## 1. Feature

- **Name**: A third view projector — the **Vendor Coverage Map**: domain concepts / business
  capabilities × vendor coverage **matrix** with gap indicators, plus a Markdown/HTML matrix render
  (the phase's visible payoff).
- **Plan step**: 3.3 — *Coverage view: domain concepts vs vendor/project coverage matrix* ([plan.md
  §Phase 3](../../../plan.md)).
- **Spec(s) expanded**: [specs/007-view-projection-engine.md](../../../specs/007-view-projection-engine.md)
  — the **Vendor Coverage Map** row (viewType `vendor-coverage`, params `{ vendor?, domain? }`). This
  feature realises that view; the engine, projector port and contract suite already exist.

## 2. Summary & scope

The first view that measures **completeness of realisation**. The Domain Map (Phase 1) and Behaviour
Flow (Phase 2) describe *what exists*; the Coverage Map answers *which capabilities are covered, by
which vendor products, and where the holes are*. It is a deterministic projection: read L1 capabilities
/ concepts and the L2 `VendorProduct` + `VendorCapabilityMapping` + `fulfils` edges through the Query
Interface, assemble a matrix of rows (capabilities) × columns (vendor products), each cell a coverage
status derived from the shared realisation predicate, then render it.

> **Reuse the shipped view machinery, do NOT re-author.** The `ViewEngine`, the `ViewProjector` port,
> the reusable `runViewProjectorContractTests` contract suite
> ([contract.ts](../../../modules/view-projection/src/contract.ts)), and the pattern of composing
> **only** Query-Interface primitives (`listEntries`, `traverse`) — so adapter parity (in-memory ↔
> Neo4j, D-P1.2) is inherited and the projector never touches the graph port — are all established by
> the Domain Map ([domain-map-projector.ts](../../../modules/view-projection/src/domain-map-projector.ts))
> and Behaviour Flow projectors. This feature adds a **new projector + render**, nothing more.

**In scope**
- A `VendorCoverageProjector` (`viewType: "vendor-coverage"`, params `{ vendor?, domain? }`) producing a
  `VendorCoverageView` matrix, registered on the engine.
- The **shared realisation predicate** (Decision-to-LOCK #3) — defined here as a small pure module and
  **reused verbatim** by Feature 04 (gap), so coverage and gap can never disagree.
- A total `invalidatedBy` over mutations to L1 capabilities/concepts and L2 products/mappings + their
  edges.
- A **matrix render** (Markdown/HTML with RAG cell colouring — Decision-to-LOCK / README open Q) and a
  demo wiring that produces a populated Coverage Map from the seeded/extracted graph.

**Out of scope**
- The L2 schemas (Feature 01) and extraction (Feature 02) — this view *reads* their output.
- The Gap Analysis view (Feature 04 — sibling; shares the predicate but renders the *absence*).
- The Compliance Matrix (Phase 3+/4 — different view; spec 007 lists it separately).
- Any UI canvas (UI/Backend track) — this feature ends at the projected data + a static render.

## 3. Dependencies

- **Upstream**: Feature 01 (L2 schemas + `fulfils`/`realizesVendorCap` edge defs); the Query Interface
  (`listEntries`, `traverse`); the View Projection engine + contract suite. A *meaningful* (populated)
  matrix additionally needs Feature 02's extracted data, but the projector is TDD'd against a seeded
  graph and does not block on it.
- **Unblocks**: the Phase 3 demo (coverage matrix); Feature 04 reuses the realisation predicate; the
  UI/Backend Knowledge Explorer later renders this view interactively.
- **Cross-feature**: owns the **realisation predicate** that Feature 04 imports.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **D-P1.2 — in-memory + Neo4j adapters** | Projector composes only Query-Interface primitives; adapter parity is inherited — never touch the graph port. |
| **spec 007 — ViewProjector port + contract suite** | The projector satisfies `runViewProjectorContractTests` (stable `viewType`, well-formed `ViewResult`, total `invalidatedBy`). |
| **Decision-to-LOCK #2 — coverage vocab** | Cell status maps 1:1 from `coverage ∈ {full,partial,none}` → `covered|partial|uncovered`. |
| **Decision-to-LOCK #3 — one realisation predicate** | Defined here, imported by Feature 04 — single source of "is this realised?". |

## 5. User stories

- *As a solution architect, I want a matrix of capabilities × vendor products with coverage status, so
  that I can spot build-vs-buy opportunities at a glance.*
- *As a portfolio manager, I want gap indicators (uncovered / partial cells) highlighted, so that I can
  direct investment.*
- *As a domain architect, I want to filter the matrix by domain or vendor, so that I can focus on one
  subdomain or one product's footprint.*
- *As a maintainer, I want this to be a new projector satisfying the same contract as every other view,
  so that the port guarantee holds.*

## 6. Acceptance criteria (Given/When/Then)

1. **Contract compliance** — *Given* the projector, *when* run through `runViewProjectorContractTests`,
   *then* all pass: stable non-empty `viewType` (`"vendor-coverage"`), a well-formed `ViewResult`, and
   a total `invalidatedBy`.
2. **Matrix for known mappings** — *Given* a seeded graph with two capabilities, two vendor products,
   and `fulfils`/`VendorCapabilityMapping` edges of known coverage, *when* projected, *then* the matrix
   rows×columns and each cell's status match the expected fixture exactly (plan 3.3 TDD: "view matches
   expected for known mappings").
3. **Coverage status mapping** — *Given* a mapping with `coverage: "full"`, *then* its cell is
   `covered`; `partial` → `partial`; `none` (or no mapping) → `uncovered`.
4. **Gap indicators + summary** — *Given* the matrix, *then* it carries per-row gap flags and a summary
   `{ totalCapabilities, covered, partial, uncovered, coveragePercentage }`.
5. **`domain` filter** — *Given* `params.domain`, *then* only capabilities/concepts in that domain
   appear as rows; others are excluded.
6. **`vendor` filter** — *Given* `params.vendor`, *then* only that vendor's products appear as columns.
7. **Adapter parity** — *Given* the same seeded data on the in-memory and (skip-guarded) Neo4j
   adapters, *then* the projection is identical (inherited via the Query Interface; mirrors Phase 2's
   cross-adapter e2e).
8. **`invalidatedBy` totality** — *Given* any `GraphMutationEvent`, *then* `invalidatedBy` returns a
   boolean and never throws; mutations to capabilities/concepts/vendor products/mappings/`fulfils`
   edges return `true`.
9. **Render** — *Given* a projected matrix, *when* rendered, *then* the output is a deterministic
   Markdown/HTML table with RAG cell colouring; a demo script produces a populated Coverage Map.

## 7. Interface contracts

Reuse spec 007's `ViewEngine`/`ViewProjector`/`ViewResult` verbatim. New types (in
`modules/view-projection/src/types.ts`) + projector + render:

```typescript
interface VendorCoverageView {
  rows: { id: string; name: string; kind: "BusinessCapability" | "DomainConcept" }[];
  columns: { id: string; name: string; vendor: string }[];        // VendorProducts
  cells: { rowId: string; columnId: string; status: "covered" | "partial" | "uncovered";
           coveragePercentage?: number; mappingId?: string; gaps?: string[] }[];
  summary: { totalCapabilities: number; covered: number; partial: number; uncovered: number;
             coveragePercentage: number };
}
interface VendorCoverageParams { vendor?: string; domain?: string; }
```

New files:

```
modules/view-projection/src/vendor-coverage-projector.ts
modules/view-projection/src/realisation-predicate.ts        # shared with Feature 04
modules/view-projection/src/vendor-coverage-render.ts        # Markdown/HTML matrix
```

## 8. TDD test plan (write these first)

- **Contract — `vendor-coverage.contract.test.ts`**: drive `runViewProjectorContractTests` with a
  factory that seeds the harness graph (criterion 1).
- **Unit — `vendor-coverage-projector.test.ts`**: the known-mappings fixture → exact matrix
  (criteria 2–4); `domain`/`vendor` filters (5–6); `invalidatedBy` relevance (8).
- **Unit — `realisation-predicate.test.ts`**: `full|partial|none` + edge presence → status; the same
  module Feature 04 imports (proves single source of truth).
- **E2E — cross-adapter**: in-memory vs skip-guarded Neo4j parity (criterion 7), mirroring Phase 2.4/2.5.
- **Render — `vendor-coverage-render.test.ts`**: a fixed matrix → expected Markdown/HTML snapshot
  (criterion 9).

## 9. Task breakdown

1. [ ] Define `VendorCoverageView`/`VendorCoverageParams` types.
2. [ ] Implement `realisation-predicate.ts` (shared) — coverage status from mapping + edges.
3. [ ] Implement `VendorCoverageProjector` composing `listEntries`/`traverse`; register on the engine.
4. [ ] Implement `invalidatedBy` over the relevant node/edge types.
5. [ ] Implement the Markdown/HTML matrix render + a demo wiring against the seeded/extracted graph.
6. [ ] Contract + unit + cross-adapter + render tests (write first).

## 10. OCP extension points

- **Open**: new view projectors (this one) registered on the engine; additive matrix fields; an
  alternative render target (PlantUML/CSV) added without touching the projector.
- **Closed**: the `ViewEngine`/`ViewProjector` interfaces, the Query Interface, the realisation
  predicate's contract (Feature 04 depends on it). Adding this view must not modify them.

## 11. Open questions / risks

- **Rows = capabilities or concepts?** spec 007 calls it "domain concepts × vendor"; the plan view
  table says "vendor products cover which **capabilities**". *Recommendation:* rows default to
  `BusinessCapability`, with a `DomainConcept` mode — both resolved by the realisation predicate (the
  `mappedConcept` typed ref from Feature 01). Confirm the default.
- **Render target (README open Q)** — Markdown/HTML RAG table recommended over PlantUML `salt`. Confirm
  which the demo leads with.
- **Partial-coverage aggregation** — when several mappings touch one capability with different coverage,
  how to roll up the cell. *Recommendation:* worst-wins for the gap signal (any `none` ⇒ show the gap)
  but surface the max `coveragePercentage`; define in the predicate so Feature 04 agrees.
