# Feature 02 — Vendor/Project Mapping Extraction

## 1. Feature

- **Name**: A new extraction **pass** that reads vendor documentation and project specs and emits L2
  entities (`VendorProduct`, `VendorCapabilityMapping`, `ProjectSpec`) and their structural edges
  (`fulfils`, `specifies`, `realizesVendorCap`) plus the regulatory `satisfiedBy` edge, as
  schema-validated intermediate JSONL.
- **Plan step**: 3.2 — *Ingestion of vendor documentation with mapping extraction* ([plan.md
  §Phase 3](../../../plan.md)).
- **Spec(s) expanded**: [specs/005-enrichment-extraction-pipeline.md](../../../specs/005-enrichment-extraction-pipeline.md)
  (extraction passes, golden-dataset eval, escalation), [specs/003-intermediate-jsonl-and-loaders.md](../../../specs/003-intermediate-jsonl-and-loaders.md)
  (canonical JSONL, loader fan-out). Adds a new pass alongside the structural / behaviour / decision
  passes already shipped.

## 2. Summary & scope

The pass that **populates** the L2 layer. It mirrors the structural/behaviour/decision passes already
in [modules/enrichment](../../../modules/enrichment): process docs → typed entities + typed edges →
schema-validated JSONL → loader fan-out → graph. The high-value, high-risk output is the
**`VendorCapabilityMapping`** with its coverage claim: a wrong "covered" is the costly failure (it
turns a real hole green in the Coverage Map and corrupts build-vs-buy). So this pass gets its own
accuracy gate with a **precision-first** posture on coverage claims — the same shape as the Phase 2
Decision gate, for the same reason.

> **Reuse the shipped extraction machinery, do NOT re-author.** The `ExtractionPipeline`,
> `extraction_schemas.py`, the LLM gateway (D-P1.1), the golden-dataset eval harness
> (`test_*_eval.py`), escalation (low-confidence re-run on `claude-opus-4-8`), pass isolation
> (`test_extraction_pass_isolation.py`) and the JSONL emit/validate boundary all exist. This feature
> adds a **vendor/project pass** + its golden dataset; it does not rebuild the pipeline.

**In scope**
- A new extraction pass `vendor_mapping` (own prompt template `vendor.v1.md`, own
  structured-output schema) that emits the three L2 entity types + the `fulfils`/`specifies`/
  `realizesVendorCap`/`satisfiedBy` edges to JSONL, validated against the Feature 01 schemas before emit.
- **Emit-gate enforcement** of the shared cardinality/endpoint rules (D-P2.2) for the L2 edges, reusing
  the registry — structurally-invalid entities/edges are **quarantined + counted**, not silently
  dropped (consistent with Phase 2's reject-vs-quarantine decision).
- A **vendor-mapping golden dataset** (labelled vendor docs + project specs → expected L2 entities/
  edges) and an eval test that gates on the accuracy floor (Decision-to-LOCK #1), with the
  coverage-claim **precision** bar set highest.
- Coverage-claim normalisation to the locked vocabulary (`full`/`partial`/`none` + optional
  percentage — Decision-to-LOCK #2).

**Out of scope**
- The L2 schemas themselves (Feature 01 — this pass *targets* them).
- The Coverage Map / Gap views (Features 03/04 — they *read* what this pass writes).
- Loader/store internals (spec 003 — reused; this pass stops at JSONL).
- A new connector type — vendor docs/project specs ingest through the existing Phase 1 source
  connectors; only the extraction pass is new.

## 3. Dependencies

- **Upstream**: Feature 01 (L2 schemas + edge defs — the validation/emit targets); the Phase 1
  extraction pipeline, LLM gateway, golden-eval harness; the Phase 1 source connectors (document
  intake). `satisfiedBy` edge def already registered (Phase 2.5).
- **Unblocks**: a *populated* Coverage Map (03) and a *real* Gap list (04) — without this pass those
  views render against seeded test graphs only, never live data.
- **Cross-feature**: emits edges whose cardinality/endpoint rules Feature 01 defines and the loader
  re-checks at link time (one shared rule set, D-P2.2).

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **D-P1.1 — Claude behind a gateway** | Default `claude-sonnet-4-6`; **escalate** low-confidence coverage-claim extractions to `claude-opus-4-8` (this is the canonical escalation case — a wrong coverage claim is expensive). |
| **D-P1.3 — language split** | Python pass; integrates only across the JSONL/file boundary. |
| **D-P2.2 — one shared rule set** | The emit gate reuses the same cardinality/endpoint registry the loader uses. |
| **Reject-vs-quarantine (Phase 2)** | Structurally-invalid extractions are quarantined + counted, not dropped — missed/uncertain is recoverable; a wrong auto-merge is the expensive failure. |
| **Decisions-to-LOCK #1 (accuracy floor), #2 (coverage vocab)** | Precision-first coverage gate; normalise coverage to `{full,partial,none}` + optional %. |
| **ADR-0001 — typed JSONL** | Output is canonical typed JSONL, never OKF. |

## 5. User stories

- *As a knowledge engineer, I want vendor docs and project specs processed into the same evidenced,
  versioned L2 entities as every other type, so that vendor claims enter the graph with provenance.*
- *As a portfolio manager, I want each vendor→capability mapping to carry an explicit, normalised
  coverage level, so that the Coverage Map and Gap view are trustworthy.*
- *As a compliance reviewer, I want a wrong "covered" claim to be far rarer than a missed one, so that
  the platform never tells me a hole is filled when it isn't.*
- *As a platform maintainer, I want this to be a new pass (new prompt + schema + golden set), not a
  pipeline rewrite, so that OCP holds.*

## 6. Acceptance criteria (Given/When/Then)

1. **Entity extraction** — *Given* a labelled vendor product datasheet, *when* the pass runs, *then* it
   emits a `VendorProduct` JSONL record (with `vendor`, `productVersion`, `capabilityClaims[]`) that
   validates against the Feature 01 schema.
2. **Mapping extraction with coverage** — *Given* a doc claiming a vendor capability covers a known
   domain concept, *then* a `VendorCapabilityMapping` is emitted with `coverage ∈ {full,partial,none}`
   and (where stated) `coveragePercentage`, plus a `fulfils` edge to the BusinessCapability.
3. **ProjectSpec extraction** — *Given* a requirement/design/ADR document, *then* a `ProjectSpec`
   (`specType` set correctly) is emitted with `specifies` edges to the DomainConcepts it addresses.
4. **Schema-validated emit** — *Given* any emitted record/edge, *when* written, *then* it has already
   passed `SchemaValidator` against the Feature 01 schemas; an invalid candidate is **quarantined +
   counted**, never emitted.
5. **Cardinality at the emit gate** — *Given* a `realizesVendorCap`/`fulfils`/`specifies` candidate
   with a disallowed endpoint type, *when* the pass runs, *then* it is quarantined (shared rule set).
6. **Coverage-claim precision gate** — *Given* the golden dataset, *when* the eval runs, *then*
   coverage-claim **precision** ≥ the locked floor (Decision-to-LOCK #1) — a stricter bar than recall;
   the test fails if precision drops below floor.
7. **Escalation on low confidence** — *Given* a low-confidence coverage extraction, *then* the gateway
   escalates to the stronger model before emit (D-P1.1), recorded in provenance.
8. **Pass isolation (OCP)** — *Given* the existing structural/behaviour/decision passes, *when* the
   vendor pass is added, *then* their golden evals are unaffected (the new pass is additive — extends
   `test_extraction_pass_isolation.py`).
9. **Provenance + temporal** — *Given* any L2 record, *then* it carries `evidencedBy` (source span) and
   bi-temporal `validFrom`/`validTo`, exactly like every other extracted entity.

## 7. Interface contracts

Reuse spec 005 / 003 verbatim — the pass plugs into the existing `ExtractionPipeline` extension point
and emits to the existing JSONL contract. New artefacts:

```
modules/enrichment/src/dkm_enrichment/prompts/templates/vendor.v1.md      # new prompt
modules/enrichment/src/dkm_enrichment/extraction_schemas.py               # +vendor structured-output models
modules/enrichment/tests/golden/vendor_mapping/…                          # labelled docs + expected JSONL
modules/enrichment/tests/test_vendor_extraction.py                        # pass unit tests
modules/enrichment/tests/test_vendor_eval.py                              # golden-dataset accuracy gate
```

Output JSONL conforms to spec 003's record envelope; entity `type` ∈ {`VendorProduct`,
`VendorCapabilityMapping`, `ProjectSpec`}; edges ∈ {`fulfils`, `specifies`, `realizesVendorCap`,
`satisfiedBy`}.

## 8. TDD test plan (write these first)

- **Unit — `test_vendor_extraction.py`**: deterministic (fake-LLM/fixture) parse of a known vendor
  doc → expected `VendorProduct` + `VendorCapabilityMapping` + `fulfils` edge; a known project spec →
  `ProjectSpec` + `specifies`; coverage normalisation maps prose ("fully supports", "partial") → enum.
- **Unit — quarantine**: a malformed candidate (bad `coverage`, disallowed endpoint) is quarantined +
  counted, not emitted (criteria 4–5).
- **Eval — `test_vendor_eval.py`** (auto-skips without `ANTHROPIC_API_KEY`, per CLAUDE.md CI rule):
  golden dataset → coverage-claim precision ≥ floor; overall entity/edge F1 ≥ floor (Decision #1).
- **Contract — extend `test_extraction_pass_isolation.py`**: adding the vendor pass leaves the other
  passes' outputs byte-identical (OCP).
- **Provenance test**: every emitted L2 record has `evidencedBy` + temporal fields (criterion 9).

## 9. Task breakdown

1. [ ] Add the `vendor.v1.md` prompt template + the vendor structured-output models in
   `extraction_schemas.py`.
2. [ ] Implement the `vendor_mapping` pass behind the existing `ExtractionPipeline` extension point;
   normalise coverage to the locked vocabulary.
3. [ ] Wire the emit gate to the shared cardinality/endpoint registry; quarantine + count invalids.
4. [ ] Build the vendor-mapping golden dataset (labelled docs + expected JSONL).
5. [ ] Add the eval test with the precision-first coverage gate; add pass-isolation + provenance tests.
6. [ ] Document the floor numbers in `docs/phase-3/decisions.md` once ratified.

## 10. OCP extension points

- **Open**: new extraction passes (this one), new prompt template versions (`vendor.v2.md`), additive
  golden cases — all without touching existing passes.
- **Closed**: the `ExtractionPipeline` interface, the JSONL envelope (spec 003), the LLM gateway, and
  every other pass's golden eval (criterion 8). Adding this pass must not modify them.

## 11. Open questions / risks

- **Accuracy floor numbers (Decision-to-LOCK #1)** — precision-first on coverage claims; exact
  precision/recall floors to be ratified in `docs/phase-3/decisions.md`. *Recommendation:* start from
  the Decision-pass floors (the closest analogue — costly-when-wrong), bias recall down / precision up.
- **Coverage inference vs explicit claim** — some docs state coverage explicitly ("covers 80%"), others
  imply it. *Recommendation:* extract explicit claims with high confidence; mark inferred coverage
  lower-confidence so it routes to the review queue rather than auto-merge. Confirm.
- **Vendor-capability ↔ domain-concept resolution** — mapping a vendor's capability name onto the
  canonical L1 concept is an entity-resolution problem (the vendor's vocabulary ≠ ours).
  *Recommendation:* reuse the existing entity-resolution path where available; where ambiguous, emit
  the mapping with a `candidateConcepts[]` shortlist + low confidence for review, never a silent guess.
- **`satisfiedBy` now has live L2 targets** — Phase 2.5 registered it forward-compatibly; this pass is
  the first to emit it against a real `ProjectSpec`. Verify the link gate accepts it end-to-end (a
  cross-adapter e2e, mirroring Phase 2.5's).
