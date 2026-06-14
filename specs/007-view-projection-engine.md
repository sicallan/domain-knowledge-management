# 007 — View Projection Engine

## Purpose & Scope

The View Projection Engine materialises the typed views defined in the plan (Domain Map, Compliance Matrix, Vendor Coverage Map, etc.) from raw graph data into structured, UI-ready data structures. Each view is a purpose-built projection of the knowledge graph, optimised for a specific user need.

**In scope:**
- View definition registry (what views exist and their configuration)
- Projection logic (graph queries → view-specific data structures)
- View refresh strategy (when and how views are recomputed)
- View-specific aggregation, scoring, and formatting
- View caching and invalidation
- Extension point: adding new views without modifying existing code

> **Proposed (pending [ADR-0001](../docs/adr/0001-intermediate-jsonl-vs-okf-interchange.md)):** an **OKF Knowledge Bundle** projection target. Because the engine already materialises views from the graph, exporting a scope (e.g. a bounded context or domain map) as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle of Markdown + YAML-frontmatter concepts is just another projection — for human browsing, agent/RAG consumption, cross-org interchange, and builder-agent hand-off. Our typed relationships are preserved via a DKM OKF *profile* (typed `relationships:` frontmatter); plain OKF degrades them to markdown links. Implementation deferred to the proposed *spec 017 — OKF Import/Export Adapter*.

**Out of scope:**
- UI rendering of views (that's the Knowledge Explorer / UI spec)
- Raw graph queries (that's the Query Interface spec)
- GraphQL schema for serving views (that's the GraphQL API Layer spec)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| View request | GraphQL API Layer (via Query Interface) | `{ viewType, parameters, filters }` |
| Graph data | Query Interface | Subgraphs, traversal results, filtered entries |
| View configuration | View registry | Projection rules, aggregation logic, scoring weights |
| Graph mutation events | Event log | For cache invalidation and incremental refresh |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Materialised view data | GraphQL API Layer → UI | Typed view-specific structure (see per-view schemas below) |
| View freshness metadata | UI, admin | `{ lastRefreshed, staleSince, entriesIncluded }` |

---

## Behaviour

### View Registry

Each view is registered with:
- **Type identifier**: e.g., `domain-map`, `compliance-matrix`, `vendor-coverage`
- **Required query patterns**: What graph queries compose the view
- **Parameters**: Configurable inputs (scope, filters, date range)
- **Aggregation rules**: How raw data is summarised for the view
- **Refresh policy**: On-demand, periodic, or event-triggered

### View Projection Pattern

Every view projector implements:

```typescript
interface ViewProjector<TParams, TResult> {
  readonly viewType: string;
  
  // Project the view from graph data
  project(params: TParams, context: QueryContext): Promise<TResult>;
  
  // Which graph events invalidate this view's cache
  invalidatedBy(event: GraphMutationEvent): boolean;
}
```

### Defined Views

| View | Key Data | Parameters |
|------|----------|------------|
| **Domain Map** | Subdomains, bounded contexts, context relationships, contained concepts | `{ subdomain?, depth }` |
| **Capability Inventory** | Capabilities tree, ownership, realisation status | `{ domain?, level? }` |
| **Decision Inventory** | Decisions with rules, inputs, outcomes, owners | `{ context?, status?, type? }` |
| **Vendor Coverage Map** | Domain concepts × vendor coverage matrix with gap indicators | `{ vendor?, domain? }` |
| **Compliance Matrix** | Regulatory obligations × domain concept × realisation coverage | `{ regulation?, domain? }` |
| **System Landscape** | Systems, services, dependencies, owners | `{ context?, team? }` |
| **Behaviour Flow View** | Orchestration steps, events, decisions, state transitions | `{ flowId }` |
| **Dependency Graph** | Service-to-service edges, direction, criticality | `{ service?, depth? }` |
| **Impact Assessment** | Affected nodes, paths, scores from a trigger point | `{ triggerId, depth }` |
| **Gap Analysis** | L1 concepts without L2/L3 realisation | `{ domain?, layer? }` |
| **Value Stream Map** | Stages, owning contexts, cycle times, bottlenecks | `{ valueStream? }` |
| **Stakeholder Map** | Actors, interest, influence, engagement model | `{ scope }` |
| **Value Impact Map** | Goal → actor → impact → deliverable trace | `{ initiative? }` |
| **Product Roadmap** | Time-phased capabilities per sub-domain | `{ subdomain, horizon? }` |
| **North Star Roadmap** | Cross-domain milestones, dependencies, alignment | `{ businessUnit? }` |
| **Strategic Initiative Dashboard** | Initiative health, progress, KPIs | `{ initiative? }` |

### Refresh Strategy

Three modes:
1. **On-demand**: Computed fresh on each request (for rarely-accessed or fast-to-compute views)
2. **Cached with event invalidation**: Cached result invalidated when relevant graph events occur; recomputed on next request
3. **Periodic refresh**: Materialised on a schedule (for expensive views like compliance matrix that don't need real-time freshness)

---

## Interfaces & Contracts

### ViewEngine

```typescript
interface ViewEngine {
  // Get a materialised view
  getView<T>(viewType: string, params: Record<string, unknown>, context: QueryContext): Promise<ViewResult<T>>;
  
  // Force refresh a cached view
  refreshView(viewType: string, params: Record<string, unknown>): Promise<void>;
  
  // List available views with metadata
  listViews(): ViewMetadata[];
  
  // Register a new view projector (extension point)
  registerProjector(projector: ViewProjector<unknown, unknown>): void;
}

interface ViewResult<T> {
  data: T;
  metadata: {
    viewType: string;
    computedAt: string;
    entriesIncluded: number;
    stale: boolean;
    cacheHit: boolean;
  };
}

interface ViewMetadata {
  viewType: string;
  description: string;
  parameters: ParameterDefinition[];
  refreshPolicy: 'on-demand' | 'cached' | 'periodic';
  estimatedComputeTime: string;       // e.g., "<1s", "2-5s"
}
```

### Example View Output Schemas

#### Domain Map

```typescript
interface DomainMapView {
  subdomains: {
    id: string;
    name: string;
    contexts: {
      id: string;
      name: string;
      conceptCount: number;
      serviceCount: number;
      relationships: { targetContextId: string; type: string; }[];
    }[];
  }[];
  crossContextRelationships: {
    source: string;
    target: string;
    type: string;
    strength: number;  // Number of edges between contexts
  }[];
}
```

#### Compliance Matrix

```typescript
interface ComplianceMatrixView {
  obligations: {
    id: string;
    regulation: string;
    article: string;
    statement: string;
    coverage: {
      domainConcepts: { id: string; name: string; status: 'covered' | 'partial' | 'uncovered' }[];
      realisations: { id: string; name: string; type: string; }[];
      overallStatus: 'compliant' | 'partial' | 'non-compliant';
      evidenceCount: number;
    };
  }[];
  summary: {
    totalObligations: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    coveragePercentage: number;
  };
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Query Interface | Executes graph queries to gather view data |
| Graph Persistence Port (event log) | Receives invalidation events |
| Schema Module | View output schemas reference inventory type definitions |

| Depended on by | Reason |
|----------------|--------|
| GraphQL API Layer | Serves view data to UI |
| Export service | Renders views as PDF/CSV |
| Strategic dashboards | Consumes aggregated view data |

---

## Key Decisions

### Decision 1: View Computation Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Fully on-demand (compute every time)** | Always fresh; no cache management; simplest implementation | Expensive views may be slow; repeated identical requests waste compute; poor UX for complex views |
| **Pre-materialised (compute on schedule)** | Fast reads; predictable performance; good for dashboards | Stale data between refreshes; wasted compute if views aren't accessed; storage for materialised data |
| **Lazy materialisation with event invalidation** | Fresh when accessed; efficient (only recompute when data changes); fast for unchanged data | More complex invalidation logic; first access after invalidation is slow; must track dependencies |
| **Hybrid (per-view policy)** | Each view gets the strategy that fits its access pattern and compute cost | More complex configuration; must understand each view's characteristics |

**Recommendation: Hybrid (per-view policy)**

*Rationale*: Views have vastly different characteristics. Entity lookup views are cheap and should be on-demand. The compliance matrix requires multi-hop traversal across hundreds of nodes and should be cached with invalidation. Strategic dashboards are accessed infrequently but expensive to compute — periodic refresh fits. A per-view policy (declared in the view's projector registration) gives optimal behaviour for each.

---

### Decision 2: View Extension Mechanism

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Code-based projectors (OCP via registration)** | Full power of code; type-safe; testable; complex logic possible | Adding a view requires code deployment; not configurable by administrators |
| **Configuration-driven views (query + transform DSL)** | Non-developers can create views; no deployment needed; flexible | DSL limitations for complex views; new language to learn; harder to test and debug |
| **Hybrid (code for complex, config for simple)** | Best of both; simple views are easy to create; complex views get full power | Two systems to maintain; must decide which path for each view; inconsistent |

**Recommendation: Code-based projectors (OCP via registration)**

*Rationale*: Our views involve complex graph traversal, scoring, and aggregation that a configuration DSL would struggle to express cleanly. The team writing views is the engineering team — they're comfortable with code. The registration pattern (implementing `ViewProjector` and registering with the engine) provides the OCP extension point. If a need for user-defined simple views emerges (Phase 5+), a config-driven layer can be added on top.

---

### Decision 3: View Staleness Communication

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Silent refresh (always serve cached, refresh in background)** | Fast UX; no staleness indicators; simple for users | Users don't know if data is stale; decisions made on old data; no transparency |
| **Staleness indicator (serve cached + show age)** | Transparent; fast reads; user decides if they need fresh data; can trigger manual refresh | UI complexity; users may always want fresh (defeating the cache); staleness anxiety |
| **Stale-while-revalidate (serve stale, refresh in background, push update)** | Fast initial load; automatic freshness; good UX | Complex implementation; WebSocket dependency; UI must handle mid-view data changes |

**Recommendation: Staleness indicator with manual refresh option**

*Rationale*: For a knowledge management platform used for compliance and architectural decisions, transparency about data freshness is critical. Users need to know "this compliance matrix was computed 2 hours ago" and choose whether to wait for a fresh computation. The manual refresh button gives control without forcing it. Stale-while-revalidate can be added as a progressive enhancement via WebSockets in Phase 5.

---

## Open Questions

1. **View composability**: Should views be composable (e.g., "show me the compliance matrix filtered to only the services in this system landscape view")? Or are they always independent?
2. **View versioning**: If a view's projection logic changes (e.g., compliance matrix adds a new column), how do we handle consumers that expect the old structure?
3. **Large view pagination**: For views that produce large result sets (e.g., gap analysis across entire domain), should pagination be built into the view engine or handled at the GraphQL layer?
