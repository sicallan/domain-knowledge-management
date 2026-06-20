# Phase 2 — Locked Technical Decisions

These decisions are inputs to every Phase 2 feature (2.1–2.5). They resolve the "Open questions /
risks" the flesh-out surfaced across [docs/features/phase-2/](../features/phase-2/) so the
behaviour-extraction (2.2), decision-extraction (2.3), view (2.4) and cross-layer-linking (2.5)
builds rest on settled ground. Promote any to a full ADR in [docs/adr/](../adr/) if it proves
contentious or far-reaching (the workflow-engine deferral is already [ADR-0003](../adr/0003-workflow-engine-deferred.md)).

Phase 2 goal (from [plan.md](../../plan.md)): **behaviour inventories + Decision as a first-class
node**, extracted, cross-layer-linked, and made visible — Decisions are the highest-value nodes,
where regulation bites and business logic concentrates.

## Carried forward from Phase 1 (bind unchanged)

[Phase 1 decisions](../phase-1/decisions.md) **D-P1.1** (Claude behind a thin gateway; default
`claude-sonnet-4-6`, escalate low-confidence items to `claude-opus-4-8`), **D-P1.2** (in-memory +
Neo4j graph adapters), **D-P1.3** (TypeScript slice / Python extraction across the JSONL boundary),
and **D-P1.5** (two-tier quality model: emit ≥ 0.5, review queue 0.5–0.8, auto-merge ≥ 0.8 — gate
hard on auto-merge precision, accept lower recall) all carry forward. [ADR-0001](../adr/0001-intermediate-jsonl-vs-okf-interchange.md)
(typed JSONL at the core) and [ADR-0002](../adr/0002-vector-store-selection-deferred.md) bind.

---

## D-P2.1 — Decision & behaviour extraction accuracy floors

The phase's top risk, and the **most safety-critical unset decision** (a wrong auto-merged
**Decision** is the single most expensive failure in the system). Extends D-P1.5's two-tier model and
confidence bands **verbatim** — same bands, same "missed is recoverable / wrong-auto-merge is
expensive" stance — to the Phase 2 types. Floors are a revisable **gate**, not an aspiration; raise
them as the golden datasets grow.

Measured by spec [005](../../specs/005-enrichment-extraction-pipeline.md)'s `evaluate()` /
`EvaluationMetrics.perType` against two new golden sets:
`evals/payments-behaviour-golden/` (Feature 02) and `evals/payments-decision-golden/` (Feature 03).
The **auto-merge-band precision** bar (`confidence ≥ 0.8`) is the graph-integrity gate.

### Behaviour extraction (Feature 02 / 2.2)

**Behaviour entities** — `OrchestrationFlow`, `OrchestrationStep`, `Event`, `StateTransition`
(mirror the Phase 1 entity floors; behaviour structure is as recoverable as structural entities):

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.85** |
| Overall recall | **≥ 0.70** |
| Overall F1 | **≥ 0.77** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.90** |
| Per-type F1 (types with ≥ 5 golden instances) | **≥ 0.65** |

**Behavioural relationships** — `triggers`, `emits`, `consumes`, `transitionsTo`, `compensates`,
`invokes`. Recall floor is **lower than Phase 1 relationships (0.60 → 0.55)** because behavioural
edges are frequently *implicit* in prose (spec 005 §Stage 3) and harder to recall:

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.75** |
| Overall recall | **≥ 0.55** |
| Overall F1 | **≥ 0.63** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.85** |
| Per-type F1 (types with ≥ 5 golden instances) | **≥ 0.55** |

### Decision extraction (Feature 03 / 2.3) — the strictest bars in the system

**Decision entities** — recall floor is **deliberately modest** (decisions are subtle; the review
queue catches the rest), but the auto-merge-band precision is the **highest bar anywhere** because a
wrong auto-merged Decision is the costliest failure:

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.85** |
| Overall recall | **≥ 0.65** (modest — review queue catches the rest) |
| Overall F1 | **≥ 0.74** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.92** ← strictest bar in the system |

**Decision-specific relationships** — `evaluates`, `consumes`, `constrainedBy`, `triggeredBy`,
`produces`, `realizedBy`. These define a decision's traceability, so their auto-merge bar sits
**above** generic behavioural relationships:

| Metric | Floor |
|---|---|
| Overall precision | **≥ 0.75** |
| Overall recall | **≥ 0.55** |
| Overall F1 | **≥ 0.63** |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.88** |
| Per-type F1 (types with ≥ 5 golden instances) | **≥ 0.55** |

**Per-type support caveat** (as Phase 1): per-type floors apply only to types with **≥ 5** labelled
golden instances; rarer types are reported but not gated. `confidenceCalibration` is a reported
sanity signal, not a gate.

## D-P2.2 — Cardinality & conditional constraints live in the cardinality/quality layer (not JSON Schema), enforced twice

Resolves [feature 01 §11 Q1](../features/phase-2/01-behaviour-decision-schemas.md) and
[feature 05 §11](../features/phase-2/05-cross-layer-linking.md). Constraints about *edges that must
exist* (`evaluates ≥ 1`, `produces ≥ 1`, `decisionType=automated ⇒ triggeredBy`) cannot be expressed
in a single-entry JSON Schema, so they live in the **`RelationshipTypeRegistry` / quality layer**
(shipped in 2.1: `checkMinimum`, `checkAutomatedDecisionTrigger`). JSON Schema `if/then` is used only
for *intra-entry* conditionals.

**Defence in depth, one rule set.** The same rules are enforced at **two** points — the
extraction-emit gate (Features 02/03) and the load/link gate (Feature 05) — both reading the **single
shared** `RelationshipTypeRegistry`. Do not fork the rules; a constraint is defined once.

## D-P2.3 — Command is `DomainConcept` with `conceptType = "command"` (no new schema)

Resolves [feature 01 §11 Q2](../features/phase-2/01-behaviour-decision-schemas.md) and
[feature 03 §11](../features/phase-2/03-decision-extraction.md). Relationship endpoints that
reference **Command** (`produces → …/Command/…`, `triggers(Event/Command → …)`) point at
`DomainConcept` instances of `conceptType = "command"` — already in the shipped L1 `domain-concept`
enum (`aggregate, entity, value-object, domain-event, policy, invariant, command, query`). **No new
top-level Command schema.** This keeps the relationship endpoint-type set closed.

## D-P2.4 — Relationship schemas: two grouped files with an internal `kind` enum

Resolves [feature 01 §11 Q3](../features/phase-2/01-behaviour-decision-schemas.md). Ratifies what 2.1
shipped: `behavioural.schema.json` and `decision-specific.schema.json`, each a single file with a
`kind` enum and per-kind `{sourceType, targetType}` endpoint constraints — not one file per edge
kind. Keeps additive growth cheap and matches spec 001's tree.

## D-P2.5 — Invalid / unresolved edges are quarantined to the review queue, never dropped or dangling

Resolves [feature 03 §11](../features/phase-2/03-decision-extraction.md),
[feature 05 §11 Q2](../features/phase-2/05-cross-layer-linking.md), and the Feature 02 pass-ordering
question — **one shared cross-pass reference-resolution contract** across 02/03/05.

- An edge whose endpoint was not (yet) extracted — e.g. `invokes(Step → Decision)` emitted before the
  Decision pass — is **routed to the review queue and counted**, never committed as a dangling edge.
- An edge that violates a cardinality/conditional rule is **quarantined (review queue) + counted**,
  not hard-rejected. Quarantine preserves signal; hard-reject loses it — consistent with D-P1.5's
  "missed/uncertain is recoverable, wrong auto-merge is expensive" stance.

## D-P2.6 — Workflow engine: deferred — in-process orchestration this phase

The CLAUDE.md "Workflow engine (Phase 2)" deferred decision, now **explicitly decided: defer.**
Multi-pass extraction (structural → behavioural → decision → cross-reference) stays in-process behind
`ExtractionPipeline`; no durable workflow/DAG engine is adopted in Phase 2. Recorded as
[ADR-0003](../adr/0003-workflow-engine-deferred.md); revisit only when durability/retry/fan-out demand
it. Resolves [feature 02 §11](../features/phase-2/02-behaviour-extraction.md) and
[feature 05 §11](../features/phase-2/05-cross-layer-linking.md).

## D-P2.7 — Extraction prompts are versioned files, gated on the golden datasets

Resolves [feature 03 §11](../features/phase-2/03-decision-extraction.md) / spec 005 Open Q1. Each
extraction prompt is a versioned file (`prompts/extraction/<pass>/<doc-type>.v<N>.md`); a prompt
change ships a new version and is **gated on the relevant golden dataset** (decision prompts on
`evals/payments-decision-golden/` — the highest-stakes, per D-P2.1). New behaviour/decision document
types are added as **new prompt templates**, not a new extraction engine (spec 005 Decision 1).

---

## Deferred to their own feature (default = the doc's recommendation)

Locked lightly now; finalise when the feature is built so we don't over-commit two-to-three steps
ahead. The feature doc's recommendation is the working default:

- **2.4 Behaviour Flow diagram form** — default **PlantUML *activity* diagram** (decision-point
  emphasis) with a depth/breadth cap + "truncated" indicator for large/looping flows; the
  `BehaviourFlowView` output grows **additively only** until a Phase 3 GraphQL contract pins it
  ([feature 04 §11](../features/phase-2/04-behaviour-flow-view.md)).
- **2.5 L2 endpoints** — cross-layer edge *types* that target L2 (`satisfiedBy → ProjectSpec`, vendor
  edges) are **registered now but not gated on L2 data existing**; L2 schemas arrive in Phase 3
  ([feature 05 §11](../features/phase-2/05-cross-layer-linking.md)).
