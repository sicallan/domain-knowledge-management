# Phase 2 — Feature Definitions

**Goal**: populate the **behaviour inventories** and make **Decision** a first-class concept — the
highest-value nodes in the model, *"where regulation bites and business logic concentrates"*
([plan.md §Decision as a First-Class Inventory Item](../../../plan.md)). The vertical slice now
extends from structural L1 facts into runtime **behaviour** (flows, steps, events, state transitions)
and **decisions**, with cross-layer links that make those decisions traceable from regulation down to
the services that realise them.

Source of truth: [plan.md §Phase 2](../../../plan.md), the Phase 2 specs in [specs/](../../../specs/),
the carried-forward [Phase 1 decisions](../../phase-1/decisions.md), and the accepted
[ADRs](../../adr/). These docs **expand** those specs into buildable feature definitions; they do not
restate or contradict them.

## Feature index

| # | Feature | Plan step | Spec(s) | Lang | One-line summary |
|---|---------|-----------|---------|------|------------------|
| [01](01-behaviour-decision-schemas.md) | Behaviour & Decision inventory schemas | 2.1 | [001](../../../specs/001-schema-module.md) | TS/JSON Schema | L3 behaviour schemas (`OrchestrationFlow`/`Step`/`Event`/`StateTransition`) + L1 `Decision` + behavioural/decision-specific **relationship** schemas with cardinality. The gate for the rest of the phase. |
| [02](02-behaviour-extraction.md) | Behaviour extraction (enrichment extension) | 2.2 | [005](../../../specs/005-enrichment-extraction-pipeline.md), [003](../../../specs/003-intermediate-jsonl-and-loaders.md) | Py | New extraction **pass**: process docs → behaviour entities + behavioural edges → JSONL; behaviour golden dataset. |
| [03](03-decision-extraction.md) | Decision-specific extraction | 2.3 | [005](../../../specs/005-enrichment-extraction-pipeline.md), [003](../../../specs/003-intermediate-jsonl-and-loaders.md) | Py | Decisions + their inputs/rules/outcomes/constraints + the six decision-specific edges; own accuracy gate (the costliest node to get wrong). |
| [04](04-behaviour-flow-view.md) | Behaviour Flow view | 2.4 | [007](../../../specs/007-view-projection-engine.md) | TS | Second view projector: orchestration flow with **decision points highlighted**; PlantUML render (the phase's visible payoff). |
| [05](05-cross-layer-linking.md) | Cross-layer linking | 2.5 | [006](../../../specs/006-query-interface.md), [002](../../../specs/002-graph-persistence-port.md) | TS | Persist + traverse Decision↔L1/L2/L3 edges, bidirectionally; cardinality enforced at link time. |

## Build order

`01` (schemas — gate) → `02` (behaviour extraction) → `03` (decision extraction) → `04` (Behaviour
Flow view + PlantUML demo) → `05` (cross-layer linking). 04 and 05 can overlap once 01–03 land; 04's
*cross-layer* decision highlighting depends on 05, but the core flow view does not.

## Slice flow

```
                                  ┌─► [02 behaviour extraction] ─┐
process docs ─► (Phase 1 pipeline)┤                              ├─► JSONL ─► [05 cross-layer load+traverse] ─► graph
                                  └─► [03 decision extraction] ──┘                                              │
                                                                                                                ▼
[01 schemas] ── define ──► (behaviour + Decision types, behavioural/decision edges, cardinality)    [04 Behaviour Flow view ─► PlantUML]
```

## Layer note (don't flatten step 2.1)

Plan step 2.1 lists five "behaviour" schemas together, but per [spec 001](../../../specs/001-schema-module.md)
they span two layers: **`OrchestrationFlow`/`OrchestrationStep`/`Event`/`StateTransition` are L3**
(runtime behaviour) and **`Decision` is L1** (canonical, vendor/tech-agnostic). Feature 01 keeps the
directory placement the spec prescribes.

## Decisions applied across all features (carried forward)

No phase-specific decisions file exists yet (see below). These Phase 1 decisions and ADRs bind in
Phase 2:

- **D-P1.1** — LLM access is **Claude behind a thin gateway** (default `claude-sonnet-4-6`, escalate
  low-confidence re-runs to `claude-opus-4-8`). Applies to 02, 03 (decisions are the canonical
  escalation case).
- **D-P1.2** — Graph store has **in-memory + Neo4j adapters** behind the 0b port. Applies to 04, 05
  (adapter-parity contract).
- **D-P1.3** — **TypeScript** for schemas/views/query/loader; **Python** for extraction; integrated
  only across the JSONL/file boundary. Applies to all.
- **D-P1.4** — This round is **flesh-out only**: feature docs + issues, no code.
- **ADR-0001** — Internal intermediate format is **typed JSONL**, never OKF.

## Decisions to LOCK before build (no `docs/phase-2/decisions.md` exists yet)

This flesh-out **notes the absence** of a locked Phase 2 decisions file rather than fabricating one.
Three genuinely new decisions should be ratified (ideally as `docs/phase-2/decisions.md` and/or ADRs)
**before** the gated tests are meaningful:

1. **Behaviour extraction accuracy floor** (Feature 02 §11) — mirrors D-P1.5 for behaviour types;
   start from the Phase 1 floors, adjust for harder implicit edges.
2. **Decision extraction accuracy floor** (Feature 03 §11) — the most safety-critical; set the
   **auto-merge-band precision** bar highest because a wrong auto-merged Decision is the costliest
   failure. Modest recall floor + review queue (D-P1.5 two-tier model).
3. **Workflow engine** (deferred decision, due Phase 2 — [plan.md §Tech Stack](../../../plan.md)).
   Multi-pass extraction (structural → behavioural → decision → cross-reference) is the named
   complexity driver. *Recommendation across features:* **not yet** — keep in-process orchestration
   behind `ExtractionPipeline`; raise an ADR only when durability/retry/DAG fan-out demands it.

## Cross-cutting open questions for the team

- **Conditional/cardinality enforcement location** — defined in Feature 01, enforced at extraction
  (03) *and* load (05). Keep one shared rule set to avoid drift.
- **`Command` modelling** — `produces`/`triggers` reference `Command`, which has no schema; recommend
  modelling as `DomainConcept type=command` (already in the L1 enum). Confirm in Feature 01.
- **Reject vs quarantine** for structurally-invalid extractions/edges — recommend quarantine + count
  (consistent with D-P1.5: missed/uncertain is recoverable; wrong auto-merge is expensive).
- **L2 endpoints absent until Phase 3** — register `satisfiedBy → ProjectSpec` / vendor edge *types*
  now (forward-compatible) without gating on L2 instances existing.
