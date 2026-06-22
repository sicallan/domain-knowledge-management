# Feature 04 — Gap Analysis View

## 1. Feature

- **Name**: A deterministic graph-analysis projector — **Gap Analysis**: L1 concepts/capabilities that
  lack L2/L3 realisation, each with the *reason* (which realisation is missing) and a prioritisation
  hint.
- **Plan step**: 3.4 — *Gap analysis agent: identify unmapped L1 concepts* ([plan.md
  §Phase 3](../../../plan.md)).
- **Spec(s) expanded**: [specs/007-view-projection-engine.md](../../../specs/007-view-projection-engine.md)
  — the **Gap Analysis** row (viewType `gap-analysis`, params `{ domain?, layer? }`: "L1 concepts
  without L2/L3 realisation").

## 2. Summary & scope

The inverse of the Coverage Map: instead of "what's covered", it surfaces **what isn't**. Plan step
3.4 calls it an "agent", but gaps are the **absence of realisation edges** — a pure graph property —
so it is implemented as a **deterministic projector**, not an LLM agent: exact, cheap, CI-green without
secrets. (The "agent" framing is satisfied by emitting a *reason* and a *prioritisation hint* per gap,
not by invoking a model.) It **imports the same realisation predicate** Feature 03 defines, so the
coverage matrix and the gap list can never disagree — the single-source-of-truth lesson from Phase 2.5.

> **Reuse, do NOT re-author.** Same `ViewEngine`/`ViewProjector` port + `runViewProjectorContractTests`
> contract suite as Feature 03; same Query-Interface-only composition (adapter parity inherited,
> D-P1.2); and the **realisation predicate module from Feature 03**. This feature adds a new projector
> + a gap-list render; it neither rebuilds the engine nor re-derives "is this realised?".

**In scope**
- A `GapAnalysisProjector` (`viewType: "gap-analysis"`, params `{ domain?, layer? }`) producing a
  `GapAnalysisView`: the list of unrealised L1 concepts/capabilities, each annotated with the missing
  realisation layer(s) and a prioritisation hint.
- `layer` param selecting **functional** gaps (no L2 realisation) vs **technical** gaps (no L3
  realisation) vs both.
- A total `invalidatedBy` over the same node/edge types as Feature 03 (any change can open/close a gap).
- A **gap-list render** (Markdown/HTML) and demo wiring producing a real gap list from the
  seeded/extracted graph — the second half of the Phase 3 visible story.

**Out of scope**
- Defining the realisation predicate (Feature 03 owns it — imported here).
- An LLM-assisted *explanation* of *why* a gap exists or *how* to close it (possible later; not needed
  for a correct, useful gap list).
- The Coverage Map matrix (Feature 03 — sibling).
- Remediation/workflow (no auto-creation of project specs to fill gaps — that's a human decision).

## 3. Dependencies

- **Upstream**: Feature 03 (the realisation predicate + the view port pattern); Feature 01 (L2 schemas
  + edges so realisation edges exist to be absent); the Query Interface + View engine. A *meaningful*
  gap list needs Feature 02's data, but the projector is TDD'd against a seeded graph.
- **Unblocks**: the Phase 3 demo's gap half; the Portfolio/Gap UI screen (UI/Backend track) later.
- **Cross-feature**: **consumes** Feature 03's realisation predicate (must not fork it).

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **Decision-to-LOCK #3 — one realisation predicate** | Import Feature 03's module; do not re-define "realised". A divergence here is a silent correctness bug. |
| **README open Q — view, not LLM agent** | Implement deterministically; reason + prioritisation hint are computed, not generated. |
| **D-P1.2 — in-memory + Neo4j adapters** | Query-Interface-only composition; adapter parity inherited. |
| **spec 007 — ViewProjector port + contract suite** | Satisfies `runViewProjectorContractTests`. |

## 5. User stories

- *As a portfolio manager, I want a list of domain concepts with no functional or technical
  realisation, so that I can prioritise investment (plan view-table user story).*
- *As a domain architect, I want each gap to say which layer is missing (no vendor mapping? no
  service?), so that I know whether it's a buy or a build gap.*
- *As a compliance lead, I want to filter gaps to a domain, so that I can assess one subdomain's
  completeness.*
- *As a maintainer, I want the gap view to share the coverage view's realisation logic, so that the two
  never contradict each other.*

## 6. Acceptance criteria (Given/When/Then)

1. **Contract compliance** — *Given* the projector, *when* run through
   `runViewProjectorContractTests`, *then* all pass (`viewType` = `"gap-analysis"`, well-formed
   `ViewResult`, total `invalidatedBy`).
2. **Identifies known gaps** — *Given* a seeded graph where concept A has a realisation edge and
   concept B has none, *when* projected with no `layer` filter, *then* B appears as a gap and A does
   not (plan 3.4 TDD: "correctly identifies known gaps in test graph").
3. **Reason annotation** — *Given* a gap, *then* it records which realisation is missing
   (`missingLayers: ("L2" | "L3")[]`) — e.g. "no `fulfils`/`specifies` (functional) and no
   `implements`/`realizedBy` (technical)".
4. **`layer: "functional"`** — *Given* a concept with an L3 service but no L2 mapping, *when* projected
   with `layer: "functional"`, *then* it is reported as a *functional* gap (technically realised,
   functionally not).
5. **`layer: "technical"`** — symmetrically, a concept with an L2 mapping but no L3 service is a
   *technical* gap.
6. **`domain` filter** — *Given* `params.domain`, *then* only that domain's concepts are assessed.
7. **Prioritisation hint** — *Given* the gap list, *then* each gap carries a deterministic hint
   (e.g. ordered by number of dependent concepts / incoming edges) so the list is actionably ranked.
8. **Predicate parity with Coverage Map** — *Given* the same seeded graph, *then* every concept the
   Coverage Map marks `uncovered` appears as a (functional) gap and vice-versa — proving both consume
   the one predicate (a direct cross-feature test).
9. **Adapter parity** — in-memory vs skip-guarded Neo4j projection identical (inherited).
10. **Render** — *Given* the gap list, *when* rendered, *then* a deterministic Markdown/HTML list/table;
    a demo script produces a real gap list.

## 7. Interface contracts

Reuse spec 007's port verbatim. New types + projector + render:

```typescript
interface GapAnalysisView {
  gaps: {
    id: string; name: string; kind: "DomainConcept" | "BusinessCapability";
    domain?: string;
    missingLayers: ("L2" | "L3")[];      // which realisation is absent
    priority: number;                     // deterministic rank (higher = more dependents)
    reason: string;                       // human-readable, computed
  }[];
  summary: { totalAssessed: number; functionalGaps: number; technicalGaps: number; fullyRealised: number };
}
interface GapAnalysisParams { domain?: string; layer?: "functional" | "technical" | "both"; }
```

New files:

```
modules/view-projection/src/gap-analysis-projector.ts
modules/view-projection/src/gap-analysis-render.ts
// imports realisation-predicate.ts from Feature 03 — does NOT re-implement it
```

## 8. TDD test plan (write these first)

- **Contract — `gap-analysis.contract.test.ts`**: `runViewProjectorContractTests` with a seeding
  factory (criterion 1).
- **Unit — `gap-analysis-projector.test.ts`**: known-gap fixture (criterion 2); `missingLayers`
  annotation (3); `functional`/`technical`/`both` filters (4–5); `domain` filter (6); priority
  ordering (7).
- **Cross-feature — `coverage-gap-parity.test.ts`**: same graph → Coverage Map `uncovered` set ≡ Gap
  view functional-gap set (criterion 8); this is the guard against predicate drift.
- **E2E — cross-adapter** parity (criterion 9).
- **Render — `gap-analysis-render.test.ts`**: fixed gap list → expected snapshot (criterion 10).

## 9. Task breakdown

1. [ ] Define `GapAnalysisView`/`GapAnalysisParams` types.
2. [ ] Implement `GapAnalysisProjector` importing the Feature 03 realisation predicate; compute
   `missingLayers`, `reason`, `priority`.
3. [ ] Implement `invalidatedBy` over the relevant node/edge types.
4. [ ] Implement the gap-list render + demo wiring.
5. [ ] Contract + unit + **coverage-gap parity** + cross-adapter + render tests (write first).

## 10. OCP extension points

- **Open**: additive gap annotations (e.g. a future `estimatedEffort`); an LLM-assisted explanation
  layer added as a separate enrichment without touching the deterministic core; alternative renders.
- **Closed**: the `ViewProjector` interface, the Query Interface, and **Feature 03's realisation
  predicate** (consumed, never forked). Adding gap analysis must not modify them.

## 11. Open questions / risks

- **Predicate drift is the headline risk.** If 03 and 04 ever compute "realised" differently, coverage
  and gap silently contradict. *Mitigation:* the shared module + the `coverage-gap-parity` test
  (criterion 8) — treat a parity-test failure as a release blocker.
- **"Agent" vs deterministic projector (README open Q).** *Recommendation:* deterministic now; revisit
  an LLM explanation/remediation-suggestion layer only if users ask "why is this a gap and what fills
  it" — and keep it additive (the gap *detection* stays exact).
- **Prioritisation heuristic** — ranking by incoming-edge count is a starting proxy for "importance".
  *Recommendation:* keep it deterministic and documented; richer prioritisation (value-stream weight)
  arrives with L0 in Phase 6. Confirm the v1 heuristic.
- **Capabilities vs concepts as the unit assessed** — align with Feature 03's row default so the parity
  test is meaningful across the same population.
