# UI & Backend Application Plan

> **Relationship to main plan**: This document details the user-facing application layer — the web UI and its supporting backend API. It is scheduled to begin in **Phase 3** of the [main implementation plan](plan.md) and progresses incrementally through Phases 4 and 5. The main plan defines *what* data, views, and query patterns exist; this plan defines *how* users and administrators interact with them through a running application.

---

## Scope Boundary

To avoid duplication with the main plan, this document does **not** re-define:

- Inventory schemas or the domain model (see main plan: *Three-Layer Domain Model*, *Inventories*)
- View definitions and user stories (see main plan: *Views and Perspectives*)
- Search and retrieval strategy internals (see main plan: *Search and Retrieval Strategy*)
- Integration adapters and enterprise connectors (see main plan: *Enterprise Integration Strategy*)
- Agent logic (extraction, contradiction, impact) — this plan only defines how their outputs surface in the UI

This document **does** define:

- Backend API architecture (the service layer between the knowledge graph and the UI)
- UI application architecture, interaction patterns, and screen structure
- Natural-language question-answering interface
- Administration and governance console
- Authentication, authorisation, and multi-tenancy
- Observability of the application layer itself

---

## User Personas

| Persona | Primary Goals | Key Workflows |
|---|---|---|
| Domain Architect | Explore and validate the domain model | Browse domain map, inspect relationships, run gap analysis |
| Compliance Officer | Trace regulatory obligations to implementations | Query compliance matrix, review decision inventory, export audit evidence |
| Solution Architect | Assess vendor coverage and plan changes | Browse vendor map, run impact assessments, compare options |
| Developer | Understand how a service fits in the bigger picture | Search behaviour flows, trace dependencies, inspect orchestration |
| Platform Engineer | Plan upgrades and understand blast radius | View dependency graph, run impact queries, review system landscape |
| Knowledge Administrator | Manage ingestion, quality, and governance | Configure sources, review quality scores, approve/reject corrections, manage schemas |
| Executive Stakeholder | High-level health and coverage metrics | View dashboards, review KPIs, track gap closure over time |

---

## Backend API Architecture

### Design Principles

1. **API-first**: The backend is a thin, stateless service layer between the knowledge graph and consumers (UI, CLI, CI integrations). It does not duplicate graph logic — it orchestrates queries and transforms results for presentation.
2. **GraphQL primary, REST secondary**: GraphQL for the rich, relationship-heavy domain; REST endpoints for simple operations (health, auth, webhooks, file upload).
3. **Query delegation**: The API translates UI requests into the query patterns defined in the main plan's *Search and Retrieval Strategy*. It does not re-implement search — it calls the retrieval layer.
4. **Event-driven updates**: The backend subscribes to the knowledge graph event log (defined in main plan: *Knowledge Graph Event Log*) to push real-time updates to connected UI clients via WebSockets.

### API Domains

| Domain | Responsibility | Key Operations |
|---|---|---|
| **Graph Query** | Serve inventory items, relationships, traversals | `getEntry`, `traverse`, `search`, `facetedBrowse` |
| **View Projection** | Materialise the views defined in the main plan into UI-ready structures | `getDomainMap`, `getComplianceMatrix`, `getCoverageMap`, etc. |
| **Question Answering** | Accept natural-language questions, route to NL→query pipeline | `askQuestion` (returns structured answer + provenance) |
| **Ingestion Management** | CRUD for sources, trigger/monitor ingestion runs | `listSources`, `addSource`, `triggerIngestion`, `getIngestionStatus` |
| **Quality & Governance** | Surface quality scores, corrections queue, approval workflows | `getQualityDashboard`, `listCorrections`, `approveCorrection` |
| **Admin** | User/role management, schema configuration, system health | `listUsers`, `assignRole`, `getSystemHealth` |
| **Export** | Generate reports, export views as PDF/CSV/JSON | `exportView`, `generateReport` |

### Authentication & Authorisation

- **AuthN**: OIDC/OAuth 2.0 integration (supports corporate IdP — Azure AD, Okta, Keycloak)
- **AuthZ**: Role-Based Access Control (RBAC) with inventory-level granularity
  - Roles: `viewer`, `contributor`, `domain_steward`, `admin`
  - Permissions scoped to: inventory type, bounded context, layer
  - Example: a domain steward for "Payments" can approve corrections within that bounded context but not others
- **API keys**: For CI/CD and programmatic access (scoped to specific operations)
- **Audit log**: All mutations logged with actor, timestamp, and change payload

### Real-Time Communication

- **WebSocket subscriptions**: Clients subscribe to change streams scoped by inventory type, bounded context, or view
- **Use cases**: live quality score updates, ingestion progress, correction queue notifications
- **Fallback**: Server-Sent Events (SSE) for environments where WebSockets are restricted

---

## UI Application Architecture

### Technology Considerations

Following the main plan's *Last Responsible Moment* approach, the UI framework choice is deferred until Phase 3 begins. The architecture is framework-agnostic and defines component responsibilities, not implementations.

**Decision criteria** (to be captured in ADR when the moment arrives):
- Team familiarity and hiring pool
- Graph/network visualisation library ecosystem
- Server-side rendering needs (SEO is unlikely, but initial load performance matters)
- Accessibility compliance requirements

### Application Shell

| Component | Responsibility |
|---|---|
| **Navigation** | Persona-driven navigation: each persona sees a tailored primary menu; all views remain accessible via search |
| **Search Bar** | Global, always-present. Supports both structured queries and natural-language questions. Auto-suggests entities as user types |
| **Context Panel** | Slide-out detail panel for inspecting any selected inventory entry without leaving the current view |
| **Breadcrumb / Trail** | Shows the user's traversal path through the graph so they can backtrack |
| **Notification Centre** | Surfaces real-time events: ingestion complete, correction proposed, quality alert |

### Screen Structure

Screens are organised around the views defined in the main plan. Each view in the main plan's *Views and Perspectives* table becomes a screen (or set of screens) in the UI. This plan defines the *interaction patterns* for those screens, not the data content (which is already defined).

#### 1. Knowledge Explorer

**Purpose**: The primary browsing and discovery interface for all personas.

- **Graph canvas**: Interactive node-link visualisation of inventory entries and relationships
  - Pan, zoom, filter by layer/type/context
  - Click node → context panel shows full entry detail
  - Expand node → load connected entries on demand (lazy graph expansion)
  - Layout modes: force-directed, hierarchical (by layer), radial (from selected node)
- **List/table mode**: Toggle between graph visualisation and tabular listing with sort/filter/group
- **Faceted filters**: Layer, inventory type, lifecycle status, owner, confidence score, date range
- **Saved views**: Users can save filter/layout combinations as personal or shared bookmarks

#### 2. Question & Answer Interface

**Purpose**: Natural-language interaction with the knowledge graph.

- **Chat-style interface**: User types a question; system returns a structured answer with:
  - Direct answer text
  - Supporting evidence (links to inventory entries and source documents)
  - Confidence indicator
  - Related questions (suggested follow-ups)
- **Answer provenance**: Every claim in the answer links back to specific inventory entries and their source evidence
- **Conversation memory**: Within a session, follow-up questions have context of the conversation
- **Example queries surfaced**: Persona-specific example questions to help new users understand capabilities

#### 3. View Screens (one per main-plan view)

Each view from the main plan gets a dedicated screen with interaction tailored to its purpose:

| View Screen | Key Interactions |
|---|---|
| Domain Map | Drill into subdomains; click context to see contained concepts; highlight cross-context relationships |
| Capability Inventory | Group by domain; filter by coverage status; click to see realisations |
| Decision Inventory | Filter by type/owner/status; click to see full decision detail with rules and outcomes |
| Vendor Coverage Map | Matrix with heatmap colouring by coverage %; click cell for detail |
| Compliance Matrix | Obligation rows × realisation columns; RAG status colouring; drill to evidence |
| System Landscape | Cluster by bounded context; show dependency edges; click for service detail |
| Behaviour Flow View | Swimlane or sequence visualisation; highlight decision points; click step for detail |
| Dependency Graph | Service graph with directional edges; blast radius highlighting on selection |
| Impact Assessment | Wizard-style: select trigger document → view affected graph → export report |
| Gap Analysis | Domain concepts with coverage indicators; drill to see what's missing and why |

#### 4. Administration Console

**Purpose**: For Knowledge Administrators to manage the platform.

- **Source Management**
  - List configured sources (file systems, wikis, APIs, git repos)
  - Add/edit/remove sources
  - View ingestion history per source (runs, outcomes, error counts)
  - Trigger manual re-ingestion
  - Schedule configuration (polling intervals, webhook registration)

- **Quality Dashboard**
  - Aggregate quality scores by inventory type, layer, bounded context
  - Trend lines over time
  - Contradiction count and list (link to contradicting entries)
  - Staleness alerts (entries with outdated provenance)
  - Coverage metrics (% of domain concepts with L2/L3 realisations)

- **Corrections Queue**
  - List of proposed corrections from agents (contradiction resolution, staleness fixes)
  - Each correction shows: current state, proposed state, confidence, provenance, impact
  - Actions: approve, reject, edit-and-approve, escalate
  - Batch operations for high-confidence corrections

- **Schema Management**
  - View current inventory type schemas and their versions
  - Preview proposed schema changes (from extension mechanism)
  - View schema change history

- **User & Role Management**
  - CRUD for users and role assignments
  - View audit log of administrative actions
  - Manage API keys

- **System Health**
  - Backend service status, queue depths, processing latencies
  - Graph store health metrics
  - Vector index health and embedding freshness

---

## Natural-Language Question Answering — Application Layer

> The NL→query translation and hybrid retrieval mechanics are defined in the main plan's *Search and Retrieval Strategy*. This section covers only the application-layer concerns.

### Interaction Flow

```
User question (text)
    ↓
Backend API: /askQuestion
    ↓
NL→Query pipeline (main plan's retrieval architecture)
    ↓
Structured result set (entries, paths, scores)
    ↓
Answer synthesis: format results into human-readable response
    ↓
UI renders: answer + provenance links + confidence + follow-ups
```

### Application-Layer Responsibilities

1. **Session management**: Maintain conversation context so follow-up questions resolve correctly
2. **Answer formatting**: Transform raw retrieval results into coherent prose with inline citations
3. **Confidence communication**: Translate numeric confidence scores into user-friendly indicators (high/medium/low with explanation)
4. **Guardrails**: Detect when a question is out of scope (not answerable from the knowledge graph) and respond helpfully
5. **Feedback loop**: Users can rate answers (helpful/not helpful); feedback feeds into retrieval quality metrics

---

## Phasing & Integration with Main Plan

The UI and backend are **not** a separate workstream bolted on at the end. They grow incrementally alongside the core platform:

| Main Plan Phase | UI/Backend Deliverables |
|---|---|
| **Phase 1** (Weeks 4–7) | The "query interface" (step 1.4) is the **first backend API endpoint**. The "first view" (step 1.5) is the **first UI screen** (Domain Map). These are defined in the main plan and delivered there — this plan provides no additional scope for Phase 1. |
| **Phase 2** (Weeks 8–11) | The "behaviour flow view" (step 2.4) adds a second UI screen. Cross-layer traversal (step 2.5) enables the graph canvas. Still within main plan scope. |
| **Phase 3** (Weeks 12–14) | **UI/Backend plan scope begins**. Alongside the main plan's coverage and gap views, deliver: Application shell (navigation, search bar, context panel), GraphQL API layer wrapping existing query interface, Authentication integration, Knowledge Explorer (graph canvas + list mode). |
| **Phase 4** (Weeks 15–18) | Alongside main plan's impact assessment: Question & Answer interface, Impact Assessment wizard screen, Export capability (reports as PDF/CSV). |
| **Phase 5** (Weeks 19–22) | Alongside main plan's quality + scale: Administration console (full), Quality dashboard, Corrections queue with approval workflow, Real-time updates (WebSockets), Role-based access control enforcement. |

### Phase 3 Detailed Steps (UI/Backend scope)

| Step | Deliverable | TDD approach |
|---|---|---|
| UI-3.1 | Application shell: navigation, search bar, breadcrumb, notification centre | Test: component renders; navigation routes resolve; search dispatches queries |
| UI-3.2 | GraphQL API schema: types for inventory entries, relationships, views | Test: schema validates; resolvers return expected data for seeded graph |
| UI-3.3 | Authentication integration: OIDC flow, session management, role mapping | Test: auth flow completes; unauthenticated requests rejected; roles map correctly |
| UI-3.4 | Knowledge Explorer — graph canvas: render nodes/edges, pan/zoom/filter | Test: canvas renders for seeded graph; filter reduces visible nodes correctly |
| UI-3.5 | Knowledge Explorer — list/table mode with faceted filters | Test: table shows correct entries; filters narrow results; sort works |
| UI-3.6 | Context panel: display full entry detail on selection | Test: panel shows correct data for selected entry; relationships listed |

### Phase 4 Detailed Steps (UI/Backend scope)

| Step | Deliverable | TDD approach |
|---|---|---|
| UI-4.1 | Q&A interface: chat input, answer display with provenance links | Test: question submission returns answer; provenance links resolve to entries |
| UI-4.2 | Answer synthesis service: format retrieval results into prose with citations | Test: synthesis produces expected output for known retrieval results |
| UI-4.3 | Conversation session management: follow-up question context | Test: follow-up resolves correctly given conversation history |
| UI-4.4 | Impact Assessment wizard: document upload → affected graph → report | Test: wizard flow produces expected report for known impact scenario |
| UI-4.5 | Export service: generate PDF/CSV/JSON from view projections | Test: exported files match expected format and content |

### Phase 5 Detailed Steps (UI/Backend scope)

| Step | Deliverable | TDD approach |
|---|---|---|
| UI-5.1 | Admin console — source management: CRUD, ingestion history, manual trigger | Test: source CRUD works; ingestion trigger fires pipeline; history displays |
| UI-5.2 | Admin console — quality dashboard: scores, trends, contradiction counts | Test: dashboard renders correct metrics for known graph state |
| UI-5.3 | Admin console — corrections queue: list, approve/reject, batch operations | Test: approval updates graph; rejection preserves state; batch works |
| UI-5.4 | WebSocket real-time updates: subscribe to changes, push to UI | Test: mutation in graph → WebSocket message → UI update |
| UI-5.5 | RBAC enforcement: permission checks on all API operations | Test: unauthorised operations rejected; scoped access works correctly |
| UI-5.6 | Admin console — user/role management and audit log | Test: role assignment persists; audit log records actions |

---

## Non-Functional Requirements

### Performance

| Metric | Target |
|---|---|
| Initial page load (cached) | < 2s |
| Graph canvas render (1000 nodes) | < 3s |
| Search results (P95) | < 500ms |
| Q&A answer (P95) | < 5s (includes LLM inference) |
| Real-time update delivery | < 1s from graph mutation |

### Accessibility

- WCAG 2.1 AA compliance minimum
- Keyboard navigation for all interactions
- Screen reader support for graph visualisation (alternative tabular representation)
- High-contrast mode

### Responsiveness

- Primary target: desktop (1280px+) — knowledge work is primarily desktop
- Tablet support: read-only browsing and Q&A
- Mobile: notification centre and Q&A only

### Internationalisation

- UI text externalised from day one (i18n-ready)
- Graph content displayed as stored (no translation of domain terms)
- Date/number formatting respects locale

---

## Tech Stack Decision Strategy

Following the main plan's *Last Responsible Moment* approach:

| Decision | When to make it | Criteria |
|---|---|---|
| UI framework (React/Vue/Svelte/etc.) | Start of Phase 3 | Team familiarity, graph viz library ecosystem, component library maturity |
| Graph visualisation library | Start of Phase 3 | Performance at scale, customisation, layout algorithms, accessibility |
| GraphQL server framework | Start of Phase 3 | Language alignment with backend (TS), schema-first support, subscription support |
| Component library / design system | Start of Phase 3 | Accessibility, customisation, bundle size |
| Real-time transport | Start of Phase 5 | Scale requirements, infrastructure constraints, fallback needs |

Each decision captured as an ADR in `/docs/adr/` per the main plan's convention.

---

## Risks and Mitigations (Application-Layer Specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Graph visualisation performance degrades with large graphs | High | Medium | Lazy loading (expand on demand), server-side layout computation, level-of-detail rendering, virtual viewport |
| NL Q&A produces misleading answers | Medium | High | Mandatory provenance on every answer; confidence indicators; "I don't know" when below threshold; feedback loop |
| RBAC complexity slows development | Medium | Low | Start with coarse roles (viewer/admin); refine granularity in Phase 5; use policy engine (OPA/Cedar) |
| UI becomes a bottleneck for backend development | Low | Medium | API-first: backend API usable independently; UI is one consumer among many (CLI, CI, exports) |
| Accessibility of graph visualisation is insufficient | Medium | Medium | Alternative tabular/list representations; ARIA annotations; accessibility audit in Phase 3 |
