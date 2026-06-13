# Domain Knowledge Management — Implementation Plan

## Decision as a First-Class Inventory Item

**Decision** is a core domain concept representing a point in a process or flow where logic selects a path, outcome, or action based on inputs, rules, and context. It is distinct from a Rule (which is a single evaluable statement) — a Decision *uses* rules, reference data, and context to produce an outcome.

### `Decision` inventory entry

| Attribute | Description |
|---|---|
| name | Decision name (e.g., "Authorise Transaction") |
| type | `automated` / `manual` / `hybrid` |
| inputs | Data/context required to make the decision |
| rules | Rules evaluated (links to Rule inventory) |
| referenceData | Reference data consulted (links to ReferenceData inventory) |
| invariants | Business invariants that constrain outcomes |
| outcomes | Possible decision outcomes and their downstream effects |
| owner | Bounded context / service responsible |
| frequency | How often the decision is invoked (transactions/sec, daily, on-demand) |
| latencyBudget | Maximum acceptable decision time for automated decisions |
| evidencedBy | Source evidence |
| lifecycle_status | `draft` / `active` / `deprecated` / `retired` |
| version | Current version of the decision definition |
| validFrom | Date from which this decision definition is effective |
| validTo | Date until which this decision definition is effective (null = current) |

### New relationships

- `evaluates(Decision → Rule)` — which rules are considered
- `consumes(Decision → ReferenceData)` — what data feeds it
- `constrainedBy(Decision → BusinessInvariant)` — what must always hold
- `triggeredBy(Event/OrchestrationStep → Decision)` — what invokes it
- `produces(Decision → Event/Command/StateTransition)` — what it yields
- `realizedBy(Decision → Service/Component)` — how it's implemented

### Why it matters

Decisions are the highest-value points in any domain. They are where regulation bites, where business logic concentrates, where errors are most costly, and where impact assessment yields the most signal.

---

## The Three-Layer Domain Model

**Layer 1 — Pure Domain (Canonical Truth)**
- Domain-Driven Design concepts: domains, subdomains, bounded contexts, aggregates, entities, value objects, domain events, commands, policies, invariants, decisions
- Language that business and architects share; vendor and technology agnostic
- This is the reference layer everything maps *to*

**Layer 2 — Functional Realisation (Vendor / Project / Specification)**
- What a vendor product or an internal project specification claims to fulfil
- Vendor capabilities and their mapping to domain concepts
- Project-level requirements, designs, specifications, feature sets
- The "intent" of how the domain is being addressed functionally, not yet technically
- Supports multiple competing or complementary solutions mapping to the same domain concept

**Layer 3 — Technical Realisation (Enterprise Implementation)**
- How the domain is actually built and deployed in the organisation
- Systems, services, containers, components, data stores, integrations, infrastructure
- Runtime behaviour: orchestration steps, events emitted/consumed, rules evaluated, decisions made, reference data accessed, invariants enforced
- Operational evidence: logs, traces, metrics, runbooks, change records

---

## Inventories (First-Class Catalogues)

Each inventory is a named, versioned, typed catalogue of entities with defined schemas.

| Inventory | Layer | Key attributes |
|---|---|---|
| `DomainConcept` | L1 | name, type (aggregate/entity/event/policy/invariant/command), subdomain, context, lifecycle_status, version |
| `BusinessCapability` | L1 | name, level, parent capability, lifecycle_status |
| `BusinessInvariant` | L1 | statement, governing context, severity, scope (global/context-specific), enforcementMechanism, lifecycle_status |
| `Rule` | L1/L2 | expression, type (validation/decision/constraint), source, effectiveDate, expiryDate, version, lifecycle_status |
| `Decision` | L1/L2 | name, type, inputs, rules, outcomes, owner, frequency, latencyBudget, lifecycle_status, version |
| `ReferenceData` | L1/L2 | name, owner, update frequency, consuming concepts, sourceOfTruth, refreshMechanism, stalenessPolicy, lifecycle_status |
| `VendorProduct` | L2 | name, vendor, version, capability claims |
| `VendorCapabilityMapping` | L2 | vendor capability → domain concept, coverage, gaps |
| `ProjectSpec` | L2 | name, type (requirement/design/ADR), status, domain concepts addressed |
| `System` | L3 | name, type, owner team, lifecycle status |
| `Service` | L3 | name, system, bounded context, deployment model |
| `OrchestrationFlow` | L3 | name, trigger, steps, owning service |
| `OrchestrationStep` | L3 | sequence, action type, service/component, input/output |
| `Event` | L3 | name, type (domain/integration), emitter, consumers, transport |
| `StateTransition` | L3 | entity, from state, to state, trigger, guard condition |
| `Integration` | L3 | source, target, protocol, data contract |
| `RegulatoryRequirement` | L1/L2 | regulation, article, obligation type, affected domain concepts |
| `PolicyStatement` | L1/L2 | statement, regulation source, enforcement mechanism |

---

## Relationships (Cross-Inventory Graph Edges)

### Structural

- `implements(Service → DomainConcept)`
- `fulfils(VendorProduct → BusinessCapability)`
- `specifies(ProjectSpec → DomainConcept)`
- `realizesVendorCap(Service → VendorCapabilityMapping)`
- `supports(System → BusinessCapability)`
- `belongsTo(Service → BoundedContext)`
- `constrainedBy(DomainConcept/Service → BusinessInvariant)`
- `usesReferenceData(Service/Rule/Decision → ReferenceData)`
- `governs(Rule → DomainConcept/OrchestrationStep)`

### Behavioural

- `triggers(Event/Command → OrchestrationFlow)`
- `emits(Service/Step → Event)`
- `consumes(Service → Event)`
- `transitionsTo(OrchestrationStep → StateTransition)`
- `compensates(OrchestrationStep → OrchestrationStep)`
- `invokes(OrchestrationStep → Decision)`

### Decision-specific

- `evaluates(Decision → Rule)`
- `consumes(Decision → ReferenceData)`
- `constrainedBy(Decision → BusinessInvariant)`
- `triggeredBy(Event/OrchestrationStep → Decision)`
- `produces(Decision → Event/Command/StateTransition)`
- `realizedBy(Decision → Service/Component)`

### Regulatory / Policy

- `obliges(RegulatoryRequirement → DomainConcept/BusinessCapability)`
- `satisfiedBy(RegulatoryRequirement → ProjectSpec/Rule/PolicyStatement/Decision)`
- `exposes(Service → RegulatoryRequirement)` (surface area)

### Relationship Cardinality and Constraints

| Relationship | Cardinality | Required | Constraint |
|---|---|---|---|
| `evaluates(Decision → Rule)` | 1:N | At least one Rule OR BusinessInvariant | A Decision must reference at least one evaluable element |
| `consumes(Decision → ReferenceData)` | 0:N | Optional | — |
| `constrainedBy(Decision → BusinessInvariant)` | 0:N | Optional | — |
| `triggeredBy(Event/Step → Decision)` | 1:N → 1 | Required for automated decisions | Every automated decision must have a trigger |
| `produces(Decision → Event/Command/StateTransition)` | 1:N | Required | Every decision must have at least one outcome |
| `realizedBy(Decision → Service/Component)` | 0:N | Required for L3-mapped decisions | Technical realisation must be identified |
| `implements(Service → DomainConcept)` | M:N | At least one per service | No orphan services |
| `belongsTo(Service → BoundedContext)` | N:1 | Required | A service belongs to exactly one context |
| `emits(Service → Event)` | 1:N | Optional | — |
| `evidencedBy(Any → Source)` | 1:N | Required | Every inventory entry must have provenance |

All relationships are navigable in both directions for graph traversal.

---

## Governance and Ownership Model

### Inventory Ownership

| Inventory | Owner Role | Approval Authority |
|---|---|---|
| L1 (Domain) inventories | Domain Architect | Architecture Board |
| L2 (Functional) inventories | Product Owner / Solution Architect | Project Lead + Architecture Board |
| L3 (Technical) inventories | Engineering Lead | Engineering Lead + peer review |
| Cross-layer relationships | Domain Architect | Architecture Board |
| Reference Data | Data Steward | Data Governance Board |

### Schema Change Process

1. Schema changes proposed via ADR (Architecture Decision Record)
2. Additive changes (new optional fields, new types): PR-based review by inventory owner
3. Breaking changes (field removal, type change): Architecture Board approval required
4. All changes must pass existing schema validation tests before merge

### Conflict Resolution

When multiple sources assert contradictory facts:
1. **Source authority hierarchy**: Regulatory > Scheme > Vendor > Project > Operational
2. **Temporal resolution**: More recent source wins when authority is equal
3. **Confidence-based**: Higher-confidence extraction wins when authority and time are equal
4. **Human escalation**: Conflicts that cannot be auto-resolved are queued for manual review with full context (both sources, confidence scores, impact assessment)

### Data Stewardship

- Every inventory type has a designated steward responsible for quality
- Stewards review low-confidence extractions weekly
- Stewards approve schema evolution proposals for their domain
- Stewards maintain golden datasets for their inventory types

---

## Versioning Strategy

### Schema Versioning
- Schemas follow semantic versioning (`major.minor.patch`)
- Additive-only evolution for minor versions
- Breaking changes require major version bump with migration path

### Entry-Level Versioning
- Every inventory entry maintains a version history
- Each version records: `versionNumber`, `validFrom`, `validTo`, `changedBy`, `changeReason`, `evidenceRef`
- **Bi-temporal modelling**: tracks both when the fact was true in the world (valid time) AND when the system learned it (transaction time)
- Superseded entries are not deleted but marked with `validTo` timestamp
- All versions remain queryable for time-travel analysis

### Knowledge Graph Event Log
- Every graph mutation (add/update/remove node or edge) is recorded as an immutable event
- Events capture: `timestamp`, `mutationType`, `affectedEntity`, `previousState`, `newState`, `trigger` (agent/user/pipeline), `confidence`
- Enables time-travel queries: "What did the graph look like on date X?"
- Supports undo/rollback of agent-proposed changes
- Provides audit trail for regulatory compliance

---

## Data Quality Dimensions

Every fact in the knowledge graph is measured against six quality dimensions:

| Dimension | Definition | Measurement |
|---|---|---|
| **Accuracy** | Is the extracted fact correct? | Precision against golden dataset |
| **Completeness** | Are all expected facts present? | Recall against golden dataset |
| **Consistency** | Do facts from different sources agree? | Contradiction detection rate |
| **Timeliness** | Is the fact current? | Staleness score (time since last evidence) |
| **Provenance** | Can the fact be traced to evidence? | Evidence link coverage (target: 100%) |
| **Confidence** | How certain is the extraction? | Calibration error (predicted vs actual correctness) |

### Quality Scoring
- Each inventory entry receives a composite quality score (0.0–1.0)
- Score = weighted combination of all applicable dimensions
- Entries below threshold (configurable, default 0.6) are flagged for review
- Quality trends tracked over time per inventory type

---

## Search and Retrieval Strategy

### Query Patterns

| Pattern | Example | Mechanism |
|---|---|---|
| Semantic search | "How does timeout handling work?" | Vector similarity over embedded entries |
| Entity lookup | "Show me Decision DEC-004" | Direct graph node retrieval |
| Relationship traversal | "What rules does the amount limit decision evaluate?" | Graph path query |
| Impact query | "What is affected if we change the amount limit?" | Multi-hop graph traversal + scoring |
| Faceted browse | "All L3 services in Payment bounded context" | Filtered graph query with facets |
| Natural language | "Which regulations affect the sanctions screening?" | NL → structured query translation |
| Temporal query | "What changed in the payment flow since last month?" | Event log replay + diff |

### Retrieval Architecture
- **Hybrid search**: combines vector similarity, keyword/BM25, and graph traversal
- **Query planner**: decomposes complex queries into sub-queries across indices
- **Faceted navigation**: filter by layer, type, owner, status, confidence, date range
- **Result ranking**: combines relevance, recency, confidence, and authority

---

## Enterprise Integration Strategy

### Integration Points

| External System | Direction | Purpose |
|---|---|---|
| CMDB (ServiceNow, etc.) | Bidirectional | System/service inventory sync |
| Wiki/Confluence | Import | Existing documentation ingestion |
| Jira/ADO | Import + link | Project specs, decisions, requirements |
| Enterprise Architecture tool (Sparx, LeanIX) | Export | Publish domain model and views |
| Git repositories | Import | Code-level evidence, ADRs, READMEs |
| CI/CD pipelines | Import | Deployment evidence, service metadata |
| APM/Observability (Datadog, Dynatrace) | Import | Runtime behaviour evidence |

### Integration Principles
- All integrations use adapter pattern (OCP-compliant)
- Each adapter implements the source connector port interface
- Bidirectional sync uses event-driven updates (not polling)
- Conflict resolution applies when external system contradicts internal state

---

## Guiding Engineering Principles

### 1. Open-Closed Principle (OCP)

Every module is open for extension (new inventory types, new relationship types, new agents, new views) but closed for modification (existing schemas, contracts, and behaviours remain stable). Achieved through:

- Schema versioning and additive-only evolution
- Plugin/adapter architecture for connectors, enrichers, agents
- Typed extension points over hard-coded behaviour

### 2. Test-Driven Development (TDD)

Nothing gets built without a failing test first. Applied at every level:

- Schema validation tests before schema implementation
- Contract tests before API implementation
- Agent behaviour tests (golden datasets) before agent logic
- Integration tests against graph/store before production wiring

### 3. Product Management Discipline

- Thin vertical slices delivering usable outcomes
- Each phase produces a deployable, testable, demonstrable increment
- Backlog driven by value (which inventories/views/agents unlock the most insight)
- Build the minimum viable inventory first, then extend

---

## Implementation Phases

### Phase 0a: Scaffold and Core Schemas (Weeks 1–2)

**Goal**: Establish the engineering scaffold and prove the schema-first pattern with L1 types.

| Step | Deliverable | TDD approach |
|---|---|---|
| 0a.1 | Monorepo scaffold: package structure, tooling config (TS + Python), CI pipeline | Test: CI runs green on empty modules |
| 0a.2 | Schema module: JSON Schema definitions for all Layer 1 inventory types (`DomainConcept`, `BusinessCapability`, `BusinessInvariant`, `Rule`, `ReferenceData`, `Decision`) | Test: schema validation passes for valid fixtures, rejects invalid |
| 0a.3 | Lifecycle and versioning: `lifecycle_status` and `version` fields on all types, bi-temporal validity support | Test: version transitions validated, temporal queries work on fixtures |

---

### Phase 0b: Relationships and Extension (Weeks 3–4)

**Goal**: Prove the relationship model, extension mechanism, and graph port interface.

| Step | Deliverable | TDD approach |
|---|---|---|
| 0b.1 | Relationship schema: typed edge definitions with cardinality constraints and direction | Test: relationship validator accepts/rejects correctly, cardinality enforced |
| 0b.2 | Schema extension mechanism: prove OCP by adding a new inventory type without modifying existing code | Test: extension point loads new type; existing tests still pass |
| 0b.3 | Graph persistence interface (port): define abstract interface for graph storage with event log | Test: port contract tests (against in-memory stub), mutation events recorded |
| 0b.4 | Quality scoring framework: composite quality score computation for inventory entries | Test: score correctly computed for entries with known quality dimensions |

**Tech decisions deferred until proven needed** (kept open):
- Graph DB choice (Neo4j vs Neptune vs in-memory for dev)
- Vector DB choice
- Workflow engine choice

**Tech decisions made now** (minimal commitment):
- TypeScript for schemas, core modules, API layer
- Python for ML/NLP/agent workloads
- JSON Schema as the schema language (widely supported, testable)
- Git-based schema versioning (schemas live in repo)
- GitHub Actions CI from day one

---

### Phase 1: First Vertical Slice (Weeks 4–7)

**Goal**: One complete path from source document → inventory entries → graph → queryable view.

| Step | Deliverable | TDD approach |
|---|---|---|
| 1.1 | Source connector: file/markdown ingestion adapter (plugin interface) | Test: adapter produces canonical output for fixture inputs |
| 1.2 | Enrichment module: LLM-based extraction of domain concepts, decisions, rules from text | Test: extraction against golden dataset achieves target precision/recall |
| 1.3 | Graph persistence adapter: implement port for chosen graph store (start with lightweight: e.g., in-memory or SQLite-backed for dev, Neo4j for integration) | Test: contract tests pass on real adapter |
| 1.4 | Query interface: simple API to retrieve inventory items and traverse relationships | Test: query returns expected results for seeded graph |
| 1.5 | First view: Domain Map view projection from graph | Test: view output matches expected structure for known graph state |

**OCP validation**: add a second connector (e.g., JSON ingestion) — must work without modifying core pipeline code, only adding a new adapter.

---

### Phase 2: Behaviour + Decisions (Weeks 8–11)

**Goal**: Populate behaviour inventories and Decision as a first-class concept.

| Step | Deliverable | TDD approach |
|---|---|---|
| 2.1 | Behaviour inventory schemas: `OrchestrationFlow`, `OrchestrationStep`, `Event`, `StateTransition`, `Decision` | Test: schema validation |
| 2.2 | Enrichment extension: extract behaviour elements and decisions from process documentation | Test: golden dataset for behaviour extraction |
| 2.3 | Decision-specific extraction: identify decisions, their inputs, rules used, outcomes, constraints | Test: decision extraction accuracy on labelled samples |
| 2.4 | Behaviour flow view: visual/structured representation of orchestration with decision points highlighted | Test: view output matches expected for seeded behaviour graph |
| 2.5 | Cross-layer linking: decisions link to L1 domain concepts, L2 specs, L3 services | Test: traversal queries return correct cross-layer paths |

---

### Phase 3: Layer 2 + Vendor/Project Mapping (Weeks 12–14)

> **Note**: Phase 3 also marks the start of the **UI & Backend Application** workstream. The application shell, GraphQL API, authentication, and Knowledge Explorer are delivered in parallel with the steps below. See **[UI & Backend Application Plan](ui-backend-plan.md)** for detailed steps (UI-3.1 through UI-3.6), architecture, and non-functional requirements. That plan continues through Phases 4 and 5.

**Goal**: Functional realisation layer populated; coverage and gap views enabled.

| Step | Deliverable | TDD approach |
|---|---|---|
| 3.1 | L2 inventory schemas: `VendorProduct`, `VendorCapabilityMapping`, `ProjectSpec` | Test: schema validation |
| 3.2 | Ingestion of vendor documentation with mapping extraction | Test: extraction golden dataset |
| 3.3 | Coverage view: domain concepts vs vendor/project coverage matrix | Test: view matches expected for known mappings |
| 3.4 | Gap analysis agent: identify unmapped L1 concepts | Test: agent correctly identifies known gaps in test graph |

---

### Phase 4: Impact Assessment (Weeks 15–18)

**Goal**: Agent that takes new documents and produces structured impact reports.

| Step | Deliverable | TDD approach |
|---|---|---|
| 4.1 | Impact report schema: structured output format | Test: schema validation |
| 4.2 | Document ingestion: extract obligations/directives from regulatory/strategic documents | Test: extraction accuracy on labelled regulation samples |
| 4.3 | Graph traversal engine: from extracted obligations → affected concepts → affected realisations | Test: traversal returns correct paths for seeded impact scenarios |
| 4.4 | Impact scoring: severity, breadth, confidence | Test: scoring matches expected for known scenarios |
| 4.5 | Impact report generation: structured output with provenance | Test: end-to-end report matches expected for golden scenario |

---

### Phase 5: Quality + Scale (Weeks 19–22)

**Goal**: Agentic quality loop, contradiction detection, confidence-based automation.

| Step | Deliverable | TDD approach |
|---|---|---|
| 5.1 | Contradiction agent: detects conflicting facts across sources using semantic similarity and logical rule evaluation | Test: detects known contradictions in test graph (conflicting invariants, overlapping rules, stale facts) |
| 5.2 | Correction agent with confidence scoring: proposes fixes with provenance, ranks by confidence and impact | Test: proposes correct fixes for known issues; confidence scores correlate with actual correctness |
| 5.3 | Auto-merge policy engine: configurable thresholds by inventory type, impact level, and source authority | Test: merges above threshold, queues below; respects authority hierarchy |
| 5.4 | Continuous eval harness: periodic re-evaluation against golden datasets, drift detection, regression alerts | Test: metrics track over time; regressions trigger alerts |
| 5.5 | Staleness detection: identifies entries whose evidence sources have been updated or superseded | Test: correctly flags entries with outdated provenance |
| 5.6 | Graph health dashboard: quality scores by inventory type, contradiction counts, coverage metrics, trend lines | Test: dashboard renders correctly for known graph states |

---

## Tech Stack Decision Strategy

Rather than choosing everything upfront, we use a **Last Responsible Moment** approach:

| Decision | When to make it | Criteria |
|---|---|---|
| Graph DB | End of Phase 0 (once port interface is stable and load profile is understood) | Query patterns, scale needs, team familiarity |
| Vector DB | Phase 1 (when retrieval is needed) | Embedding model choice, hybrid search needs |
| Workflow engine | Phase 2 (when orchestration pipelines are complex enough) | Durability needs, complexity of DAGs |
| LLM provider/model | Phase 1 (but abstracted behind gateway) | Cost, accuracy, latency; gateway allows switching |
| Deployment platform | Phase 1 (but containerised from start) | Team infra, cost, compliance constraints |

Each decision is captured as an ADR (Architecture Decision Record) in `/docs/adr/` with status, context, decision, and consequences.

---

## Views and Perspectives

The same inventory data supports multiple views, each serving specific user needs. For details on how these views are rendered in the UI application (interaction patterns, screen layouts, navigation), see **[UI & Backend Application Plan](ui-backend-plan.md)**.

| View | Purpose | Layers | User Story |
|---|---|---|---|
| Domain Map | Subdomains, bounded contexts, context relationships | L1 | "As a domain architect, I want to see how bounded contexts relate so that I can identify integration boundaries" |
| Capability Inventory | Business capabilities and ownership | L1 | "As a business analyst, I want to see all capabilities so that I can identify gaps and overlaps" |
| Decision Inventory | All decisions, their rules, inputs, outcomes | L1 + L2 | "As a compliance officer, I want to see all automated decisions so that I can verify regulatory alignment" |
| Vendor Coverage Map | Which vendor products cover which capabilities; gaps | L1 + L2 | "As a solution architect, I want to see vendor coverage so that I can identify build-vs-buy opportunities" |
| Compliance Matrix | Obligations vs. domain concept coverage and realisations | L1 + L2 + L3 | "As a regulatory lead, I want to trace obligations to implementations so that I can prove compliance" |
| System Landscape | All systems, their owners, capabilities supported | L3 | "As an operations engineer, I want to see all systems and their dependencies so that I can assess blast radius" |
| Behaviour Flow View | Orchestration flows, events, decisions, state machines | L3 | "As a developer, I want to see the end-to-end flow so that I can understand where my service fits" |
| Dependency Graph | Service-to-service and system-to-system dependencies | L3 | "As a platform engineer, I want to see dependencies so that I can plan upgrades safely" |
| Impact Assessment Report | Structured output of impact agent run | All layers | "As a change manager, I want to see what a regulation change affects so that I can plan the response" |
| Gap Analysis | Domain concepts not yet functionally or technically realised | L1 vs L2/L3 | "As a portfolio manager, I want to see unimplemented capabilities so that I can prioritise investment" |

---

## SDLC Cadence

- **2-week sprints** aligned to deliverable steps above
- **Each sprint**: starts with test definitions, ends with green tests + demo
- **Continuous integration**: every PR must pass schema validation + unit + contract tests
- **Weekly architecture review**: surface OCP violations, tech debt, decision points
- **Monthly stakeholder demo**: show new views/capabilities unlocked

---

## Key Design Principle

The system is not a document store. Every ingested artifact must ultimately contribute to populating, updating, or evidencing one or more typed inventory entries with explicit relationships. The document is the evidence; the inventory entry is the assertion. The graph connects assertions. The views interpret the graph. The agents reason over the graph.

Decisions are the highest-value nodes in the graph. They are where regulation bites, where business logic concentrates, where errors are most costly, and where impact assessment yields the most signal. The platform exists primarily to make decisions visible, traceable, and assessable.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM extraction accuracy insufficient for production use | Medium | High | Golden dataset evals from Phase 1; confidence thresholds gate auto-merge; human review queue |
| Ontology becomes too complex to maintain | Medium | Medium | Start minimal (L1 only), extend per OCP; schema validation prevents drift; weekly arch review |
| Graph becomes stale as source documents evolve | High | Medium | Staleness detection agent (Phase 5); source polling/webhook for change detection; TTL policies |
| Entity resolution produces false merges | Medium | High | Conservative thresholds; human approval for low-confidence merges; undo capability via event log |
| Performance degrades as graph grows | Low | Medium | Graph DB selection deferred until load profile known; indexing strategy; query optimisation budget |
| Breaking ontology changes after data exists | Low | High | Semantic versioning; additive-only minor versions; migration pipelines for major versions; bi-temporal model preserves history |
| Scope creep from multiple domain onboarding simultaneously | Medium | Medium | Single domain pilot (Payments) before expanding; domain packs isolated from core; clear phase gates |
| Vendor lock-in on graph DB or LLM provider | Low | Medium | Port/adapter architecture; abstract interfaces; gateway pattern for LLM; proven by Phase 0 OCP test |
| Team lacks DDD expertise | Medium | Medium | Domain architect role required; DDD training; ontology reviews; golden datasets encode correct classifications |
