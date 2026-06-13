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
| evidencedBy | Source evidence |

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
| `DomainConcept` | L1 | name, type (aggregate/entity/event/policy/invariant/command), subdomain, context |
| `BusinessCapability` | L1 | name, level, parent capability |
| `BusinessInvariant` | L1 | statement, governing context, severity |
| `Rule` | L1/L2 | expression, type (validation/decision/constraint), source |
| `Decision` | L1/L2 | name, type, inputs, rules, outcomes, owner |
| `ReferenceData` | L1/L2 | name, owner, update frequency, consuming concepts |
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

### Phase 0: Foundation (Weeks 1–3)

**Goal**: Establish the schema-first, test-first engineering scaffold.

| Step | Deliverable | TDD approach |
|---|---|---|
| 0.1 | Monorepo scaffold: package structure, tooling config (TS + Python), CI pipeline | Test: CI runs green on empty modules |
| 0.2 | Schema module: JSON Schema definitions for all Layer 1 inventory types (`DomainConcept`, `BusinessCapability`, `BusinessInvariant`, `Rule`, `ReferenceData`, `Decision`) | Test: schema validation passes for valid fixtures, rejects invalid |
| 0.3 | Relationship schema: typed edge definitions with cardinality constraints | Test: relationship validator accepts/rejects correctly |
| 0.4 | Schema extension mechanism: prove OCP by adding a new inventory type without modifying existing code | Test: extension point loads new type; existing tests still pass |
| 0.5 | Graph persistence interface (port): define abstract interface for graph storage | Test: port contract tests (against in-memory stub) |

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
| 5.1 | Contradiction agent | Test: detects known contradictions in test graph |
| 5.2 | Correction agent with confidence scoring | Test: proposes correct fixes for known issues |
| 5.3 | Auto-merge policy engine | Test: merges above threshold, queues below |
| 5.4 | Continuous eval harness | Test: metrics track over time |

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

The same inventory data supports multiple views:

| View | Purpose | Layers used |
|---|---|---|
| Domain Map | Subdomains, bounded contexts, context relationships | L1 |
| Capability Inventory | Business capabilities and ownership | L1 |
| Decision Inventory | All decisions, their rules, inputs, outcomes | L1 + L2 |
| Vendor Coverage Map | Which vendor products cover which capabilities; gaps | L1 + L2 |
| Compliance Matrix | Obligations vs. domain concept coverage and realisations | L1 + L2 + L3 |
| System Landscape | All systems, their owners, capabilities supported | L3 |
| Behaviour Flow View | Orchestration flows, events, decisions, state machines | L3 |
| Dependency Graph | Service-to-service and system-to-system dependencies | L3 |
| Impact Assessment Report | Structured output of impact agent run | All layers |
| Gap Analysis | Domain concepts not yet functionally or technically realised | L1 vs L2/L3 |

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
