# 011 — GraphQL API Layer

## Purpose & Scope

The GraphQL API Layer is the primary backend interface between the knowledge stores and all consumers (UI, CLI, CI integrations). It provides a typed, relationship-aware API that maps naturally to the domain's graph structure, orchestrating queries and mutations through the internal service layer.

**In scope:**
- GraphQL schema design (types, queries, mutations, subscriptions)
- Resolver architecture (delegation to Query Interface and other services)
- Schema stitching across domain boundaries
- Rate limiting and query complexity analysis
- Error handling and response structure
- REST endpoints for non-GraphQL operations (health, webhooks, file upload)

**Out of scope:**
- Query execution logic (delegated to Query Interface)
- Authentication (delegated to Auth module, applied as middleware)
- UI implementation (separate spec)
- Business logic (lives in domain services, not resolvers)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| GraphQL queries/mutations | UI, CLI, programmatic clients | GraphQL operations over HTTP |
| Authentication token | Client | ****** (JWT) in Authorization header |
| File uploads | Admin UI | Multipart form data (REST endpoint) |
| Webhook events | External systems | HTTP POST with payload |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Query responses | Clients | JSON (GraphQL response format) |
| Subscription messages | WebSocket-connected clients | JSON (GraphQL subscription payload) |
| REST responses | Health checks, webhooks | JSON |
| Metrics | Observability | Request latency, error rate, query complexity |

---

## Behaviour

### Schema Organisation

The GraphQL schema is organised by domain concern:

```graphql
# Core inventory types
type DomainConcept { ... }
type Decision { ... }
type Rule { ... }
type Service { ... }
# ... all inventory types

# Relationships (edges)
type Relationship {
  id: ID!
  type: String!
  source: InventoryEntry!
  target: InventoryEntry!
  metadata: JSON
}

# Union type for polymorphic entry access
union InventoryEntry = DomainConcept | Decision | Rule | Service | ...

# Queries
type Query {
  # Entity access
  entry(id: ID!): InventoryEntry
  entries(type: InventoryType, filters: FilterInput, pagination: PaginationInput): EntryConnection!
  
  # Graph traversal
  traverse(startId: ID!, direction: Direction!, edgeTypes: [String!], depth: Int!): Subgraph!
  findPaths(sourceId: ID!, targetId: ID!, maxDepth: Int): [GraphPath!]!
  
  # Search
  search(query: String!, mode: SearchMode!, filters: FilterInput): SearchResults!
  
  # Views
  domainMap(subdomain: String, depth: Int): DomainMapView!
  complianceMatrix(regulation: String): ComplianceMatrixView!
  vendorCoverage(vendor: String): VendorCoverageView!
  impactReport(id: ID!): ImpactReport!
  # ... all view types
  
  # Quality
  qualityScores(scope: QualityScopeInput): AggregateQualityMetrics!
  contradictions(filters: ContradictionFilterInput): ContradictionConnection!
  
  # Admin
  sources: [Source!]!
  ingestionRuns(sourceId: ID): [IngestionRun!]!
}

# Mutations
type Mutation {
  # Ingestion management
  addSource(input: AddSourceInput!): Source!
  triggerIngestion(sourceId: ID!): IngestionRun!
  
  # Corrections
  approveCorrection(id: ID!): CorrectionResult!
  rejectCorrection(id: ID!, reason: String!): CorrectionResult!
  
  # Impact assessment
  assessImpact(input: AssessImpactInput!): ImpactReport!
  
  # Question answering
  askQuestion(question: String!, context: QuestionContextInput): Answer!
  
  # Admin
  assignRole(userId: ID!, role: Role!): User!
}

# Subscriptions (real-time)
type Subscription {
  entryChanged(types: [InventoryType!], contexts: [String!]): EntryChangeEvent!
  qualityAlert(scope: QualityScopeInput): QualityAlert!
  ingestionProgress(runId: ID!): IngestionProgressEvent!
  correctionProposed: Correction!
}
```

### Resolver Architecture

Resolvers are thin delegation layers — they:
1. Extract parameters from the GraphQL operation
2. Construct the typed query/command for the internal service
3. Call the appropriate service (Query Interface, Assessment Agent, etc.)
4. Transform the result into the GraphQL response type

```
GraphQL Operation → Resolver → Internal Service → Storage Backend
                                    │
                                    ├── Query Interface (for reads)
                                    ├── Impact Agent (for assessments)
                                    ├── Ingestion service (for source management)
                                    └── Quality service (for scores/corrections)
```

### Query Complexity Analysis

To prevent expensive queries from overloading the system:
- Each field has a complexity cost (1 for scalars, 10 for nested objects, 50 for traversals)
- Total query complexity is computed before execution
- Queries exceeding the complexity budget are rejected with an explanatory error
- Depth limit: maximum 10 levels of nesting
- Rate limit: per-user, per-minute (configurable by role)

### Subscription Model

- **Transport**: WebSocket (primary), Server-Sent Events (fallback)
- **Scoping**: Clients subscribe with filters (type, context) to receive only relevant events
- **Source**: Subscriptions are backed by the graph event log
- **Backpressure**: If a client can't keep up, events are buffered (limited) then dropped with a "you missed events" signal

### REST Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health check |
| `/ready` | GET | Readiness probe |
| `/upload` | POST | File upload for ingestion |
| `/webhooks/{source}` | POST | Incoming webhook from external systems |
| `/export/{format}` | GET | Export view data as PDF/CSV/JSON |
| `/auth/callback` | GET | OIDC callback |

---

## Interfaces & Contracts

### Server Configuration

```typescript
interface GraphQLServerConfig {
  port: number;
  corsOrigins: string[];
  maxQueryComplexity: number;          // Default: 1000
  maxQueryDepth: number;               // Default: 10
  rateLimits: {
    viewer: number;                    // Requests per minute
    contributor: number;
    admin: number;
  };
  subscriptions: {
    enabled: boolean;
    transport: 'websocket' | 'sse' | 'both';
    bufferSize: number;                // Max events buffered per client
  };
}
```

### Error Handling

```graphql
# Errors follow GraphQL spec with extensions
{
  "errors": [{
    "message": "Entry not found",
    "locations": [{ "line": 2, "column": 3 }],
    "path": ["entry"],
    "extensions": {
      "code": "NOT_FOUND",
      "statusCode": 404,
      "requestId": "req-uuid"
    }
  }]
}
```

Standard error codes: `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `COMPLEXITY_EXCEEDED`, `RATE_LIMITED`, `INTERNAL_ERROR`

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Query Interface | All read operations delegated here |
| View Projection Engine | View queries |
| Impact Assessment Agent | Assessment mutations |
| Quality Scoring Framework | Quality queries |
| Contradiction Agent | Contradiction queries |
| Authentication & Authorisation | Request validation and access control |
| Source Connector Framework | Source management mutations |

| Depended on by | Reason |
|----------------|--------|
| UI Application | Primary data source |
| CLI tool | Programmatic access |
| CI/CD integrations | Automated queries |
| External consumers | API access |

---

## Key Decisions

### Decision 1: API Protocol

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **GraphQL primary** | Natural fit for graph data; client controls response shape; single endpoint; strong typing; excellent for relationship-heavy queries; reduces over/under-fetching | Learning curve; complexity analysis needed; caching more complex than REST; N+1 query risk in resolvers |
| **REST primary** | Familiar; well-understood caching (HTTP cache); simpler tooling; better for simple CRUD | Poor fit for graph traversal; over-fetching; many endpoints; versioning complexity; relationship queries need custom endpoints |
| **gRPC primary** | Performant; strongly typed; bidirectional streaming; great for service-to-service | Poor browser support; requires code generation; less discoverable; not ideal for ad-hoc queries |

**Recommendation: GraphQL primary, REST secondary**

*Rationale*: The domain is inherently a graph — relationships between entities are as important as the entities themselves. GraphQL's ability to traverse relationships in a single query, let clients specify exactly what they need, and provide strong typing makes it the natural fit. REST endpoints handle simple operations where GraphQL is overkill (health checks, file upload, webhooks).

---

### Decision 2: GraphQL Server Framework

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Apollo Server** | Most popular; rich ecosystem; built-in complexity analysis, caching, subscriptions; excellent docs | Heavy; some features paid (Apollo Studio); vendor alignment concerns |
| **Yoga (by The Guild)** | Lightweight; spec-compliant; framework-agnostic; excellent plugin system; actively maintained | Smaller community than Apollo; less out-of-box tooling |
| **Mercurius (Fastify)** | Fast; Fastify ecosystem; built-in subscription support; lightweight | Tied to Fastify; smaller ecosystem; fewer plugins |
| **Pothos + Yoga** | Type-safe schema builder (code-first); great DX with TypeScript; composable | Code-first (we prefer schema-first — see below); additional dependency |

**Recommendation: Yoga (The Guild)**

*Rationale*: Yoga is lightweight, fully spec-compliant, and framework-agnostic. Its plugin system cleanly handles cross-cutting concerns (auth, complexity, logging) without vendor lock-in. It supports both schema-first and code-first approaches. The Guild's ecosystem (Envelop plugins, GraphQL Tools) provides everything we need without the weight of Apollo's commercial stack.

---

### Decision 3: Schema Authoring Approach

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Schema-first (SDL files)** | Schema is readable documentation; backend/frontend can work in parallel; schema drives code generation | Type definitions separate from resolver logic; must keep in sync; less refactoring safety |
| **Code-first (TypeScript builders)** | Type-safe; refactoring-friendly; schema derived from code; single source of truth | Schema is an output, not an input; less readable for non-developers; requires build step to see schema |

**Recommendation: Schema-first (SDL)**

*Rationale*: Consistent with our schema-first principle (JSON Schema is source of truth for inventory types). The GraphQL SDL files serve as documentation and contract — frontend developers read the SDL to understand available operations without reading backend code. TypeScript types are generated from SDL (using GraphQL Code Generator), giving us type safety in resolvers without code-first complexity.

---

### Decision 4: Real-Time Update Transport

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **WebSocket only** | Bidirectional; low latency; persistent connection; native GraphQL subscription support | Blocked by some corporate proxies; connection management overhead; scaling considerations |
| **Server-Sent Events (SSE) only** | HTTP-based (no proxy issues); simple; auto-reconnect; works everywhere | Unidirectional (server→client only); no native GraphQL subscription protocol; limited browser connections |
| **WebSocket with SSE fallback** | Best connectivity; graceful degradation; works in restrictive environments | More complex; two transport implementations; client must detect and switch |

**Recommendation: WebSocket with SSE fallback**

*Rationale*: WebSocket is the standard transport for GraphQL subscriptions and provides the best experience. However, enterprise environments often have proxies that block WebSocket upgrades. SSE fallback ensures real-time updates work everywhere. The client library handles detection and fallback transparently.

---

## Open Questions

1. **Schema federation**: If the system grows to multiple services, should we use GraphQL federation (Apollo Federation or Schema Stitching)? At what scale does this become necessary?
2. **Persisted queries**: Should we support persisted queries (pre-registered operations) for production to reduce parsing overhead and prevent arbitrary queries?
3. **API versioning**: GraphQL deprecation annotations vs. explicit versioning — how do we communicate schema changes to consumers?
