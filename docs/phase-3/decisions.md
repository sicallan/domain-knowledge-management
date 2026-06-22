# Phase 3 — Locked Technical Decisions

These decisions are inputs to every Phase 3 **data-track** feature (3.1–3.4). They resolve the
"Decisions to LOCK" and cross-cutting open questions the flesh-out surfaced across
[docs/features/phase-3/](../features/phase-3/) so the vendor/project extraction (3.2), the Vendor
Coverage Map (3.3) and Gap Analysis (3.4) builds rest on settled ground. Promote any to a full ADR in
[docs/adr/](../adr/) if it proves contentious or far-reaching (the **PostgreSQL** deferral, D-P3.4, is
the prime ADR candidate when the UI/Backend track materialises the need).

Phase 3 goal (from [plan.md](../../plan.md)): **populate the L2 Functional Realisation layer** — the
vendor products, vendor↔domain capability mappings, and project specs that *claim to fulfil* L1 — and
turn the graph into a **coverage and gap** story. This is the first phase that measures
*completeness of realisation*, not just structure and behaviour.

> **Scope.** This file covers the **data/core track** only. The **UI/Backend track** (UI-3.1…UI-3.6)
> has its own tech-stack decisions (UI framework, graph-viz library, GraphQL server framework,
> component library) which are **not** taken here — see *Deferred* below.

## Carried forward from Phases 1–2 (bind unchanged)

[Phase 1 decisions](../phase-1/decisions.md) **D-P1.1** (Claude behind a thin gateway; default
`claude-sonnet-4-6`, escalate low-confidence items to `claude-opus-4-8`), **D-P1.2** (in-memory +
Neo4j graph adapters), **D-P1.3** (TypeScript slice / Python extraction across the JSONL boundary),
**D-P1.5** (two-tier quality model: emit ≥ 0.5, review queue 0.5–0.8, auto-merge ≥ 0.8 — gate hard on
auto-merge precision, accept lower recall). [Phase 2 decisions](../phase-2/decisions.md) **D-P2.2**
(cardinality/conditional rules live in the `RelationshipTypeRegistry`, **one shared rule set** enforced
at both the emit and link gates) and **D-P2.5** (invalid/unresolved edges are quarantined + counted,
never dropped or dangling) bind directly on the new L2 edges. [ADR-0001](../adr/0001-intermediate-jsonl-vs-okf-interchange.md)
(typed JSONL at the core) binds.

---

## D-P3.1 — Vendor/project extraction accuracy floors (precision-first on coverage claims)

The phase's top extraction risk. Extends D-P1.5's two-tier model and confidence bands **verbatim** to
the L2 types. **The costly failure here is a false "covered"**: a `VendorCapabilityMapping` that claims
`full`/`partial` coverage where the truth is `none` (or `full` where it is `partial`) turns a real hole
**green** in the Coverage Map and corrupts build-vs-buy decisions. So the coverage claim gets the
**strictest bar in the L2 layer** — the L2 analogue of the Decision auto-merge bar (D-P2.1). Floors are
a revisable **gate**, not an aspiration.

Measured by spec [005](../../specs/005-enrichment-extraction-pipeline.md)'s `evaluate()` /
`EvaluationMetrics.perType` against a new golden set `evals/payments-vendor-golden/` (Feature 02). The
**auto-merge-band precision** bar (`confidence ≥ 0.8`) is the graph-integrity gate; low-confidence
coverage claims **escalate to `claude-opus-4-8`** before emit (D-P1.1).

**L2 entities** — `VendorProduct`, `VendorCapabilityMapping`, `ProjectSpec` (mirror the Phase 2
behaviour-entity floors; these are as recoverable as structural entities):

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.85** |
| Overall recall | **≥ 0.70** |
| Overall F1 | **≥ 0.77** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.90** |
| Per-type F1 (types with ≥ 5 golden instances) | **≥ 0.65** |

**Coverage-claim accuracy** — the `coverage` value on `VendorCapabilityMapping`, scored separately
because it is the expensive-when-wrong signal. Precision-first, modest recall (the review queue catches
the rest), strictest auto-merge bar in the layer:

| Metric | Floor |
|---|---|
| Precision of a *covered* claim (`coverage ∈ {full, partial}` when truth says so) | **≥ 0.90** |
| **Auto-merge-band precision** (`c ≥ 0.8`) on covered claims | **≥ 0.92** ← strictest L2 bar |
| Coverage recall | **≥ 0.65** (modest — review queue catches the rest) |

**L2 structural relationships** — `fulfils`, `specifies`, `realizesVendorCap` (mirror the Phase 2
behavioural-relationship floors; cross-layer edges are often implicit in vendor prose):

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.75** |
| Overall recall | **≥ 0.55** |
| Overall F1 | **≥ 0.63** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.85** |

**Per-type support caveat** (as Phases 1–2): per-type floors apply only to types with **≥ 5** labelled
golden instances; rarer types are reported but not gated. Inferred (vs explicitly-stated) coverage is
emitted at **lower confidence** so it routes to the review queue rather than auto-merge.
Resolves [feature 02 §11](../features/phase-3/02-vendor-mapping-extraction.md).

## D-P3.2 — Coverage semantics: a `{full, partial, none}` enum plus an optional percentage

Resolves [feature 01 §11 / feature 03 §11](../features/phase-3/03-coverage-view.md). `coverage` on
`VendorCapabilityMapping` is an enum **`{full, partial, none}`**, with an optional numeric
**`coveragePercentage`** (0–100) when the source states one. The enum maps **1:1** onto spec 007's
Coverage Map cell status: `full → covered`, `partial → partial`, `none → uncovered`. One vocabulary,
shared by the extractor (3.2), the schema (3.1, shipped), the Coverage Map (3.3) and the realisation
predicate (D-P3.3) — no second coverage vocabulary anywhere.

**Partial-coverage roll-up** (when several mappings touch one capability): **worst-wins for the gap
signal** (any `none` ⇒ the cell shows the gap), while surfacing the **max** `coveragePercentage`. This
rule lives in the realisation predicate (D-P3.3) so 3.3 and 3.4 agree.

## D-P3.3 — One shared realisation predicate, consumed by both the Coverage Map and Gap Analysis

Resolves [feature 03 §2 / feature 04 §11](../features/phase-3/04-gap-analysis-view.md) — the
single-source-of-truth lesson from Phase 2.5 (one cross-layer rule set), applied to "is this L1 element
realised?". A drift between how 3.3 computes "covered" and how 3.4 computes "a gap" would be a silent
correctness bug, so the definition lives in **one module** (`realisation-predicate.ts`, owned by 3.3,
imported by 3.4 — never forked):

- **Functionally realised** ⇔ ≥ 1 incoming `specifies`/`fulfils` (L2) **or** a `VendorCapabilityMapping`
  with `coverage ≠ none`.
- **Technically realised** ⇔ ≥ 1 incoming `implements`/`realizedBy` (L3).
- The Gap view's `layer` param selects functional / technical / both; the Coverage Map's `uncovered`
  cell set **must equal** the Gap view's functional-gap set (a parity test guards this and is a release
  blocker).

## D-P3.4 — PostgreSQL: deferred — the data track reads the graph, no relational store yet

The CLAUDE.md "Relational DB / PostgreSQL (Phase 3)" deferred decision, now **explicitly decided for
the data track: defer.** The Coverage Map and Gap Analysis read the graph through the Query Interface
(in-memory / Neo4j, D-P1.2) and need no relational store; extraction stops at typed JSONL (ADR-0001).
PostgreSQL lands when the **UI/Backend track's** admin/reporting/RBAC/audit needs materialise — **raise
an ADR there**, not here. Resolves [feature README *Decisions to LOCK #4*](../features/phase-3/README.md).

## D-P3.5 — L2 attribute naming avoids the base-entry collisions (ratifies what 3.1 shipped)

Resolves [feature 01 §11 *Decision-to-LOCK #5*](../features/phase-3/01-l2-vendor-project-schemas.md).
Following the established `decisionType`/`eventType` convention (Phase 2), L2 type-specific fields are
renamed where they would clobber a base-entry field:

- `ProjectSpec.type (requirement/design/ADR)` → **`specType`** (the base-entry discriminator stays
  `type: { const: "ProjectSpec" }`).
- `VendorProduct.version` (the *product* version) → **`productVersion`** (distinct from the base-entry
  `version`, this entry definition's semver lifecycle version).

Shipped and tested in Feature 3.1 (PR #55).

## D-P3.6 — `VendorCapabilityMapping` is a first-class node with a typed `mappedConcept` reference

Resolves the [feature README cross-cutting question](../features/phase-3/README.md) ("node or edge?").
It is a **first-class inventory node** — it carries its own evidence, `coverage`, `coveragePercentage`
and `gaps`, and must be versioned/evidenced like any assertion — with `fulfils`/`specifies` as the thin
edges and `realizesVendorCap(Service → VendorCapabilityMapping)` pointing at it. Its `mappedConcept` is
a **typed reference** `{ targetType: DomainConcept | BusinessCapability, targetId }`, so the realisation
predicate (D-P3.3) resolves both concept- and capability-oriented mappings. Shipped in Feature 3.1.

---

## Deferred to their own feature (default = the doc's recommendation)

Locked lightly now; finalise when the feature is built so we don't over-commit ahead. The feature
doc's recommendation is the working default:

- **3.3 Coverage Map render target** — default **Markdown/HTML matrix with RAG cell colouring**
  (consistent with the stakeholder deck); a PlantUML `salt` render stays secondary. The
  `VendorCoverageView` output grows **additively only** until a Phase 3 GraphQL contract pins it
  ([feature 03 §11](../features/phase-3/03-coverage-view.md)).
- **3.3 matrix rows** — default rows are **`BusinessCapability`**, with a `DomainConcept` mode; both
  resolved by the realisation predicate (D-P3.3) ([feature 03 §11](../features/phase-3/03-coverage-view.md)).
- **3.4 Gap Analysis is a deterministic projector, not an LLM agent** — gaps are the *absence* of
  realisation edges (a pure graph property), so detection is exact, cheap and CI-green without secrets;
  the "agent" framing is met by a computed reason + prioritisation hint per gap. An LLM-assisted
  *explanation/remediation* layer is additive and revisited only if asked
  ([feature 04 §11](../features/phase-3/04-gap-analysis-view.md)).
- **UI/Backend track tech stack** — UI framework, graph-visualisation library, GraphQL server
  framework, and component library are **not** chosen here; each is captured as an ADR when the
  UI/Backend track (UI-3.1…UI-3.6) begins ([ui-backend-plan.md](../../ui-backend-plan.md)).
