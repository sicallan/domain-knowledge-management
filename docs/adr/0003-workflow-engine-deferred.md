# ADR-0003 — Workflow engine (deferred — in-process orchestration for Phase 2)

- **Status**: Proposed (deferred — Last Responsible Moment)
- **Date**: 2026-06-20
- **Deciders**: Platform architecture
- **Related**: [plan.md §Tech Stack](../../plan.md), [Phase 2 decisions D-P2.6](../phase-2/decisions.md), [Feature 02 — Behaviour extraction](../features/phase-2/02-behaviour-extraction.md), [Feature 05 — Cross-layer linking](../features/phase-2/05-cross-layer-linking.md), [specs/005 — Enrichment/Extraction Pipeline](../../specs/005-enrichment-extraction-pipeline.md), CLAUDE.md *Deferred decisions* (Workflow engine — Phase 2)

## Context

CLAUDE.md lists the **workflow engine** as a Phase 2 deferred decision, to be captured as an ADR at
the Last Responsible Moment. Phase 2 introduces **multi-pass extraction** — structural (Phase 1) →
behavioural (Feature 02) → decision (Feature 03) → cross-reference/resolution (Feature 05) — which is
the candidate complexity driver named in [plan.md §Tech Stack](../../plan.md): the point at which a
durable workflow/DAG engine (Temporal, Airflow, Prefect, a queue + state machine, …) might earn its
place for durability, retry, and fan-out.

The question is whether Phase 2 should adopt such an engine now or keep orchestration in-process.

## Decision

**Do not adopt a workflow engine in Phase 2.** Keep multi-pass extraction **in-process behind
`ExtractionPipeline`**, orchestrated synchronously. Passes run in sequence; cross-pass references
that cannot be resolved yet are routed to the review queue (Phase 2 decisions **D-P2.5**), not held
in durable workflow state.

A real engine slots in later **behind the same `ExtractionPipeline` surface** — callers (and the
typed JSONL output contract, [ADR-0001](./0001-intermediate-jsonl-vs-okf-interchange.md)) do not
change when orchestration moves out-of-process.

## Rationale — why not yet

- **No durability requirement is real yet.** Phase 2 runs are batch, deterministic-where-possible,
  and re-runnable from source documents + intermediate JSONL. A crashed run is re-run, not resumed;
  idempotency keys (already used by the loaders) make replay safe.
- **In-process keeps CI green with no services** (CLAUDE.md Conventions) — adding a workflow engine
  means a broker/state store on the required path, which we have deliberately avoided.
- **Reversible at low cost.** The `ExtractionPipeline` boundary is the seam; adopting an engine is an
  additive change behind it, not a rewrite.
- **LRM.** The trade-offs (which engine, hosting, delivery semantics) only become concrete under real
  durability/retry/fan-out pressure — premature choice would hard-code an unneeded dependency.

## Consequences

- **Now**: passes are sequential and in-process; no broker, no external orchestrator, no secrets on
  the CI path. Failure handling is re-run-from-source + review-queue routing for unresolved edges.
- **Later — the trigger to revisit**: adopt a workflow engine (via a new superseding ADR) when one of
  these becomes true — long-running/asynchronous extraction that must survive process restarts;
  per-pass retry/backoff with durable state; DAG fan-out across many documents needing scheduling and
  back-pressure; or human-in-the-loop steps that must persist across sessions.
- **Not decided here**: the engine product, hosting, and delivery semantics — deferred until the
  trigger above makes them concrete.
