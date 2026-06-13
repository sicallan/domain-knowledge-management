# Review: plan.md — Implementation Plan

## Overall Assessment

**Rating**: Strong foundation with clear thinking. The plan demonstrates sophisticated understanding of domain modelling, architecture, and engineering discipline. Several areas could be strengthened for practical execution.

---

## Strengths

1. **Decision as first-class concept** — Excellent insight. Decisions are indeed the highest-value nodes in any knowledge graph. The attribute schema and relationship set are well-considered.

2. **Three-layer model (L1/L2/L3)** — Clean separation of concerns between pure domain, functional realisation, and technical realisation. This enables multi-vendor and multi-project mapping without pollution.

3. **OCP + TDD as guiding principles** — The explicit commitment to extension over modification and test-first development gives confidence in long-term maintainability.

4. **Last Responsible Moment for tech decisions** — Appropriate for a greenfield platform where requirements will emerge during implementation.

5. **Phased delivery** — Clear progression from foundation to value, with each phase building on the previous one.

---

## Recommendations and Improvements

### 1. Missing: Governance and Ownership Model

**Issue**: No mention of who owns inventories, who approves schema changes, or how conflicting contributions are resolved.

**Recommendation**: Add a section on governance:
- Inventory ownership (which team/role owns which catalogue)
- Schema change approval process (ADR + review board or PR-based)
- Conflict resolution when multiple sources assert contradictory facts
- Data stewardship roles

---

### 2. Missing: Event Sourcing / Audit Trail for the Knowledge Graph Itself

**Issue**: The plan covers quality verification of extracted facts but doesn't address how mutations to the graph are tracked over time.

**Recommendation**: Add event sourcing or change-log for the knowledge graph:
- Every graph mutation (add/update/remove node or edge) is recorded as an immutable event
- Enables time-travel queries ("what did the graph look like 3 months ago?")
- Supports undo/rollback of agent-proposed changes
- Provides the audit trail required for regulatory compliance domains

---

### 3. Inventory Schema Gaps

**Issue**: Several inventory types lack important attributes.

**Recommendations**:
- `Rule`: Add `effectiveDate`, `expiryDate`, `version` (rules change over time)
- `Decision`: Add `frequency` (how often it's invoked), `latencyBudget` (for automated decisions)
- `BusinessInvariant`: Add `scope` (global vs bounded context-specific), `enforcementMechanism`
- `ReferenceData`: Add `sourceOfTruth`, `refreshMechanism`, `staleness policy`
- All types: Add `lifecycle_status` (draft/active/deprecated/retired)

---

### 4. Missing: Versioning Strategy for Inventory Entries

**Issue**: The plan mentions schema versioning but not how individual inventory entries are versioned as facts change.

**Recommendation**: Define entry-level versioning:
- Each inventory entry has a version history
- Temporal validity (validFrom/validTo) for entries that change over time
- Bi-temporal modelling: when the fact was true vs when we learned it
- Link between entry version and source evidence version

---

### 5. Phase 0 is Too Large

**Issue**: 5 steps in 3 weeks covering schema module, relationship schema, extension mechanism, AND graph persistence interface is ambitious for a foundation phase.

**Recommendation**: Split Phase 0:
- **Phase 0a (Week 1-2)**: Monorepo scaffold + L1 schemas only (enough to prove the pattern)
- **Phase 0b (Week 3-4)**: Relationship schema + extension mechanism + graph port
- This also de-risks by getting something testable earlier

---

### 6. Missing: Data Quality Dimensions

**Issue**: The plan mentions quality verification but doesn't define what dimensions of quality are measured.

**Recommendation**: Add explicit quality dimensions:
- **Accuracy**: Is the extracted fact correct?
- **Completeness**: Are all expected facts present?
- **Consistency**: Do facts from different sources agree?
- **Timeliness**: Is the fact current?
- **Provenance**: Can the fact be traced to evidence?
- **Confidence**: How certain is the extraction?

---

### 7. Relationship Cardinality and Constraints Missing

**Issue**: Relationships are listed but without cardinality constraints, optionality, or validation rules.

**Recommendation**: For each relationship type, specify:
- Cardinality (1:1, 1:N, M:N)
- Required vs optional
- Constraints (e.g., a Decision MUST have at least one Rule OR one BusinessInvariant)
- Direction semantics (is it navigable both ways?)

---

### 8. Missing: Search and Retrieval Strategy

**Issue**: The plan mentions views but doesn't describe how users will find things — full-text search, graph traversal, natural language queries.

**Recommendation**: Add a retrieval section:
- Hybrid search (vector + keyword + graph traversal)
- Query patterns: "find all decisions affected by regulation X", "show me everything related to payments timeout"
- Faceted navigation by layer, type, owner, status
- Natural language query → structured query translation

---

### 9. Missing: Integration with Existing Enterprise Systems

**Issue**: No mention of how this platform integrates with existing enterprise tools (CMDB, ITSM, wiki, Confluence, Jira, etc.).

**Recommendation**: Add integration strategy:
- Bidirectional sync with CMDB for system/service inventory
- Import from wiki/Confluence for existing documentation
- Jira/ADO linkage for project specs and decisions
- Export/publish to existing enterprise architecture tools

---

### 10. Views Section Needs User Stories

**Issue**: Views are listed as a table but without clarity on who uses them and what question they answer.

**Recommendation**: Frame each view as a user story:
- "As a domain architect, I want to see the Decision Inventory so that I can identify where regulation affects my domain"
- "As an operations engineer, I want to see the Behaviour Flow View so that I can trace a failed payment through all services"

---

## Minor Issues

- The "Why it matters" section for Decisions should be promoted to a top-level motivating section, as it applies to the entire platform, not just Decisions
- Phase 5 (Quality + Scale) feels underspecified compared to earlier phases — flesh out contradiction detection and correction approaches
- Consider adding a "Risks and Mitigations" section
- The SDLC cadence section should mention how the product handles breaking changes to the ontology once real data exists

---

## Summary of Key Actions

| Priority | Action |
|---|---|
| High | Add governance/ownership model |
| High | Add versioning strategy for inventory entries |
| High | Add relationship cardinality constraints |
| Medium | Split Phase 0 into 0a/0b |
| Medium | Add data quality dimensions |
| Medium | Add search/retrieval strategy |
| Medium | Add enterprise integration strategy |
| Low | Add user stories for views |
| Low | Add risks and mitigations section |
| Low | Flesh out Phase 5 |
