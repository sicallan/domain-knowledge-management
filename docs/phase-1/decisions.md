# Phase 1 — Locked Technical Decisions

These decisions were agreed before fleshing out Phase 1 features. They are inputs to every
Phase 1 feature definition. Promote any of these to a full ADR in `docs/adr/` if they prove
contentious or far-reaching.

Phase 1 goal (from [plan.md](../../plan.md)): **one complete vertical slice** — source document
→ intermediate JSONL → loader → graph → queryable **Domain Map** view — plus OCP validation
(a second connector and a second loader).

## D-P1.1 — LLM access: Claude behind a thin gateway
- Extraction (step 1.2) calls **Claude** through a small, provider-agnostic **gateway interface**,
  not the vendor SDK directly.
- Default model **Sonnet 4.6** for extraction; **escalate low-confidence items to Opus 4.8** on re-run.
- The gateway is the only place that knows about a provider/model; swapping later touches no
  pipeline code. Keep it thin — no multi-provider routing yet.
- Model IDs: `claude-sonnet-4-6`, `claude-opus-4-8`.

## D-P1.2 — Graph store: in-memory + Neo4j adapters
- The graph persistence **port** (Phase 0b) gets two adapters in Phase 1:
  - **in-memory** adapter — unit/contract tests and fast local dev (no external service);
  - **Neo4j** adapter — the integration environment and realistic load.
- Two adapters also exercise the OCP port boundary. No graph-DB choice is hard-coded above the port.

## D-P1.3 — Language split: TypeScript slice, Python for extraction
- Connectors (1.1), graph loader (1.3), query interface (1.4), and Domain Map view (1.5) are
  **TypeScript**.
- The **LLM extraction** step (1.2) is **Python**, integrated across the JSONL/process boundary
  (extraction writes intermediate JSONL; the TS loader consumes it — no in-process coupling).
- Matches [CLAUDE.md](../../CLAUDE.md): "TypeScript for schemas/core/API, Python for ML/NLP/agent workloads."

## D-P1.4 — Scope of this exercise: flesh out, don't build
- This round produces **detailed feature definitions** (docs) + **GitHub issues** only.
- No implementation, no scaffolding. Implementation is gated on review of the fleshed-out specs.

## D-P1.5 — Extraction quality bar (Phase 1 precision/recall floor)

Resolves the one open Phase 1 risk decision: the previously-UNSET LLM extraction
precision/recall target ([plan.md](../../plan.md) Risks — "LLM extraction accuracy
insufficient" is the top project risk; feature
[02 §11](../features/phase-1/02-llm-extraction-pipeline.md) and issue #6 carried this as TBD).

These numbers are a revisable Phase 1 **floor** — the gate the golden-dataset eval
(`evals/payments-golden/`, measured by spec
[005](../../specs/005-enrichment-extraction-pipeline.md)'s `evaluate()` harness) must pass —
**not** an aspiration. They are deliberately set *below* what current-generation Claude
structured extraction (Sonnet 4.6 default, Opus 4.8 escalation — D-P1.1) typically achieves on
well-structured domain documents, so the gate is achievable at MVP yet still catches
regressions. Raise the floor in later phases as the golden dataset grows and prompts mature.

### Two-tier gating model

The system already separates *what is emitted* from *what is trusted without a human*
(spec [005](../../specs/005-enrichment-extraction-pipeline.md) confidence scoring →
spec [008](../../specs/008-quality-scoring-framework.md) threshold policies →
[plan.md](../../plan.md) "confidence thresholds gate auto-merge; human review queue"). The
quality bar respects that separation. **A missed fact is recoverable** (re-extraction, more
sources, manual addition; the entry simply isn't asserted yet) — **a wrong fact auto-merged
into the graph is the expensive failure**. So we gate hard on precision where extractions enter
the graph unattended, and accept lower recall in Phase 1, with the review queue catching the rest.

Confidence bands (extraction confidence; default emit threshold `0.5` from spec 005
`ExtractionConfig.confidenceThreshold`, aligned to spec 008's auto-publish band at `0.8`):

| Band | Confidence | Routing | Gated by |
|---|---|---|---|
| **Excluded** | `< 0.5` | Not emitted to JSONL; counted in `stats` (criterion 4) | — |
| **Review queue** | `0.5 ≤ c < 0.8` | Emitted, routed to human review; **not** auto-merged | overall recall floor |
| **Auto-merge** | `c ≥ 0.8` | Auto-merge candidate (spec 008 auto-publish band) | auto-merge precision bar |

> Until the full quality composite (spec 008) lands in a later phase, the Phase 1 eval
> approximates the auto-merge band using **extraction confidence ≥ 0.8** as a stand-in for the
> composite ≥ 0.8 auto-publish threshold. The metric definition is stable; only the upstream
> score it reads changes.

### Which metric gates what

1. **Overall precision / F1 (regression gate).** The headline eval pass/fail. Catches prompt or
   model regressions that start emitting junk.
2. **Auto-merge-band precision (graph-integrity gate, the strict one).** Precision measured over
   *only* the `c ≥ 0.8` subset — what enters the graph without a human. This is the bar that
   protects the graph, so it is set highest.
3. **Overall recall (coverage floor, intentionally lower in Phase 1).** Coverage across all
   emitted bands. Set as a floor, not a target: real-but-uncertain extractions land in the
   review queue (`0.5 ≤ c < 0.8`) rather than being lost, so low recall degrades to "more human
   review", not "wrong graph".

### Phase 1 floor — thresholds

Measured against `evals/payments-golden/`, reported **overall and per type** (spec 005
`EvaluationMetrics.perType`). Relationships are harder (they depend on correctly extracting
*both* endpoints first), so their bar is explicitly lower.

**Entity extraction**

| Metric | Floor | Notes |
|---|---|---|
| Overall precision | **≥ 0.85** | regression gate |
| Overall recall | **≥ 0.70** | coverage floor — remainder caught by review queue |
| Overall F1 | **≥ 0.77** | headline pass/fail |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.90** | graph-integrity gate — the strict bar |
| Per-type F1 (each type with ≥ 5 golden instances) | **≥ 0.65** | guards against one type collapsing |

**Relationship extraction**

| Metric | Floor | Notes |
|---|---|---|
| Overall precision | **≥ 0.75** | regression gate |
| Overall recall | **≥ 0.60** | coverage floor |
| Overall F1 | **≥ 0.67** | headline pass/fail |
| **Auto-merge-band precision** (`c ≥ 0.8`) | **≥ 0.85** | graph-integrity gate |
| Per-type F1 (each type with ≥ 5 golden instances) | **≥ 0.55** | guards against one relation type collapsing |

**Per-type support caveat.** Per-type floors apply only to types with **≥ 5** labelled golden
instances; rarer types are reported but not gated (too few samples to be statistically
meaningful) until the golden dataset grows. `confidenceCalibration` (spec 005) is reported as a
sanity signal but is **not** a Phase 1 gate.

These floors are revisable: when `evals/payments-golden/` grows or prompts/models improve,
raise them via a follow-up decision. They exist to make the top project risk *measurable and
gated* now, not to fix the ceiling.

## OCP validation targets for Phase 1
- **Second connector**: JSON ingestion adapter — added without modifying the core pipeline.
- **Second loader**: in-memory vector-store stub — added without modifying extraction or the graph loader.
