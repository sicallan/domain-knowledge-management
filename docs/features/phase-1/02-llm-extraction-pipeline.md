# Feature 02 — LLM Extraction Pipeline → Intermediate JSONL

## 1. Feature

- **Name**: LLM Extraction Pipeline (with provider-agnostic LLM gateway) producing intermediate JSONL
- **Plan step**: 1.2 — *Enrichment module: LLM-based extraction producing intermediate JSONL output
  conforming to the fixed-core schema*
- **Spec(s) expanded**:
  [specs/005-enrichment-extraction-pipeline.md](../../../specs/005-enrichment-extraction-pipeline.md)
  (pipeline stages, LLM gateway, golden-dataset evals) and
  [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md)
  (the JSONL fixed-core schema + entity/relationship file split that this pipeline must emit).

## 2. Summary & scope

The cognitive core of the slice: take `CanonicalDocument[]` from Feature 01 and emit
schema-valid **intermediate JSONL** — `{runId}-extractions.jsonl` (entities) and
`{runId}-relationships.jsonl` (relationships) — plus a run `{runId}-metadata.json`. All LLM access
goes through a **thin provider-agnostic gateway** ([D-P1.1](../../phase-1/decisions.md)). This is the
single Python component in the slice ([D-P1.3](../../phase-1/decisions.md)); it hands off to the TS
loader purely via files (no in-process coupling).

**In scope**
- Pipeline orchestration: pre-process → entity extract → relationship extract → entity resolution →
  confidence scoring → schema validation → JSONL emission (spec 005 §Pipeline Stages).
- **LLM gateway** (`LLMGateway`): the only place that knows about Claude. Default **Sonnet 4.6**;
  **escalate low-confidence items to Opus 4.8** on re-run (D-P1.1). Model IDs `claude-sonnet-4-6`,
  `claude-opus-4-8`.
- Section-based-with-size-limit chunking (spec 005 Decision 3).
- Prompt-based structured extraction for the L1 types available in Phase 0a (Decision 1).
- Confidence scoring + schema validation gate; invalid/below-threshold entries excluded.
- **Golden-dataset eval harness**: precision/recall/F1 vs a labelled Payments fixture.
- Streaming, immutable JSONL emission with the fixed core fields (spec 003 §Fixed Core).

**Out of scope**
- Document fetching (Feature 01); JSONL loading (Feature 03).
- Behaviour/Decision extraction — Phase 2 (spec 005 is 1–2; Phase 1 extracts the L1 structural types).
- Full hybrid entity-resolution cascade — Phase 1 ships **name+type matching** only; embedding/LLM
  tiers deferred (see Open Questions).
- Multi-provider routing — gateway stays thin, Claude-only (D-P1.1).
- Tiered model *routing* logic — Phase 1 uses Sonnet default + Opus escalate-on-rerun, not per-chunk routing.

## 3. Dependencies

- **Upstream**: Feature 01 (`CanonicalDocument[]`); **Phase 0a Schema Module** (JSON Schema for
  structured-output targets + validation); **spec 003** JSONL fixed-core contract; the **vector DB
  ADR** is due this phase but extraction only needs embeddings if entity-resolution embedding tier is
  enabled (deferred), so it is **not** a Phase 1 blocker here.
- **Unblocks**: Feature 03 (consumes the JSONL), the Quality framework (consumes eval metrics).
- **Cross-feature**: shares the `confidence` field semantics with Feature 03's quality gate.

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **D-P1.1 — Claude behind a thin gateway** | All inference via `LLMGateway`; no Anthropic SDK calls in pipeline code. Default `claude-sonnet-4-6`; re-run escalation to `claude-opus-4-8` for low-confidence items. No multi-provider routing. |
| **D-P1.3 — language split** | This component is **Python**; integrates with the TS loader only across the JSONL/file boundary. |
| **D-P1.4 — flesh out, don't build** | Definition only this round. |
| **ADR-0001** | Output is **typed JSONL**, never OKF. OKF stays at the edges. |

## 5. User stories

- *As a knowledge engineer, I want documents turned into typed, evidenced inventory entries
  automatically, so that the graph populates without manual modelling.*
- *As an ML engineer, I want all model calls behind one gateway, so that swapping/escalating models
  touches no pipeline code.*
- *As a quality owner, I want every extraction scored and benchmarked against a golden dataset, so
  that I can gate auto-merge on measured precision/recall.*
- *As an auditor, I want every emitted entry to carry source provenance and a confidence score, so
  that each assertion is traceable and rankable.*

## 6. Acceptance criteria (Given/When/Then)

1. **JSONL conformance** — *Given* a fixture document, *when* a run completes, *then* every line in
   `{runId}-extractions.jsonl` has all fixed-core fields (`id`,`type`,`version`,`source`,`confidence`,
   `extractedAt`,`data`) and validates against its type schema (spec 003).
2. **Entity/relationship split** — *Given* a doc yielding related entities, *when* the run completes,
   *then* relationships are emitted to `{runId}-relationships.jsonl` as `type:"Relationship"` entries
   whose `sourceEntityId`/`targetEntityId` reference ids present in the extractions file (spec 003 Decision 2).
3. **Gateway isolation** — *Given* a fake/stub `LLMGateway`, *when* the pipeline runs, *then* it
   produces deterministic JSONL with **no** real network call — proving the gateway is the only seam.
4. **Confidence threshold** — *Given* `confidenceThreshold: 0.5`, *when* an entity scores 0.4, *then*
   it is excluded from JSONL and counted in `stats` (not silently dropped).
5. **Schema-invalid exclusion** — *Given* the LLM returns a malformed payload, *when* validation runs,
   *then* the entry is excluded, logged, and `stats.validationFailures` increments.
6. **Golden-dataset eval** — *Given* the Payments golden dataset, *when* `evaluate()` runs, *then* it
   reports precision/recall/F1 overall and per-type, and the pipeline meets the Phase 1 floor set in
   [D-P1.5](../../phase-1/decisions.md): **entities** overall precision ≥ 0.85 / recall ≥ 0.70 / F1 ≥
   0.77 with auto-merge-band (`confidence ≥ 0.8`) precision ≥ 0.90; **relationships** overall precision
   ≥ 0.75 / recall ≥ 0.60 / F1 ≥ 0.67 with auto-merge-band precision ≥ 0.85; per-type F1 ≥ 0.65
   (entities) / ≥ 0.55 (relationships) for any type with ≥ 5 golden instances. These are a revisable
   *floor* (the gate), not an aspiration. The auto-merge-band precision bar is the strict graph-integrity
   gate; overall recall is an intentionally lower coverage floor because real-but-uncertain extractions
   route to the human review queue rather than being lost (D-P1.5 two-tier gating).
7. **Provenance** — *Given* an entity extracted from section 3 of a doc, *when* emitted, *then*
   `source.location` records that section and `source.file`/`sourceAuthority` match the input document.
8. **Escalation** — *Given* a first run flags an item below the low-confidence band, *when* re-run with
   escalation, *then* that item is re-extracted via `claude-opus-4-8` and `metadata.model` reflects it.
9. **Streaming/immutability** — *Given* a large input, *when* the run writes JSONL, *then* entries are
   written one-by-one and the completed file is not subsequently mutated (spec 003 §File Lifecycle).

## 7. Interface contracts

Reuse spec 005 verbatim: `ExtractionPipeline`, `ExtractionConfig`, `ExtractionRunResult`,
`LLMGateway`, `LLMOptions`, `LLMResponse<T>`, `GoldenDataset`, `EvaluationMetrics`. Python realisation
(Pydantic models mirroring the TS interfaces). The emitted JSONL line conforms to spec 003's
`JsonlEntry` fixed core. The gateway surface (the only provider-aware code):

```python
class LLMGateway(Protocol):
    async def extract_structured(self, prompt: str, schema: dict,
                                 options: LLMOptions | None = None) -> LLMResponse: ...
    async def embed(self, text: str) -> list[float]: ...   # may raise NotImplemented in Phase 1
```

`LLMOptions.model` defaults to `claude-sonnet-4-6`; escalation path sets `claude-opus-4-8`.

## 8. TDD test plan (write these first)

- **Unit — `test_chunking.py`**: section-based split, oversized-section paragraph split, overlap,
  unstructured fallback.
- **Unit — `test_jsonl_emission.py`**: fixed-core presence; streaming write; entity-vs-relationship
  routing; immutability (no rewrite after close).
- **Unit — `test_confidence_gate.py`** and **`test_schema_validation_gate.py`**: threshold exclusion;
  invalid-payload exclusion + stat counting.
- **Contract — `test_llm_gateway_contract.py`**: any `LLMGateway` impl honours the structured-output
  contract; a **fake gateway** drives deterministic pipeline tests (no network).
- **Golden-dataset — `test_extraction_eval.py`**: run against `evals/payments-golden/`; assert
  precision/recall/F1 ≥ the [D-P1.5](../../phase-1/decisions.md) floors overall and per type, plus the
  auto-merge-band precision bar; confidence-calibration reported as a sanity signal (not gated).
- **Integration — `test_pipeline_end_to_end.py`**: `CanonicalDocument` fixtures → both JSONL files →
  validate every line against the Schema Module.

## 9. Task breakdown

1. [ ] Define Python models for `ExtractionConfig`/`...RunResult`/`LLMGateway`/`GoldenDataset`/`EvaluationMetrics`.
2. [ ] Write the fake `LLMGateway` + gateway contract tests (failing).
3. [ ] Implement the thin Claude gateway (Sonnet default, Opus escalation) behind the port.
4. [ ] Implement pre-processing/chunking + tests.
5. [ ] Implement prompt templates per document type for Phase 0a L1 types (stored as versioned files).
6. [ ] Implement entity extraction (structured output) + relationship extraction.
7. [ ] Implement name+type entity resolution (conservative) + tests.
8. [ ] Implement confidence scoring + schema-validation gate + tests.
9. [ ] Implement streaming JSONL emission (entities + relationships + metadata) + tests.
10. [ ] Build `evals/payments-golden/` labelled dataset + eval harness; gate on the D-P1.5 floors.
11. [ ] End-to-end integration test wiring Feature 01 fixtures through to JSONL.

## 10. OCP extension points

- **Open**: new inventory types via new prompt templates + Phase 0a schemas (no pipeline-core change);
  new `LLMGateway` implementations (different provider/model) swapped behind the port; additional
  entity-resolution tiers (embedding, LLM) added as cascade stages; new `metadata` annotations.
- **Closed**: the JSONL fixed-core contract (spec 003), the `ExtractionPipeline`/`LLMGateway`
  signatures, and the entity/relationship file split. Adding a model must not edit pipeline stages.

## 11. Open questions / risks

- **Phase 1 precision/recall target** — ✅ **RESOLVED** in [D-P1.5](../../phase-1/decisions.md)
  (Extraction quality bar). Entities: precision ≥ 0.85 / recall ≥ 0.70 / F1 ≥ 0.77, auto-merge-band
  precision ≥ 0.90. Relationships: precision ≥ 0.75 / recall ≥ 0.60 / F1 ≥ 0.67, auto-merge-band
  precision ≥ 0.85. Set as a revisable Phase 1 floor with a two-tier gate (strict precision where
  extractions auto-merge; lower recall floor with a human review queue). See acceptance criterion 6.
- Spec Open Q1 (prompt versioning) — adopt "prompts as versioned files + golden regression per
  version"; confirm.
- Spec Open Q3 (entity-resolution context window) — moot in Phase 1 (name+type only); revisit when
  embedding tier lands (vector DB ADR).
- Spec Open Q4 (cost tracking/budget controls) — recommend capturing token usage in run metadata now;
  budget aborts deferred.
- Vector DB ADR is due this phase but only blocks the embedding entity-resolution tier (deferred) —
  confirm it is not on this feature's critical path.
