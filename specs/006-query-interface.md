# 006 — Query Interface

## Purpose & Scope

The Query Interface is the API layer that translates consumer requests (from the UI, CLI, or programmatic clients) into operations against the underlying storage backends. It does not implement storage logic — it orchestrates queries across the Graph Port, and in later phases across vector and relational stores.

**In scope:**
- Query API contract (typed operations available to consumers)
- Query routing (which storage backend serves which query type)
- Result aggregation (combining results from multiple backends)
- Pagination, filtering, and sorting
- Query caching strategy
- Performance budgets per query type

**Out of scope:**
- Storage implementation (Graph Port adapters handle that)
- GraphQL schema (that's the GraphQL API Layer spec)
- Natural language query translation (that's the Q&A Pipeline spec)
- View materialisation (that's the View Projection Engine spec)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Query request | GraphQL API Layer, CLI, internal services | Typed query objects (see Interfaces) |
| User context | Authentication layer | `{ userId, roles, scopes }` — for access filtering |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Query results | GraphQL API Layer, View Engine | Typed result sets with metadata |
| Query metrics | Observability, caching layer | `{ queryType, duration, backendsCalled, cacheHit }` |

---

## Behaviour

### Query Types

| Query Type | Description | Primary Backend | Fallback |
|------------|-------------|-----------------|----------|
| **Entity lookup** | Get a single entry by ID | Graph | — |
| **Type listing** | List entries of a type with filters | Graph (or PostgreSQL for large result sets) | — |
| **Relationship traversal** | Follow edges from a node | Graph | — |
| **Path finding** | Find paths between two nodes | Graph | — |
| **Impact query** | Multi-hop traversal with scoring | Graph | — |
| **Semantic search** | Natural language similarity search | Vector store | Graph (keyword fallback) |
| **Faceted browse** | Filter by multiple dimensions with counts | PostgreSQL (materialised) or Graph | — |
| **Temporal query** | State at a point in time, or diff over range | Event log (PostgreSQL) | — |
| **Full-text search** | Keyword search across entry content | PostgreSQL (full-text) or Vector | — |

### Query Routing

```typescript
// The query planner determines which backend(s) to call
function routeQuery(query: Query): QueryPlan {
  switch (query.type) {
    case 'entityLookup':
    case 'traversal':
    case 'pathFinding':
    case 'impact':
      return { backends: ['graph'] };
    
    case 'semanticSearch':
      return { backends: ['vector'], fallback: ['graph'] };
    
    case 'facetedBrowse':
    case 'temporal':
    case 'fullText':
      return { backends: ['postgresql'] };
    
    case 'hybrid':
      return { backends: ['vector', 'graph'], merge: 'reciprocalRankFusion' };
  }
}
```

### Result Merging (Multi-Backend Queries)

When a query spans multiple backends (e.g., semantic search results enriched with graph relationships):

1. Execute sub-queries in parallel against each backend
2. Merge results using configurable strategy:
   - **Reciprocal Rank Fusion**: For combining relevance rankings from multiple sources
   - **Union**: Combine all results, deduplicate by ID
   - **Intersection**: Only results appearing in all backends
3. Apply final sorting and pagination on merged result set

### Pagination

- **Cursor-based pagination** (not offset-based): Stable across concurrent mutations
- Cursor encodes: last-seen ID + sort key value
- Default page size: 25; max: 100
- Response includes: `{ items, cursor, hasMore, totalCount }`

### Access Filtering

- Every query is filtered by the caller's access scope
- RBAC rules applied at query time: entries outside the user's scope are excluded from results
- Filtering happens at the query level (pushed down to storage where possible, not post-filtered)

---

## Interfaces & Contracts

### QueryService

```typescript
interface QueryService {
  // Single entity retrieval
  getEntry(id: string, context: QueryContext): Promise<EntryResult | null>;
  
  // List entries with filters
  listEntries(query: ListQuery, context: QueryContext): Promise<PaginatedResult<InventoryEntry>>;
  
  // Graph traversal
  traverse(query: TraversalRequest, context: QueryContext): Promise<SubgraphResult>;
  
  // Path finding
  findPaths(query: PathRequest, context: QueryContext): Promise<PathResult>;
  
  // Semantic search
  search(query: SearchRequest, context: QueryContext): Promise<SearchResult>;
  
  // Impact analysis query
  assessImpact(query: ImpactRequest, context: QueryContext): Promise<ImpactResult>;
  
  // Temporal queries
  getStateAtTime(entityId: string, timestamp: string, context: QueryContext): Promise<EntryResult | null>;
  getDiff(entityId: string, from: string, to: string, context: QueryContext): Promise<DiffResult>;
}

interface QueryContext {
  userId: string;
  roles: string[];
  scopes: string[];           // e.g., ["payments.*", "lending.read"]
  requestId: string;          // For tracing
}

interface ListQuery {
  type?: InventoryType;
  filters?: PropertyFilter[];
  sort?: { field: string; direction: 'asc' | 'desc' };
  cursor?: string;
  limit?: number;
}

interface TraversalRequest {
  startNodeId: string;
  direction: 'out' | 'in' | 'both';
  edgeTypes?: string[];
  nodeTypes?: string[];
  maxDepth: number;
  includeEdges: boolean;
}

interface SearchRequest {
  query: string;              // Natural language or keyword
  mode: 'semantic' | 'keyword' | 'hybrid';
  filters?: PropertyFilter[];
  limit?: number;
}

interface ImpactRequest {
  triggerNodeId: string;      // What changed
  traversalDepth: number;    // How far to trace impact
  edgeTypes?: string[];      // Which relationship types to follow
  scoreThreshold?: number;   // Minimum impact score to include
}

interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
  totalCount: number;
}
```

### Performance Budgets

| Query Type | P50 Target | P95 Target | P99 Target |
|------------|-----------|-----------|-----------|
| Entity lookup | 10ms | 50ms | 100ms |
| Type listing (1 page) | 50ms | 200ms | 500ms |
| Traversal (depth 3) | 100ms | 500ms | 1s |
| Path finding | 200ms | 1s | 3s |
| Semantic search | 100ms | 300ms | 1s |
| Impact query (depth 5) | 500ms | 2s | 5s |
| Faceted browse | 100ms | 300ms | 1s |

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Graph Persistence Port | Primary query backend |
| Vector store port (Phase 1+) | Semantic search |
| PostgreSQL (Phase 3+) | Faceted browse, temporal queries, full-text |
| Authentication & Authorisation | Access context for filtering |

| Depended on by | Reason |
|----------------|--------|
| GraphQL API Layer | Delegates all queries to this service |
| View Projection Engine | Uses query primitives to materialise views |
| Question Answering Pipeline | Executes structured queries after NL translation |
| Impact Assessment Agent | Uses traversal and impact queries |

---

## Key Decisions

### Decision 1: Query Interface vs Direct Storage Access

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Dedicated Query Service (as proposed)** | Single point for access control, caching, routing; abstracts storage topology; testable in isolation | Additional layer; potential latency overhead; must be kept in sync with storage capabilities |
| **Direct storage port access from consumers** | Lower latency (no intermediary); simpler architecture; consumers get full port power | Access control scattered; no central caching; consumers coupled to storage topology; harder to add new backends |
| **Query layer as part of GraphQL resolvers** | Fewer moving parts; resolvers directly compose queries; familiar pattern | Resolver logic becomes complex; harder to reuse from non-GraphQL consumers (CLI, agents); testing harder |

**Recommendation: Dedicated Query Service**

*Rationale*: The Query Service provides a single place to enforce access control, manage caching, route to appropriate backends, and aggregate results. As the system grows to multiple storage backends (graph + vector + relational), having a routing layer is essential. Non-GraphQL consumers (agents, CLI, batch jobs) also need query access — a service layer serves them all.

---

### Decision 2: Caching Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **No cache (always query storage)** | Simplest; always fresh; no invalidation complexity | Higher latency; higher load on storage backends; repeated identical queries wasteful |
| **Result cache with TTL** | Simple; reduces storage load; good for repeated queries | Stale data within TTL window; cache invalidation on mutation not handled |
| **Result cache with event-driven invalidation** | Fresh data after mutations; reduces storage load; best user experience | More complex; requires subscribing to graph events; must track which cache entries are affected by which mutations |
| **Query-level caching in storage layer** | Transparent; storage handles its own caching; no application-layer cache | Less control; may not cache across backends; harder to observe |

**Recommendation: Result cache with event-driven invalidation**

*Rationale*: The event log (from Graph Persistence Port) already emits mutation events. The Query Service subscribes to these events and invalidates affected cache entries. For most queries (especially entity lookups and type listings), cache hit rates will be high since the knowledge graph changes relatively infrequently (ingestion runs, not real-time writes). The caching layer is optional (off in development, on in production) to keep testing simple.

---

### Decision 3: Pagination Approach

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Offset-based (skip + limit)** | Simple; familiar; works for small datasets | Unstable when data changes; performance degrades at high offsets; duplicate/skipped items on concurrent mutation |
| **Cursor-based (keyset pagination)** | Stable under mutations; consistent performance at any depth; no duplicates | Slightly more complex for clients; can't jump to arbitrary page; cursor is opaque |
| **Cursor-based with total count** | Stable + clients know how many results exist; can show "page X of Y" | Total count may be expensive to compute; can become stale |

**Recommendation: Cursor-based with optional total count**

*Rationale*: The knowledge graph is mutated by ingestion runs and corrections. Offset-based pagination would produce inconsistent results during or after mutations. Cursor-based pagination is stable and performant. Total count is provided as an optional field (computed lazily or from a cached count) since some UIs need it for progress indicators.

---

## Open Questions

1. **Query complexity limits**: Should we impose a maximum traversal depth or result size to prevent expensive queries? How do we handle queries that would scan the entire graph?
2. **Query logging**: Should all queries be logged for analytics (popular queries, slow queries, error patterns)? Privacy implications?
3. **Batch queries**: Should the Query Service support batch operations (multiple lookups in one call) for UI performance, or should clients use GraphQL's natural batching?
