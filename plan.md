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

**Layer 0 — Strategic Alignment (Organisational Purpose)**
- Strategic initiatives, value streams, stakeholder maps, value impact maps, product roadmaps, north star roadmaps
- The "why" layer: connects domain knowledge to business strategy, investment decisions, and cross-domain coordination
- Scoped at business unit level, coordinating across sub-domains
- See [Strategic Alignment & Coordination](#strategic-alignment--coordination) for full detail

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

## Strategic Alignment & Coordination

The domain model does not exist in a vacuum. It must connect upward to strategic intent and coordinate horizontally across sub-domains within a business unit. This section defines the strategic overlay that binds domain knowledge to organisational purpose.

### Strategic Concepts

| Concept | Purpose |
|---|---|
| **Strategic Initiative** | A time-bound, funded programme of work aligned to business strategy. Initiatives decompose into outcomes delivered across sub-domains. |
| **Value Stream** | An end-to-end sequence of activities that delivers value to a customer or stakeholder. Cuts across bounded contexts and sub-domains. |
| **Value Stream Stage** | A discrete phase within a value stream (e.g., onboard, transact, settle, report). Each stage maps to one or more bounded contexts. |
| **Stakeholder Map** | A structured view of actors (people, teams, organisations, systems) who influence, are affected by, or depend on a value stream, initiative, or sub-domain. Captures interest, influence, and engagement model. |
| **Value Impact Map** | A goal-oriented model linking strategic goals → actors → impacts (behaviour changes) → deliverables → measurable outcomes. Provides traceability from strategy to delivery. |
| **Product Roadmap** | A time-phased plan of features/capabilities for a specific sub-domain or product, aligned to strategic initiatives and value stream improvements. |
| **North Star Roadmap** | A cross-sub-domain, business-unit-level coordination plan that synchronises multiple product roadmaps toward shared strategic outcomes. Expresses sequencing, dependencies, and milestone alignment across teams. |

### How Strategic Concepts Relate to the Domain Model

```
Strategic Initiative
    ├── targets → Value Stream (improvement area)
    ├── decomposes into → North Star Roadmap milestones
    └── funded by → Business Unit

North Star Roadmap
    ├── coordinates → Product Roadmap (per sub-domain)
    ├── aligned to → Strategic Initiative
    └── sequences → cross-domain milestones

Product Roadmap
    ├── plans delivery of → BusinessCapability / DomainConcept (L1)
    ├── scoped to → BoundedContext / Subdomain
    └── informed by → Value Impact Map

Value Stream
    ├── composed of → Value Stream Stages
    ├── maps to → BoundedContext (per stage)
    ├── realised by → Service / OrchestrationFlow (L3)
    └── measured by → Value metrics

Value Impact Map
    ├── traces → Strategic Goal → Actor → Impact → Deliverable
    ├── references → Stakeholder Map actors
    └── justifies → Product Roadmap items

Stakeholder Map
    ├── scoped to → Value Stream / Initiative / Subdomain
    ├── identifies → actors with influence/interest
    └── informs → governance, communication, prioritisation
```

### Why This Matters

Without strategic alignment, the knowledge graph answers "what exists?" and "what is affected?" but cannot answer:
- "Why are we building this?" (traceability to strategic intent)
- "Who cares about this change?" (stakeholder impact)
- "What is the sequence and coordination plan?" (roadmap alignment)
- "How does this sub-domain's work contribute to the bigger picture?" (north star alignment)
- "Where does value flow and where are the bottlenecks?" (value stream visibility)

These are the questions that executives, portfolio managers, and business unit leads ask daily.

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
| `StrategicInitiative` | L0 (Strategy) | name, business unit, strategic goal, timeframe, funded status, target value streams, success metrics |
| `ValueStream` | L0/L1 | name, customer/stakeholder, stages, owning business unit, value metrics, current maturity |
| `ValueStreamStage` | L0/L1 | name, sequence, owning bounded context(s), inputs, outputs, cycle time target |
| `StakeholderMap` | L0 | scope (initiative/value stream/subdomain), actors, interest level, influence level, engagement model |
| `ValueImpactMap` | L0 | strategic goal, target actors, desired impacts, planned deliverables, measurable outcomes |
| `ProductRoadmap` | L0/L1 | name, owning subdomain/product, time horizon, planned capabilities, aligned initiatives |
| `NorthStarRoadmap` | L0 | name, business unit, coordinated subdomains, milestones, cross-domain dependencies, aligned initiatives |

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

### Strategic / Coordination

- `targets(StrategicInitiative → ValueStream)` — which value streams an initiative aims to improve
- `funds(StrategicInitiative → ProductRoadmap)` — what delivery is funded by the initiative
- `coordinatedBy(ProductRoadmap → NorthStarRoadmap)` — how sub-domain roadmaps roll up
- `composedOf(ValueStream → ValueStreamStage)` — stages within a value stream
- `mapsTo(ValueStreamStage → BoundedContext)` — which domain context owns a stage
- `realises(Service/OrchestrationFlow → ValueStreamStage)` — technical realisation of a stage
- `justifies(ValueImpactMap → ProductRoadmap item)` — why a roadmap item exists
- `identifies(StakeholderMap → Actor)` — actors relevant to a scope
- `influences(StakeholderMap → ValueStream/StrategicInitiative)` — governance scope
- `aligns(NorthStarRoadmap → StrategicInitiative)` — strategic traceability
- `dependsOn(ProductRoadmap milestone → ProductRoadmap milestone)` — cross-subdomain sequencing

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
| 0b.4 | Loader interface (port): define abstract loader interface that reads intermediate JSONL and writes to a target store; prove with graph loader stub | Test: loader contract tests pass; stub correctly maps JSONL entries to store operations |
| 0b.5 | Quality scoring framework: composite quality score computation for inventory entries | Test: score correctly computed for entries with known quality dimensions |

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

**Goal**: One complete path from source document → intermediate JSONL → loader → graph → queryable view.

| Step | Deliverable | TDD approach |
|---|---|---|
| 1.1 | Source connector: file/markdown ingestion adapter (plugin interface) | Test: adapter produces canonical output for fixture inputs |
| 1.2 | Enrichment module: LLM-based extraction producing **intermediate JSONL output** conforming to the fixed-core schema (see *Intermediate JSONL Format & Multi-Store Loader Architecture*) | Test: extraction against golden dataset meets the Phase 1 precision/recall **floor** set in [D-P1.5](docs/phase-1/decisions.md) (entities P≥0.85/R≥0.70, auto-merge-band precision ≥0.90; relationships P≥0.75/R≥0.60); JSONL output validates against schema |
| 1.3 | Graph loader: first loader implementation reading from intermediate JSONL and populating graph store (start with lightweight: e.g., in-memory or SQLite-backed for dev, Neo4j for integration) | Test: loader contract tests pass; JSONL→graph round-trip produces expected state |
| 1.4 | Query interface: simple API to retrieve inventory items and traverse relationships | Test: query returns expected results for seeded graph |
| 1.5 | First view: Domain Map view projection from graph | Test: view output matches expected structure for known graph state |
| 1.6 | **Diagram exporter + demo CLI** ([D-P1.6](docs/phase-1/decisions.md)): render the Domain Map (or graph) as a viewable **PlantUML** DDD diagram; a one-command CLI runs connector→extraction→loader→projection→diagram on a small Payments doc set — the *visible* end of the slice | Test: exporter emits valid PlantUML for a known graph; demo CLI produces a diagram end-to-end |

> **Demo-first sequencing ([D-P1.6](docs/phase-1/decisions.md)):** step 1.5's Domain Map view emits UI-ready *JSON, not a viewable diagram* — so step **1.6** (exporter + demo CLI) is added as the first meaningful, *visible* goal, and the OCP validation below is **deferred until after** it. Build order: 1.1 ✅ → 1.2 ✅ → 1.3 ✅ → minimal 1.4 → 1.5 → 1.6 → OCP (second connector, second loader).

**OCP validation** (deferred until after step 1.6 per [D-P1.6](docs/phase-1/decisions.md); still required): add a second connector (e.g., JSON ingestion) — must work without modifying core pipeline code, only adding a new adapter. Add a second loader (e.g., in-memory vector store) — must work without modifying extraction or the first loader.

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

### Phase 6: Strategic Alignment & Coordination (Weeks 23–26)

**Goal**: Populate the strategic overlay — value streams, stakeholder maps, value impact maps, roadmaps — and enable cross-subdomain coordination views aligned to strategic initiatives.

| Step | Deliverable | TDD approach |
|---|---|---|
| 6.1 | Strategic inventory schemas: `StrategicInitiative`, `ValueStream`, `ValueStreamStage`, `StakeholderMap`, `ValueImpactMap`, `ProductRoadmap`, `NorthStarRoadmap` | Test: schema validation passes for valid fixtures, rejects invalid |
| 6.2 | Value stream mapping: ingestion of value stream definitions, stage decomposition, mapping stages to bounded contexts | Test: extraction produces correct stage→context mappings for golden inputs |
| 6.3 | Stakeholder map extraction: identify actors, interest/influence levels from initiative and programme documentation | Test: actor extraction accuracy on labelled samples |
| 6.4 | Value impact map construction: trace strategic goal → actor → impact → deliverable from programme documents | Test: impact map matches expected structure for known strategic documents |
| 6.5 | Roadmap ingestion: product roadmaps linked to sub-domains, north star roadmap coordinating across sub-domains | Test: roadmap items link correctly to capabilities and initiatives; cross-domain dependencies identified |
| 6.6 | Strategic views: value stream map, stakeholder map, north star roadmap, strategic initiative dashboard | Test: views render correctly for seeded strategic graph |
| 6.7 | Cross-domain dependency detection: identify sequencing constraints and milestone dependencies across product roadmaps | Test: dependency agent correctly identifies known cross-domain blockers in test data |

**Key Principle**: Strategic artifacts are first-class inventory entries with full provenance, versioning, and lifecycle — not freestanding documents. A roadmap item is linked to the capabilities it delivers, the initiative that funds it, and the value stream stage it improves. This enables impact assessment to flow from strategy changes downward through the entire graph.

---

## Tech Stack Decision Strategy

Rather than choosing everything upfront, we use a **Last Responsible Moment** approach:

| Decision | When to make it | Criteria |
|---|---|---|
| Graph DB | End of Phase 0 (once port interface is stable and load profile is understood) | Query patterns, scale needs, team familiarity |
| Vector DB | Phase 1 (when retrieval is needed) | Embedding model choice, hybrid search needs |
| Relational DB (PostgreSQL) | Phase 3 (when admin/reporting needs materialise) | Structured query needs, RBAC, audit requirements |
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
| Value Stream Map | End-to-end value flow with stages, owning contexts, cycle times, bottlenecks | L0 + L1 + L3 | "As a business unit lead, I want to see how value flows across sub-domains so that I can identify optimisation opportunities" |
| Stakeholder Map | Actors, their interest/influence, engagement model for a given scope | L0 | "As a programme manager, I want to see who is affected by and can influence an initiative so that I can plan engagement" |
| Value Impact Map | Strategic goal → actor → impact → deliverable traceability | L0 + L1 | "As a product owner, I want to trace planned features back to strategic goals so that I can justify priorities" |
| Product Roadmap View | Time-phased capability delivery plan for a sub-domain | L0 + L1 | "As a delivery lead, I want to see what my team is building and when so that I can manage dependencies" |
| North Star Roadmap | Cross-subdomain coordination: milestones, dependencies, strategic alignment | L0 | "As a business unit CTO, I want to see how all sub-domain roadmaps align to our strategic initiatives so that I can ensure coordinated delivery" |
| Strategic Initiative Dashboard | Initiative health: progress against value stream targets, roadmap status, stakeholder sentiment | L0 | "As a strategy lead, I want to see initiative progress against outcomes so that I can course-correct early" |

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

## Intermediate JSONL Format & Multi-Store Loader Architecture

### Core Principle: Extract Once, Load Many

All extraction and enrichment pipelines produce their output as an **intermediate JSONL file** — not directly into any final storage system. This intermediate format is the single canonical handoff point between extraction and storage. Loaders then consume this JSONL to populate whichever final storage system(s) are appropriate for the use case.

```
Source Documents → Extraction/Enrichment → Intermediate JSONL → Loaders → Final Storage(s)
                                                                   ├─→ PostgreSQL (structured inventory, queries, audit)
                                                                   ├─→ Vector/RAG store (semantic search, embeddings)
                                                                   ├─→ Neo4j / Graph DB (relationships, traversals)
                                                                   └─→ Future stores (as use cases demand)
```

### Intermediate JSONL Schema

Each line in the JSONL file is a self-contained JSON object representing one extracted knowledge entry. The schema has a **fixed core** (required fields that every entry must have) and is **open to extension** (additional fields may be added per inventory type without breaking existing consumers).

**Fixed core fields** (required on every entry):

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Unique identifier for this extraction |
| `type` | string | Inventory type (e.g., `DomainConcept`, `Decision`, `Rule`, `Relationship`) |
| `version` | string | Schema version of this entry (semver) |
| `source` | object | Provenance: `{ file, location, fetchedAt, sourceAuthority }` |
| `confidence` | number (0.0–1.0) | Extraction confidence score |
| `extractedAt` | ISO 8601 timestamp | When this extraction was produced |
| `data` | object | The typed payload (schema varies by `type`) |

**Extension mechanism**:
- The `data` object is typed per `type` field and conforms to the inventory type schema defined in Phase 0a
- Additional top-level fields beyond the fixed core are permitted (open schema) — loaders ignore fields they don't recognise
- A `metadata` field (object, optional) is reserved for pipeline-specific annotations (e.g., extraction model version, run ID, batch ID)
- New fields are additive only — existing fields are never removed or renamed (follows OCP)

**Example JSONL entry**:
```json
{"id":"a1b2c3d4-...","type":"Decision","version":"1.0.0","source":{"file":"decision-log.csv","location":"row:1","fetchedAt":"2024-06-01T10:00:00Z","sourceAuthority":"project"},"confidence":0.92,"extractedAt":"2024-06-01T12:30:00Z","data":{"name":"CSM Selection","status":"ACCEPTED","context":"Need to connect to SEPA Instant clearing","outcomes":["Selected TIPS as primary CSM"],"owner":"Architecture Board"},"metadata":{"runId":"run-0042","model":"gpt-4o","batchId":"batch-007"}}
```

### Loader Architecture

Loaders are independent, pluggable components that read from the intermediate JSONL and write to a specific storage backend. Each loader:

1. **Reads the same JSONL format** — no loader requires a different extraction output
2. **Is responsible for its own transformation** — maps the canonical JSONL structure to its target store's native format (e.g., SQL rows, graph nodes/edges, vector embeddings)
3. **Is independently deployable and testable** — a loader can be added, removed, or updated without affecting extraction or other loaders
4. **Implements a common loader interface** (port) — enabling consistent orchestration, error handling, and monitoring

**Planned storage targets** (best fit per use case):

| Store | Use Case | Why |
|---|---|---|
| **PostgreSQL** | Structured inventory queries, audit trail, RBAC, reporting, administrative data | Relational strength: joins, transactions, mature tooling |
| **Vector/RAG store** | Semantic search, NL question answering, similarity-based retrieval | Embedding-native: fast ANN search, hybrid retrieval |
| **Neo4j / Graph DB** | Relationship traversal, impact analysis, dependency graphs, cross-layer linking | Graph-native: multi-hop queries, pattern matching, path analysis |

Additional storage targets may be introduced as use cases emerge — the architecture explicitly supports this via the loader plugin interface.

### Design Constraints

- **JSONL is the contract**: Extraction pipelines MUST NOT write directly to final storage. The intermediate JSONL is the single integration boundary.
- **Loaders are idempotent**: Re-running a loader against the same JSONL produces the same end state (supports replay and recovery).
- **Loaders declare their required fields**: Each loader specifies which JSONL fields it consumes, enabling validation that the extraction pipeline produces what loaders need.
- **JSONL files are immutable once written**: A completed extraction run produces a JSONL file that is never modified. Re-extraction produces a new file.
- **Ordering**: JSONL entries within a file are ordered by extraction sequence. Loaders may process in any order unless they declare ordering dependencies.

### Relationship to Phases

- **Phase 0b**: Loader interface (port) defined alongside graph persistence port
- **Phase 1**: First extraction pipeline outputs JSONL; first loader populates graph store from JSONL
- **Phase 3+**: Additional loaders introduced as storage targets are selected (vector DB for search, PostgreSQL for admin/reporting)
- **Phase 5**: Loader orchestration refined for incremental updates and replay

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM extraction accuracy insufficient for production use | Medium | High | Golden dataset evals from Phase 1 gated on the [D-P1.5](docs/phase-1/decisions.md) quality floor; confidence thresholds gate auto-merge (strict auto-merge-band precision); human review queue absorbs lower-confidence extractions |
| Ontology becomes too complex to maintain | Medium | Medium | Start minimal (L1 only), extend per OCP; schema validation prevents drift; weekly arch review |
| Graph becomes stale as source documents evolve | High | Medium | Staleness detection agent (Phase 5); source polling/webhook for change detection; TTL policies |
| Entity resolution produces false merges | Medium | High | Conservative thresholds; human approval for low-confidence merges; undo capability via event log |
| Performance degrades as graph grows | Low | Medium | Graph DB selection deferred until load profile known; indexing strategy; query optimisation budget |
| Breaking ontology changes after data exists | Low | High | Semantic versioning; additive-only minor versions; migration pipelines for major versions; bi-temporal model preserves history |
| Scope creep from multiple domain onboarding simultaneously | Medium | Medium | Single domain pilot (Payments) before expanding; domain packs isolated from core; clear phase gates |
| Vendor lock-in on graph DB or LLM provider | Low | Medium | Port/adapter architecture; abstract interfaces; gateway pattern for LLM; proven by Phase 0 OCP test |
| Team lacks DDD expertise | Medium | Medium | Domain architect role required; DDD training; ontology reviews; golden datasets encode correct classifications |
| Strategic artifacts become disconnected from delivery reality | High | Medium | Bidirectional linking: roadmap items must reference capabilities; staleness detection applies to strategic entries; quarterly strategic alignment reviews |
| North star roadmap coordination overhead across sub-domains | Medium | Medium | Start with single business unit pilot; lightweight coordination (milestone dependencies only); automate dependency detection from graph |
