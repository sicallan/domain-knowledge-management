# Feature 03 — Decision-Specific Extraction

## 1. Feature

- **Name**: Decision extraction — identify decisions and their inputs, the rules they use, their
  outcomes and constraints, and emit decision-specific relationships.
- **Plan step**: 2.3 — *Decision-specific extraction: identify decisions, their inputs, rules used,
  outcomes, constraints* ([plan.md §Phase 2](../../../plan.md)).
- **Spec(s) expanded**:
  [specs/005-enrichment-extraction-pipeline.md](../../../specs/005-enrichment-extraction-pipeline.md)
  (extraction of "decisions, rules, behaviours … and their interconnections"; spec 005 §Stage 2
  multi-type extraction explicitly cites "a decision log entry yields a Decision + related Rules +
  ReferenceData references") and
  [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md).

## 2. Summary & scope

The phase's centrepiece. **Decisions are the highest-value nodes** — where regulation bites and
business logic concentrates ([plan.md §Decision as a First-Class Inventory Item](../../../plan.md)) —
so decision extraction gets its **own pass, its own prompts, and its own accuracy gate**, distinct
from the behaviour-structure pass (Feature 02). From decision logs, rulebooks, policy documents and
technical designs, it extracts `Decision` entities (with `inputs`, `outcomes`, `type`, `owner`,
`frequency`, `latencyBudget`) and the **decision-specific relationships** that make a decision
traceable: `evaluates → Rule`, `consumes → ReferenceData`, `constrainedBy → BusinessInvariant`,
`triggeredBy ← Event/Step`, `produces → Event/Command/StateTransition`, `realizedBy → Service`.

**In scope**
- A **decision extraction pass**: prompts that identify decision points and populate the Decision
  schema (Feature 01), emitting structured output validated against it.
- Extraction of the **six decision-specific relationships** linking a Decision to the rules it
  evaluates, data it consumes, invariants it is constrained by, what triggers it, what it produces,
  and what realises it.
- Enforcement at the gate of the Decision cardinality rules from Feature 01 (`evaluates ≥ 1`,
  `produces ≥ 1`, `automated ⇒ triggeredBy`) — extractions violating them are flagged, not merged.
- A **decision golden dataset** (`evals/payments-decision-golden/`) of **labelled samples** and
  decision-extraction accuracy reporting (spec 005 `evaluate()` / `EvaluationMetrics`).
- Multi-pass interplay: decision extraction runs as a pass that can reference behaviour entities
  (Feature 02) and L1 structural entities (Phase 1) already extracted from the same documents.

**Out of scope**
- Behaviour-structure extraction (Feature 02); the Decision Inventory / Behaviour Flow **views**
  (Feature 04 + spec 007 Decision Inventory view, later); loading + cross-layer traversal
  (Feature 05).
- Reasoning *over* decisions (impact assessment is Phase 4; contradiction detection Phase 5).
- Any change to the gateway, JSONL fixed core, or file split.

## 3. Dependencies

- **Upstream**: **Feature 01** (Decision + decision-specific relationship schemas); **Feature 02**
  (behaviour entities that decisions link to via `triggeredBy`/`invokes`/`produces`); the **Phase 1
  pipeline** (gateway, scoring, JSONL emission, eval harness); the existing **L1 Rule /
  ReferenceData / BusinessInvariant** schemas (relationship endpoints).
- **Unblocks**: the **Decision Inventory** and **Behaviour Flow** views (Feature 04 / spec 007);
  cross-layer linking (Feature 05); and — across phases — Impact Assessment (Phase 4), which derives
  "the most signal" from decision nodes.
- **Cross-feature**: shares golden-dataset tooling and `EvaluationMetrics` with Feature 02; depends
  on Feature 01's cardinality definitions for its gate.

## 4. Applied decisions

> Phase 2 decisions are locked in [`docs/phase-2/decisions.md`](../../phase-2/decisions.md). This is
> the highest-stakes feature: **D-P2.1** sets the strictest bars in the system (Decision auto-merge-band
> precision ≥ 0.92). Also binding: **D-P2.3** (Command = `DomainConcept conceptType=command`),
> **D-P2.5** (quarantine/cross-pass resolution), **D-P2.7** (prompt versioning, gated on the decision
> golden set). Carried-forward Phase 1 decisions and accepted ADRs also bind; §11 holds residual risks.

| Decision | How it constrains this feature |
|---|---|
| **D-P1.1 — Claude behind a thin gateway** | Same `LLMGateway`; decisions from nuanced prose are the canonical case for **escalating low-confidence items to `claude-opus-4-8`** (spec 005 Decision 4 "complex extraction benefits from the most capable model"). |
| **D-P1.3 — language split** | **Python**, integrated across the JSONL/file boundary only. |
| **D-P1.4 — flesh out, don't build** | Definition only this round. |
| **spec 005 Decision 1 — prompt-based structured output** | Decision extraction via dedicated prompt templates, not a bespoke engine. |
| **spec 005 Decision 4 — tiered models** | Decisions are the "complex prose" tier — gateway routes the harder extraction to the most capable model. |
| **ADR-0001** | Typed JSONL output only. |

## 5. User stories

- *As a compliance officer, I want every automated decision captured as a first-class node with the
  rules it evaluates, the data it consumes and the invariants that constrain it, so that I can verify
  regulatory alignment and trace each decision to its evidence.*
- *As a domain architect, I want decisions extracted with their inputs, outcomes and owning context,
  so that the points where logic concentrates are explicit and assessable.*
- *As a quality owner, I want decision extraction gated on accuracy against labelled samples — and on
  the structural cardinality rules — so that incomplete or wrong decisions don't auto-merge into the
  graph (the expensive failure).*
- *As a change manager, I want decisions linked to what triggers them and what they produce, so that
  later impact assessment can follow those edges.*

## 6. Acceptance criteria (Given/When/Then)

1. **Decision entities emitted & valid** — *Given* a decision-log/rulebook fixture, *when* the
   decision pass runs, *then* `Decision` entries appear in `{runId}-extractions.jsonl` populating
   `name`/`type`/`inputs`/`outcomes`/`owner` etc., each validating against the Feature 01 Decision
   schema with provenance + confidence.
2. **Decision-specific edges** — *Given* a decision that evaluates two rules and consults reference
   data, *when* extracted, *then* `evaluates`/`consumes`/`constrainedBy`/`triggeredBy`/`produces`/
   `realizedBy` edges are emitted to `{runId}-relationships.jsonl`, endpoints referencing extant ids,
   validating against the Feature 01 decision-specific relationship schema.
3. **Cardinality gate — `evaluates ≥ 1`** — *Given* an extracted Decision with no `evaluates` edge to
   a Rule **or** BusinessInvariant, *when* the gate runs, *then* it is flagged (routed to review, not
   auto-merged) and counted in `stats`.
4. **Cardinality gate — `produces ≥ 1`** — *Given* an extracted Decision with no `produces` edge,
   *when* the gate runs, *then* flagged + counted.
5. **Conditional trigger** — *Given* an extracted `type="automated"` Decision with no `triggeredBy`
   edge, *when* the gate runs, *then* flagged for review (the structural-completeness rule from
   Feature 01, enforced here at extraction time).
6. **Tiered escalation** — *Given* a low-confidence decision extracted from nuanced prose, *when*
   re-run with escalation, *then* it is re-extracted via `claude-opus-4-8` and `metadata.model`
   reflects it (D-P1.1 / spec 005 Decision 4).
7. **Multi-type from one chunk** — *Given* a decision-log entry mentioning a Decision + its Rules +
   ReferenceData, *when* extracted, *then* all are emitted with the connecting edges (spec 005 §Stage
   2 multi-type extraction), Rules/ReferenceData resolved to existing entities where present
   (name+type resolution).
8. **Decision golden-dataset eval** — *Given* `evals/payments-decision-golden/` labelled samples,
   *when* `evaluate()` runs, *then* it reports decision-extraction precision/recall/F1 (overall and
   for the decision-specific relationship types), meeting the Phase 2 decision floor (TBD — §11).
   The **auto-merge-band precision** (`confidence ≥ 0.8`) bar is set highest, per the D-P1.5 two-tier
   model, because a wrong auto-merged Decision is the most expensive failure in the system.

## 7. Interface contracts

Reuse spec 005 verbatim — no signature changes. Decision extraction is a pass over the same
documents, configured via `ExtractionConfig.targetTypes` including `Decision`:

```python
# new versioned prompt templates: prompts/extraction/decision/<doc-type>.md
DECISION_TYPE = "Decision"
DECISION_EDGES = ["evaluates", "consumes", "constrainedBy", "triggeredBy", "produces", "realizedBy"]
# the cardinality gate consumes the Feature 01 cardinality/quality rules; violations -> review queue
```

`EvaluationMetrics.perType` (spec 005) reports the `Decision` type and each decision-specific
relationship type. The Decision entity/edge shapes are owned by **Feature 01** — this feature only
*populates* them.

## 8. TDD test plan (write these first)

- **Unit — `test_decision_prompts.py`**: decision-log / rulebook / policy templates produce
  schema-valid `Decision` structured output for canned chunks (fake gateway).
- **Unit — `test_decision_edges.py`**: the six decision-specific edges emitted with valid endpoints;
  Rule/ReferenceData/BusinessInvariant endpoints resolved to existing ids.
- **Unit — `test_decision_cardinality_gate.py`**: `evaluates ≥ 1`, `produces ≥ 1`, `automated ⇒
  triggeredBy` violations are flagged/routed-to-review and counted (criteria 3–5).
- **Unit — `test_decision_escalation.py`**: low-confidence decision re-extracted via Opus on re-run;
  `metadata.model` reflects the escalation.
- **Golden-dataset — `test_decision_eval.py`**: run against `evals/payments-decision-golden/`; assert
  decision precision/recall/F1 ≥ the agreed Phase 2 decision floor, with the strict auto-merge-band
  precision bar on `confidence ≥ 0.8`.
- **Integration — `test_decision_end_to_end.py`**: decision-doc fixtures → both JSONL files →
  validate every line + every edge against the Schema Module (Feature 01).

## 9. Task breakdown

1. [ ] Add `Decision` to `ExtractionConfig.targetTypes`/`InventoryType` (additive).
2. [ ] Author versioned decision-extraction prompt templates per document type (decision log,
   rulebook, policy, technical design).
3. [ ] Implement the decision extraction pass (entities + the six edges) within multi-pass orchestration.
4. [ ] Wire the Feature 01 cardinality/conditional rules into the extraction gate (review-queue routing).
5. [ ] Confirm tiered escalation routes nuanced decisions to the most capable model.
6. [ ] Build `evals/payments-decision-golden/` labelled samples (decisions + decision-specific edges).
7. [ ] Extend `evaluate()` reporting to `Decision` + decision-specific relationship types; set the
   strict auto-merge-band precision assertion.
8. [ ] End-to-end integration test through to validated JSONL + edges.

## 10. OCP extension points

- **Open**: new decision-source document types via new prompt templates; new decision-specific
  relationship kinds via new Feature 01 schemas; tiered-model routing tuned in the gateway — no
  pipeline-core change.
- **Closed**: `ExtractionPipeline`/`LLMGateway` signatures; the Decision schema + cardinality rules
  (owned by Feature 01); the JSONL fixed core and file split. The decision pass must not edit the
  behaviour pass (Feature 02) or the Phase 1 structural pass.

## 11. Open questions / risks

- **Phase 2 decision extraction accuracy floor is UNSET — and is the most safety-critical of the
  phase.** *Recommendation:* set the **auto-merge-band precision** bar at least as high as Phase 1's
  strictest (≥ 0.90 for entities) given decisions are the costliest node to get wrong, with a
  deliberately modest recall floor (decisions are subtle; the review queue catches the rest — D-P1.5
  two-tier model). **Lock in `docs/phase-2/decisions.md` before Feature 03's eval is meaningful.**
- **Decision vs Rule boundary.** A Decision *uses* rules but is not a rule
  ([plan.md](../../../plan.md)). Extraction must not collapse the two. *Risk:* prose conflates "the
  rule that decides X" with "the decision X". Encode the distinction explicitly in prompts + golden
  labels; add adversarial fixtures.
- **`Command` endpoint** (`produces → …/Command/…`) depends on Feature 01's resolution of how Command
  is modelled (recommended: `DomainConcept type=command`). Confirm before wiring `produces`.
- **Cross-pass reference resolution.** Decision edges target behaviour entities (Feature 02) and L1
  entities (Phase 1). When a referenced endpoint wasn't extracted, route to the review queue rather
  than emitting a dangling edge; the resolution contract is shared with Feature 05.
- **Prompt versioning (spec 005 Open Q1).** Decision prompts are the highest-stakes — adopt
  "prompts as versioned files + golden regression per version" and gate prompt changes on the
  decision golden dataset.
