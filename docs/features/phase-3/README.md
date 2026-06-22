# Phase 3 — Feature Definitions (data/core track)

**Goal**: populate the **Functional Realisation layer (L2)** — vendor products, vendor↔domain
capability mappings, and project specs that *claim to fulfil* the L1 canonical truth — and turn the
graph into a **coverage and gap** story: *which domain concepts are realised, by what, and where are
the holes* ([plan.md §Phase 3](../../../plan.md)). This is the layer that answers build-vs-buy and
"what isn't implemented yet" — the first time the platform measures **completeness of realisation**,
not just structure and behaviour.

> **Scope of this directory.** Phase 3 runs **two parallel tracks**. This directory covers the
> **data/core track** (main-plan steps 3.1–3.4). The **UI & Backend Application** workstream
> (application shell, GraphQL API, OIDC/RBAC auth, Knowledge Explorer — steps UI-3.1…UI-3.6 in
> [ui-backend-plan.md](../../../ui-backend-plan.md)) is a separate, heavier track gated on its own
> tech-stack ADRs (UI framework, graph-viz library, GraphQL server, component library) and is **not**
> fleshed out here. The data track is sequenced first: it extends the proven extract→JSONL→loader→
> view→render slice with **no new tech stack**, lands the demo-first payoff (coverage + gap views),
> and gives the UI track real L2 data to render.

Source of truth: [plan.md §Phase 3](../../../plan.md), the Phase 3 specs in [specs/](../../../specs/)
(notably [007 View Projection](../../../specs/007-view-projection-engine.md),
[001 Schema Module](../../../specs/001-schema-module.md),
[005 Enrichment/Extraction](../../../specs/005-enrichment-extraction-pipeline.md),
[003 Intermediate JSONL & Loaders](../../../specs/003-intermediate-jsonl-and-loaders.md)), the
carried-forward [Phase 1](../phase-1/decisions.md) / [Phase 2](../phase-2/decisions.md) decisions, and
the accepted [ADRs](../../adr/). These docs **expand** those specs into buildable feature definitions;
they do not restate or contradict them.

## Feature index

| # | Feature | Plan step | Spec(s) | Lang | One-line summary |
|---|---------|-----------|---------|------|------------------|
| [01](01-l2-vendor-project-schemas.md) | L2 vendor/project inventory schemas | 3.1 | [001](../../../specs/001-schema-module.md) | TS/JSON Schema | First **L2** schemas (`VendorProduct`/`VendorCapabilityMapping`/`ProjectSpec`) + the L2 **structural** relationship schemas (`fulfils`/`specifies`/`realizesVendorCap`), cardinality-registered. The gate for the rest of the phase. |
| [02](02-vendor-mapping-extraction.md) | Vendor/project mapping extraction | 3.2 | [005](../../../specs/005-enrichment-extraction-pipeline.md), [003](../../../specs/003-intermediate-jsonl-and-loaders.md) | Py | New extraction **pass**: vendor & project docs → L2 entities + L2 structural edges + `satisfiedBy` → JSONL; vendor-mapping golden dataset with a **precision-first coverage-claim** gate. |
| [03](03-coverage-view.md) | Vendor Coverage Map view | 3.3 | [007](../../../specs/007-view-projection-engine.md) | TS | Third view projector: domain concepts × vendor coverage **matrix** with gap indicators; PlantUML/Markdown matrix render (the phase's visible payoff). |
| [04](04-gap-analysis-view.md) | Gap Analysis view | 3.4 | [007](../../../specs/007-view-projection-engine.md) | TS | Deterministic graph-analysis projector: L1 concepts lacking L2/L3 realisation, with the *reason* and a prioritisation hint. Shares **one realisation predicate** with 03. |

## Build order

`01` (schemas — gate) → `02` (vendor/project extraction) → `03` (Coverage Map) + `04` (Gap Analysis).
03 and 04 can overlap once 01 lands: both are deterministic graph-analysis projectors TDD'd against a
seeded graph, so they don't *block* on 02 — but the **demo** (a populated coverage matrix and a real
gap list) needs 02's extracted L2 data. 03 and 04 deliberately share one realisation predicate
(see *Decisions to LOCK* #3) — build 03 first so 04 reuses it.

## Slice flow

```
                                   ┌─► [02 vendor/project extraction] ─► L2 entities + fulfils/specifies/
vendor & project docs ─► (Phase 1  ┤   realizesVendorCap/satisfiedBy edges ─► JSONL ─► loader ─► graph
   pipeline, reused)               └────────────────────────────────────────────────────────┐
                                                                                             ▼
[01 L2 schemas + structural edges] ── define ──► (VendorProduct/Mapping/ProjectSpec,   [03 Coverage Map ─► matrix render]
   cardinality at emit + link gates)                 L2 edge types, coverage semantics) [04 Gap Analysis ─► gap list]
                                                                                  (one shared realisation predicate)
```

## Layer note (this is the first L2 layer)

Phase 0–2 populated **L1** (structural + decisions) and **L3** (behaviour). Phase 3 introduces the
**L2 Functional Realisation** layer for the first time. Schemas live under
`schemas/inventory/L2/` (a new directory); the `SchemaRegistry`'s `layerFromPath` already recognises
`L2` and discovery is recursive ([registry.ts](../../../modules/schema/src/registry.ts)), so the new
files are auto-discovered with **no registry edit** — Feature 01 proves this with a test. L2 asserts
*claims to fulfil* L1; it never replaces L1 canonical truth (vendor/tech-agnostic stays the source of
truth — everything maps *to* it).

## Decisions applied across all features (carried forward)

These Phase 1/2 decisions and accepted ADRs bind in Phase 3:

- **D-P1.1** — LLM access is **Claude behind a thin gateway** (default `claude-sonnet-4-6`, escalate
  low-confidence re-runs to `claude-opus-4-8`). Applies to 02 (vendor coverage claims are a canonical
  escalation case — a wrong "covered" is expensive; see *Decisions to LOCK* #1).
- **D-P1.2** — Graph store has **in-memory + Neo4j adapters** behind the 0b port. Applies to 03, 04
  (projectors compose only Query-Interface primitives, so adapter parity is inherited — never touch
  the graph port directly).
- **D-P1.3** — **TypeScript** for schemas/views/query/loader; **Python** for extraction; integrated
  only across the JSONL/file boundary. Applies to all.
- **D-P2.2** — one **shared cardinality rule set** enforced at both the emit gate (extraction) and the
  link gate (loader). The new L2 structural edge defs join that single set (Feature 01).
- **ADR-0001** — Internal intermediate format is **typed JSONL**, never OKF.

## Decisions to LOCK before build

Five genuinely new choices should be ratified (as `docs/phase-3/decisions.md` and/or ADRs) **before**
the gated tests are meaningful:

1. **Vendor-mapping extraction accuracy floor** (Feature 02 §11) — the **costly failure here is a
   false "covered"** (a wrong VendorCapabilityMapping over-claims coverage → the Coverage Map shows
   green where there's a hole → bad build-vs-buy calls). *Recommendation:* mirror the Decision gate
   (Phase 2) — set the **auto-merge-band precision** bar highest on coverage claims; accept a modest
   recall floor + review queue (D-P1.5 two-tier model). Confirm exact numbers.
2. **Coverage semantics** (Features 01–03) — how `coverage` on `VendorCapabilityMapping` is modelled.
   *Recommendation:* an enum `{ full, partial, none }` plus an optional numeric `coveragePercentage`,
   so it maps 1:1 onto spec 007's cell status `covered | partial | uncovered`. Lock so extraction (02)
   and the view (03) agree on one vocabulary.
3. **One shared realisation predicate** (Features 03–04) — the single definition of "is this L1
   concept realised?". *Recommendation:* **functionally realised** = ≥1 incoming `specifies`/`fulfils`
   (L2) **or** a `VendorCapabilityMapping` with coverage ≠ `none`; **technically realised** = ≥1
   incoming `implements`/`realizedBy` (L3). The `layer` param selects which. Define it **once** and
   have both 03 (coverage) and 04 (gap) consume it — same lesson as Phase 2.5's single cross-layer
   rule set; drift between "coverage" and "gap" would be a silent correctness bug.
4. **PostgreSQL** (deferred decision, due Phase 3 — [plan.md §Tech Stack](../../../plan.md)).
   *Recommendation across the data track:* **not yet**. The coverage/gap views read the graph through
   the Query Interface (in-memory/Neo4j) and need no relational store. Postgres lands when the
   **UI/Backend** track's admin/reporting/RBAC needs materialise — raise the ADR there, not here.
5. **Attribute-name collisions with `base-entry`** (Feature 01) — `ProjectSpec.type
   (requirement/design/ADR)` collides with the base-entry `type` discriminator, and
   `VendorProduct.version` (the *product* version) collides with the base-entry `version` (the
   *entry's* lifecycle version). *Recommendation:* rename to **`specType`** and **`productVersion`**,
   following the established **`decisionType`/`eventType`** convention from Phase 2. Confirm so the
   schemas and extraction targets are closed.

## Cross-cutting open questions for the team

- **`VendorCapabilityMapping` — node or edge?** The plan lists it as an L2 *inventory* node
  ("vendor capability → domain concept, coverage, gaps"), and `realizesVendorCap(Service →
  VendorCapabilityMapping)` treats it as an endpoint. *Recommendation:* keep it a **first-class node**
  (it carries its own evidence, coverage and gaps and must be versioned/evidenced like any assertion),
  with `fulfils`/`specifies` as the thin edges. Confirm in Feature 01.
- **Gap Analysis: view or agent?** Plan step 3.4 says "gap analysis *agent*"; spec 007 frames Gap
  Analysis as a *view*. *Recommendation:* implement it as a **deterministic graph-analysis projector**
  (Feature 04) — no LLM needed (gaps are the absence of realisation edges), so it's exact, cheap and
  CI-green without secrets. "Agent" framing is satisfied by the projector emitting a reason +
  prioritisation hint per gap. Revisit an LLM-assisted *explanation* layer only if needed.
- **Coverage matrix render target** — the visible payoff. PlantUML's table support is via `salt`,
  which is awkward for a heatmap. *Recommendation:* render the matrix as **Markdown/HTML with RAG
  cell colouring** (consistent with the stakeholder deck), and keep a PlantUML option secondary —
  confirm which the demo should lead with.
