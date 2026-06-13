# Review: proof.md — Proof of Concept: Sample Sources & Test Suite

## Overall Assessment

**Rating**: Excellent specification with strong coverage. The document demonstrates deep domain knowledge (SEPA Instant, Finastra GPP) and rigorous test design. Some gaps in execution strategy and edge case coverage.

---

## Strengths

1. **Realistic domain content** — The use of SEPA Instant + Finastra GPP is an excellent choice. It exercises regulatory, vendor, project, and operational dimensions simultaneously.

2. **Multi-format coverage** — 7 distinct formats (MD, PDF, JSON, JSONL, XML, CSV, OpenAPI) ensures the pipeline isn't format-biased.

3. **Comprehensive test categories** — T1-T9 cover the full spectrum from basic extraction through cross-layer traceability to confidence scoring.

4. **Golden dataset approach** — Defining expected extractions alongside source documents enables quantitative measurement from day one.

5. **Embedded sample data** — Including actual CSV rows, JSON payloads, and XML structures makes the spec self-contained and unambiguous.

---

## Recommendations and Improvements

### 1. Missing: Negative Test Cases

**Issue**: All tests validate correct extraction (happy path). No tests for handling ambiguous, contradictory, or malformed input.

**Recommendation**: Add T10 category — Robustness Tests:
- T10.01: Malformed CSV with missing columns → graceful degradation
- T10.02: Contradictory amount limits across documents (scheme says €100k, project says €15k) → contradiction flagged
- T10.03: Duplicate/overlapping documents → deduplication or merge
- T10.04: Source with mixed languages → language detection and handling
- T10.05: Incomplete document (truncated PDF) → partial extraction with confidence penalty
- T10.06: Outdated document (superseded by newer version) → temporal resolution

---

### 2. Missing: Performance and Scale Test Cases

**Issue**: No tests for extraction performance, graph query latency, or pipeline throughput.

**Recommendation**: Add T11 category — Performance Tests:
- T11.01: Single document extraction completes within target latency (e.g., <30s for markdown)
- T11.02: Batch ingestion of all ~30 documents completes within acceptable timeframe
- T11.03: Graph query (single-hop relationship) returns within target latency
- T11.04: Multi-hop traversal (L1→L2→L3) returns within target latency
- T11.05: Concurrent extraction doesn't cause data races in graph updates

---

### 3. Sample Documents Lack Versioning Scenarios

**Issue**: Only one version of each document is provided. Real-world scenarios involve document evolution.

**Recommendation**: Add versioning test cases:
- Include `rulebook-sct-inst-v1.1.md` (previous version) alongside v1.2
- Include `gpp-release-notes-v2023.2.md` (previous release) for change detection
- Test that the system correctly identifies what changed between versions
- Test that superseded facts are marked as historical, not deleted

---

### 4. Missing: Incremental Update Tests

**Issue**: All tests assume fresh ingestion. No tests for how the system handles updates to previously ingested sources.

**Recommendation**: Add T12 category — Incremental Update Tests:
- T12.01: Modified source document → existing entries updated (not duplicated)
- T12.02: Deleted section in source → affected entries marked as potentially stale
- T12.03: New source that contradicts existing entry → conflict surfaced
- T12.04: Re-ingestion of unchanged source → no-op (idempotency)
- T12.05: New relationship evidence in updated document → relationship added without disrupting existing graph

---

### 5. Test Assertions Need Quantitative Thresholds

**Issue**: Many assertions use vague qualifiers like "≥5 entries" or "correctly identified". Need explicit precision/recall targets.

**Recommendation**: Define target metrics per category:
- T1 (Schema Extraction): Precision ≥ 0.90, Recall ≥ 0.85
- T2 (Relationships): Precision ≥ 0.85, Recall ≥ 0.80
- T3 (Decisions): Precision ≥ 0.90, Recall ≥ 0.90 (high bar — decisions are critical)
- T4 (Cross-Layer): Completeness ≥ 0.80 (L1→L3 traces exist)
- T5 (Behaviour): Sequence accuracy ≥ 0.90
- T9 (Confidence): Calibration error < 0.1

---

### 6. Missing: Source Priority and Conflict Resolution Rules

**Issue**: When multiple sources assert different facts (e.g., scheme rulebook vs vendor config for amount limits), there's no defined resolution strategy.

**Recommendation**: Add conflict resolution test cases and rules:
- Define source authority hierarchy (regulatory > scheme > vendor > project > operational)
- Test that higher-authority sources override lower-authority when in conflict
- Test that conflicts are surfaced with both sources cited, not silently resolved
- Test temporal resolution: more recent source wins when authority is equal

---

### 7. PDF Handling Underspecified

**Issue**: Two PDF files are listed (`scheme-participant-guide.pdf`, `gpp-sct-inst-module-config.pdf`) but without sample content or extraction expectations as detailed as other formats.

**Recommendation**: Either:
- Provide text-based markdown equivalents of the PDF content for testing (test the extraction logic, not the PDF parser)
- Or clearly specify the PDF parsing tool/library and include OCR/layout-specific test cases
- Add tests for PDF-specific challenges: tables, multi-column layout, headers/footers, page breaks mid-sentence

---

### 8. Missing: Entity Resolution Test Cases

**Issue**: The same concept appears across multiple documents with different names (e.g., "payment-engine" in logs vs "GPP Payment Engine" in vendor docs vs "Payment Processing Service" in project docs). No explicit tests for entity resolution.

**Recommendation**: Add entity resolution tests:
- T_ER.01: "payment-engine" (log) = "GPP Payment Engine" (vendor) = "Payment Processing Service" (project) → single entity
- T_ER.02: "TIPS" appears in scheme docs, project docs, and operational logs → correctly unified
- T_ER.03: "Validator" in GPP docs vs "payment-validator" in logs → correctly linked
- T_ER.04: Ambiguous reference "the system" → not incorrectly merged with wrong entity

---

### 9. Operational Sources Need More Variety

**Issue**: Operational sources focus on happy-path and timeout scenarios only. Missing other common failure modes.

**Recommendation**: Add operational samples for:
- Sanctions screening rejection (different from timeout)
- Duplicate payment detection (409 response scenario)
- Partial system outage (one service down, others working)
- Performance degradation (SLA near-miss)
- Recall/return flow operational evidence

---

### 10. Test Automation Section Needs More Detail

**Issue**: The automation section shows npm commands but doesn't address:
- How golden datasets are maintained as the extraction model improves
- How to handle flaky tests (LLM extraction is non-deterministic)
- How to regression-test after model/prompt changes

**Recommendation**: Add:
- Deterministic mode for LLM-based extraction (fixed seed, temperature=0)
- Fuzzy matching thresholds for non-deterministic assertions
- Regression test strategy: "extraction must be at least as good as baseline"
- Golden dataset versioning: update expected outputs as extraction improves

---

## Minor Issues

- The folder structure could include a `/raw-inputs/metadata/` directory for source metadata (fetch date, version, author)
- Consider adding a data lineage diagram showing how each source flows through the pipeline to specific inventory types
- The payment-cleared-event.json is referenced in the folder structure but not specified in the sample documents section
- Test IDs jump from T9 to the execution strategy — consider reserving T10+ for future categories explicitly
- Some test assertions are boolean (pass/fail) when they should be quantitative (precision/recall)

---

## Summary of Key Actions

| Priority | Action |
|---|---|
| High | Add negative/robustness test cases (T10) |
| High | Add entity resolution test cases |
| High | Define quantitative precision/recall targets |
| Medium | Add incremental update tests (T12) |
| Medium | Add version-change detection scenarios |
| Medium | Define source authority hierarchy for conflicts |
| Medium | Add performance test category |
| Low | Flesh out PDF handling strategy |
| Low | Add more operational failure scenarios |
| Low | Detail test automation for non-deterministic extraction |
