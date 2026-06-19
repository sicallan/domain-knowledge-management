# Feature 02 — Behaviour Extraction (Enrichment Extension)

## 1. Feature

- **Name**: Enrichment-pipeline extension that extracts behaviour elements (orchestration flows,
  steps, events, state transitions) and the behavioural relationships between them from process
  documentation.
- **Plan step**: 2.2 — *Enrichment extension: extract behaviour elements and decisions from process
  documentation* ([plan.md §Phase 2](../../../plan.md)). (The **decision-specific** half of 2.2 is
  carved out into Feature 03; this feature owns the behaviour-structure half.)
- **Spec(s) expanded**:
  [specs/005-enrichment-extraction-pipeline.md](../../../specs/005-enrichment-extraction-pipeline.md)
  (multi-pass extraction: structural → **behavioural** → cross-reference; spec 005 is explicitly a
  Phase 1–2 spec) and
  [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md)
  (the JSONL fixed core this pass must emit).

## 2. Summary & scope

Phase 1's extraction pass produced **structural L1** entities. This feature adds the **behavioural
pass** (spec 005 §"Multi-pass extraction (structural → behavioural → cross-reference)") to the
existing pipeline: from process documentation (runbooks, flow specs, sequence diagrams, technical
designs) it extracts `OrchestrationFlow`/`OrchestrationStep`/`Event`/`StateTransition` entities and
the behavioural edges (`triggers`, `emits`, `consumes`, `transitionsTo`, `compensates`, `invokes`).
It is an **extension, not a rewrite** — new prompt templates + new target types behind the *same*
`ExtractionPipeline`/`LLMGateway` contracts (the spec 005 / D-P1.1 OCP seam).

**In scope**
- A **behavioural extraction pass**: prompt templates per process-document type that emit
  `OrchestrationFlow`/`Step`/`Event`/`StateTransition` as structured output validated against the
  Feature 01 schemas.
- Behavioural relationship extraction (`triggers`/`emits`/`consumes`/`transitionsTo`/`compensates`/
  `invokes`), including **sequencing** (`OrchestrationStep.sequence`) and step→flow membership.
- Emission to the existing `{runId}-extractions.jsonl` / `{runId}-relationships.jsonl` split, with
  provenance and confidence per the Phase 1 contract.
- A **golden dataset for behaviour extraction** (`evals/payments-behaviour-golden/`) and the
  `evaluate()` harness reporting precision/recall/F1 per behaviour type and per relationship type.
- Reuse of Phase 1 entity resolution (name+type) for de-duplicating flows/events across documents.

**Out of scope**
- **Decision** extraction and decision-specific relationships — Feature 03 (the cognitively harder,
  separately-gated half).
- Loading these entities/edges into the graph — that is the existing loader (Feature 03 of Phase 1),
  unchanged; cross-layer persistence semantics are exercised in Feature 05.
- The Behaviour Flow **view** — Feature 04.
- Any change to the gateway, the JSONL fixed core, or the entity/relationship file split.

## 3. Dependencies

- **Upstream**: **Feature 01** (behaviour schemas are the structured-output targets + validation
  gate); the **Phase 1 extraction pipeline** (gateway, chunking, confidence scoring, JSONL emission,
  eval harness — all reused); **spec 003** JSONL contract.
- **Unblocks**: Feature 03 (decision extraction runs as a further pass over the same documents and
  links *into* these behaviour entities via `invokes`/`triggeredBy`/`produces`); Feature 04 (view
  needs populated behaviour entities); Feature 05 (cross-layer edges).
- **Cross-feature**: shares the golden-dataset tooling and `EvaluationMetrics` shape with Feature 03.

## 4. Applied decisions

> No `docs/phase-2/decisions.md` is locked yet (noted, not fabricated). Carried-forward Phase 1
> decisions and accepted ADRs bind; new questions are in §11.

| Decision | How it constrains this feature |
|---|---|
| **D-P1.1 — Claude behind a thin gateway** | Behavioural extraction calls the *same* `LLMGateway`; default `claude-sonnet-4-6`, escalate low-confidence items to `claude-opus-4-8` on re-run. No new provider code. |
| **D-P1.3 — language split** | This is **Python**, integrated with the TS loader only across the JSONL/file boundary. |
| **D-P1.4 — flesh out, don't build** | Definition only this round. |
| **spec 005 Decision 1 — prompt-based structured output** | New behaviour types are added via **new prompt templates**, not a new extraction engine. |
| **spec 005 Decision 3 — section-based chunking** | Reused unchanged; process docs are well-sectioned (steps/phases). |
| **ADR-0001** | Output is **typed JSONL**, never OKF. |

## 5. User stories

- *As a knowledge engineer, I want process documentation turned into typed flows, steps, events and
  state transitions automatically, so that runtime behaviour becomes navigable graph structure
  instead of prose.*
- *As a developer, I want the end-to-end orchestration (and where my service emits/consumes events)
  extracted with provenance, so that I can see where my service fits without reading every runbook.*
- *As a quality owner, I want behaviour extraction benchmarked against a labelled golden dataset, so
  that this new pass is gated on measured precision/recall just like Phase 1 structural extraction.*
- *As a platform maintainer, I want this added as a new pass behind the existing pipeline contracts,
  so that extending to a new extraction domain proves the OCP seam rather than forking the pipeline.*

## 6. Acceptance criteria (Given/When/Then)

1. **Behaviour entities emitted & valid** — *Given* a process-doc fixture describing a flow with
   ordered steps, *when* the behavioural pass runs, *then* `OrchestrationFlow`/`Step`/`Event`/
   `StateTransition` entries appear in `{runId}-extractions.jsonl`, each validating against its
   Feature 01 schema, each carrying `source` provenance and `confidence`.
2. **Step sequencing preserved** — *Given* a numbered/ordered process, *when* extracted, *then* each
   `OrchestrationStep.sequence` reflects document order and steps link to their owning
   `OrchestrationFlow`.
3. **Behavioural edges** — *Given* a doc where an event triggers a flow and a step emits an event,
   *when* extracted, *then* `triggers`/`emits`/`consumes`/`transitionsTo`/`compensates`/`invokes`
   edges are emitted to `{runId}-relationships.jsonl`, endpoints referencing ids present in the
   extractions file, validating against the Feature 01 behavioural relationship schema.
4. **Gateway isolation** — *Given* a fake `LLMGateway`, *when* the pass runs, *then* it produces
   deterministic JSONL with **no** network call (the seam is unchanged from Phase 1).
5. **Confidence threshold & validation gate** — *Given* `confidenceThreshold: 0.5`, *when* a
   behaviour entity scores below it or fails schema validation, *then* it is excluded and counted in
   `stats` (`validationFailures`/excluded) — not silently dropped.
6. **No regression on structural pass** — *Given* the Phase 1 structural golden dataset, *when* the
   pipeline runs with the new pass enabled, *then* Phase 1 entity/relationship metrics still meet
   the [D-P1.5](../../phase-1/decisions.md) floors (the behavioural pass is additive).
7. **Behaviour golden-dataset eval** — *Given* `evals/payments-behaviour-golden/`, *when*
   `evaluate()` runs, *then* it reports precision/recall/F1 overall and **per behaviour type** and
   **per behavioural relationship type**, meeting the Phase 2 behaviour floor (TBD — see §11; default
   to the Phase 1 entity/relationship floors as a starting bar until ratified).
8. **`invokes` boundary to Decisions** — *Given* a step that invokes a decision, *when* this pass
   runs **before** Feature 03, *then* the `invokes` edge target may be a *dangling/placeholder*
   decision reference resolved when Feature 03's decision pass runs (criterion documents the
   ordering contract; resolution is Feature 05's concern).

## 7. Interface contracts

Reuse spec 005 verbatim — **no signature changes**. The behavioural pass is configured through the
existing `ExtractionConfig.targetTypes` (now includes the four behaviour types) and is realised as
additional prompt templates + a pass in the existing multi-pass orchestration:

```typescript
// spec 005 — unchanged
interface ExtractionPipeline {
  run(documents: CanonicalDocument[], config: ExtractionConfig): Promise<ExtractionRunResult>;
  extractSingle(document: CanonicalDocument, config: ExtractionConfig): Promise<ExtractionResult>;
  evaluate(goldenDataset: GoldenDataset): Promise<EvaluationMetrics>;
}
interface ExtractionConfig { targetTypes: InventoryType[]; confidenceThreshold: number; /* … */ }
```

```python
# Python realisation — new prompt templates registered for behaviour types; pipeline core untouched
BEHAVIOUR_TYPES = ["OrchestrationFlow", "OrchestrationStep", "Event", "StateTransition"]
# templates stored as versioned files: prompts/extraction/behaviour/<doc-type>.md  (spec 005 Open Q1)
```

`EvaluationMetrics.perType` (spec 005) carries the per-behaviour-type breakdown.

## 8. TDD test plan (write these first)

- **Unit — `test_behaviour_prompts.py`**: each process-doc-type template produces structured output
  matching the Feature 01 schemas for canned chunks (fake gateway).
- **Unit — `test_step_sequencing.py`**: ordered steps → correct `sequence` + flow membership;
  out-of-order / unnumbered fallbacks.
- **Unit — `test_behaviour_edges.py`**: `triggers`/`emits`/`consumes`/`transitionsTo`/`compensates`/
  `invokes` emitted with valid endpoints; bad endpoints excluded + counted.
- **Contract — `test_extraction_pass_isolation.py`**: enabling the behaviour pass does not alter the
  `ExtractionPipeline`/`LLMGateway` signatures; fake gateway → deterministic output.
- **Golden-dataset — `test_behaviour_eval.py`**: run against `evals/payments-behaviour-golden/`;
  assert per-type precision/recall/F1 ≥ the agreed Phase 2 behaviour floor; assert **no regression**
  on the Phase 1 structural golden dataset.
- **Integration — `test_behaviour_end_to_end.py`**: process-doc fixtures → both JSONL files →
  validate every line against the Schema Module (Feature 01 schemas).

## 9. Task breakdown

1. [ ] Add the four behaviour types to `ExtractionConfig.targetTypes`/`InventoryType` enum (additive).
2. [ ] Author versioned prompt templates per process-document type for the behavioural pass.
3. [ ] Implement the behavioural extraction pass within the existing multi-pass orchestration.
4. [ ] Implement behavioural relationship extraction + step sequencing/membership.
5. [ ] Reuse confidence scoring + schema-validation gate against Feature 01 schemas.
6. [ ] Build `evals/payments-behaviour-golden/` labelled dataset (flows/steps/events/transitions +
   behavioural edges).
7. [ ] Extend `evaluate()` reporting to the behaviour types; add the regression assertion on the
   Phase 1 structural golden set.
8. [ ] End-to-end integration test through to validated JSONL.

## 10. OCP extension points

- **Open**: new process-document types via new prompt templates; further behaviour sub-types via new
  Feature 01 schemas + templates; new entity-resolution tiers — all without touching pipeline core.
- **Closed**: `ExtractionPipeline`/`LLMGateway` signatures; the JSONL fixed core and entity/
  relationship file split (spec 003); the gateway as the only provider-aware code. Adding the
  behaviour pass must not edit Phase 1's structural pass.

## 11. Open questions / risks

- **Phase 2 behaviour extraction accuracy floor is UNSET.** Mirrors the Phase 1 risk that D-P1.5
  resolved for structural extraction. *Recommendation:* ratify a Phase 2 floor (start from the
  Phase 1 entity/relationship floors — entities P≥0.85/R≥0.70/F1≥0.77, relationships
  P≥0.75/R≥0.60/F1≥0.67 — adjusting once `evals/payments-behaviour-golden/` exists, since *implicit*
  behavioural edges are harder to recall than structural ones). **Lock this in `docs/phase-2/
  decisions.md` before the eval tests are meaningful.**
- **Workflow engine (deferred decision, due Phase 2).** Multi-pass extraction (structural →
  behavioural → cross-reference, now with a decision pass) is the candidate complexity driver named
  in [plan.md §Tech Stack](../../../plan.md). *Recommendation:* **not yet** — keep in-process
  orchestration behind `ExtractionPipeline`; raise an ADR only when durability/retry/DAG-fan-out
  demands it. Flag for an explicit decision this phase.
- **Implicit-relationship recall.** Spec 005 §Stage 3 notes some edges are inferred from
  co-occurrence/structure. Behavioural edges are often implicit in prose — track recall carefully and
  route uncertain edges to the review queue (D-P1.5 two-tier model) rather than auto-merging.
- **Pass ordering vs Decision references.** `invokes(Step → Decision)` may be extracted before the
  Decision exists (Feature 03). Confirm the placeholder/resolution contract with Feature 05.
