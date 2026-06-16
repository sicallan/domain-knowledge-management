import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";

/**
 * Query Interface contracts — spec 006 §Interfaces & Contracts, reproduced
 * verbatim and completed with the result/marker types the spec references but
 * does not spell out. These are the **closed** surfaces (OCP): method signatures
 * and {@link PaginatedResult} shape must not change as new query backends land.
 */

// ---------------------------------------------------------------------------
// Shared identifiers
// ---------------------------------------------------------------------------

/**
 * An inventory entry's `type` discriminator (e.g. `"DomainConcept"`, `"Decision"`).
 * The schema models `InventoryEntry.type` as an open `string` (additive OCP
 * evolution of the type catalogue), so this alias is intentionally `string` —
 * it names the role of the value in query requests without closing the set.
 */
export type InventoryType = string;

/** A storage backend the query router can dispatch to. */
export type BackendId = "graph" | "vector" | "postgresql";

/** The categories of query the router knows how to plan (spec 006 §Query Types). */
export type QueryType =
  | "entityLookup"
  | "typeListing"
  | "traversal"
  | "pathFinding"
  | "impact"
  | "semanticSearch"
  | "facetedBrowse"
  | "temporal"
  | "fullText"
  | "hybrid";

// ---------------------------------------------------------------------------
// Request types (spec 006 verbatim)
// ---------------------------------------------------------------------------

export interface QueryContext {
  userId: string;
  roles: string[];
  scopes: string[]; // e.g., ["payments.*", "lending.read"]
  requestId: string; // For tracing
}

export interface PropertyFilter {
  field: string;
  op: "eq" | "neq";
  value: unknown;
}

export interface ListQuery {
  type?: InventoryType;
  filters?: PropertyFilter[];
  sort?: { field: string; direction: "asc" | "desc" };
  cursor?: string;
  limit?: number;
  /**
   * Additive (OCP-open) extension to spec 006's `ListQuery`: opt out of the
   * (cheap in Phase 1) total-count computation. Decision 3 specifies total
   * count as an *optional* field; when `false`, {@link PaginatedResult.totalCount}
   * is `null`. Defaults to `true`.
   */
  includeTotal?: boolean;
}

export interface TraversalRequest {
  startNodeId: string;
  direction: "out" | "in" | "both";
  edgeTypes?: string[];
  nodeTypes?: string[];
  maxDepth: number;
  includeEdges: boolean;
}

/**
 * Path-finding request. Spec 006's `QueryService.findPaths` references
 * `PathRequest` without defining it in §Interfaces; this mirrors the graph
 * port's `PathQuery` (spec 002) at the service edge.
 */
export interface PathRequest {
  sourceId: string;
  targetId: string;
  edgeTypes?: string[];
  maxDepth?: number;
  limit?: number;
}

export interface SearchRequest {
  query: string; // Natural language or keyword
  mode: "semantic" | "keyword" | "hybrid";
  filters?: PropertyFilter[];
  limit?: number;
}

export interface ImpactRequest {
  triggerNodeId: string; // What changed
  traversalDepth: number; // How far to trace impact
  edgeTypes?: string[]; // Which relationship types to follow
  scoreThreshold?: number; // Minimum impact score to include
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
  /**
   * Total matching count, or `null` when not computed. Spec 006 Decision 3
   * specifies total count as an *optional* field (computed lazily / from a
   * cached count); Phase 1 computes it eagerly (cheap over the graph-served
   * subset) unless {@link ListQuery.includeTotal} is `false`.
   */
  totalCount: number | null;
}

/** Single-entity lookup result (spec 006 `getEntry`). */
export interface EntryResult {
  entry: InventoryEntry;
}

/** Traversal result — the reachable subgraph (spec 006 `traverse`). */
export interface SubgraphResult {
  nodes: InventoryEntry[];
  /** Populated only when the request set `includeEdges: true`. */
  edges: RelationshipEntry[];
  /** True when the traversal was clamped by the configured `maxDepth` cap. */
  truncated: boolean;
}

/** A single connecting path between two nodes. */
export interface QueryPath {
  nodeIds: string[];
  edges: RelationshipEntry[];
}

/** Path-finding result (spec 006 `findPaths`). */
export interface PathResult {
  paths: QueryPath[];
  found: boolean;
}

/**
 * Marker returned by every query operation whose backend is not wired in
 * Phase 1 (semantic/full-text/faceted/temporal search, impact assessment).
 * The service returns this **instead of throwing** so callers degrade
 * gracefully (acceptance criterion 5). It is a discriminant (`available:false`)
 * on each deferred result union below.
 */
export interface BackendUnavailableResult {
  available: false;
  /** Documented, human-readable explanation (never thrown). */
  reason: string;
  /** The query type that was requested. */
  queryType: QueryType;
  /** Backend(s) that must be wired (Phase 3+) before this query type works. */
  requiredBackends: BackendId[];
}

export interface SearchHit {
  entry: InventoryEntry;
  score: number;
}

export interface SearchSuccessResult {
  available: true;
  hits: SearchHit[];
  cursor: string | null;
  hasMore: boolean;
  totalCount: number | null;
}

/** Semantic/keyword/hybrid search result — deferred in Phase 1. */
export type SearchResult = SearchSuccessResult | BackendUnavailableResult;

export interface ImpactedNode {
  entry: InventoryEntry;
  score: number;
  distance: number;
}

export interface ImpactSuccessResult {
  available: true;
  impacted: ImpactedNode[];
}

/** Impact-assessment result — deferred to Phase 4. */
export type ImpactResult = ImpactSuccessResult | BackendUnavailableResult;

export interface DiffSuccessResult {
  available: true;
  added: string[];
  removed: string[];
  changed: string[];
}

/** Temporal diff result — deferred in Phase 1 (needs the event-log store). */
export type DiffResult = DiffSuccessResult | BackendUnavailableResult;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** The plan the router produces for a query type (spec 006 §Query Routing). */
export interface QueryPlan {
  queryType: QueryType;
  backends: BackendId[];
  fallback?: BackendId[];
  merge?: "reciprocalRankFusion" | "union" | "intersection";
  /** True when every required backend is currently available. */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

/** Per-query metric emitted on completion (spec 006 §Outputs). */
export interface QueryMetric {
  queryType: QueryType;
  /** Wall-clock duration in milliseconds. */
  duration: number;
  /** Backends actually called while serving the query. */
  backendsCalled: BackendId[];
  /** Always `false` in Phase 1 (caching deferred — spec Decision 2). */
  cacheHit: boolean;
  /** Propagated from {@link QueryContext.requestId} for tracing. */
  requestId: string;
}

/** A sink for {@link QueryMetric}s. Defaults to a no-op. */
export type MetricsSink = (metric: QueryMetric) => void;

// ---------------------------------------------------------------------------
// Access filtering (RBAC seam)
// ---------------------------------------------------------------------------

/**
 * Access-filter seam. Every query funnels its results through this on the hot
 * path so a real RBAC implementation can be pushed down later **behind the same
 * seam** without reworking callers (spec 006 §Access Filtering). Phase 1 ships a
 * no-op pass-through ({@link PassThroughAccessFilter}); auth lands in Phase 3.
 */
export interface AccessFilter {
  /** Filter inventory entries by the caller's scope. */
  filterNodes(nodes: InventoryEntry[], context: QueryContext): InventoryEntry[];
  /** Filter relationship edges by the caller's scope. */
  filterEdges(edges: RelationshipEntry[], context: QueryContext): RelationshipEntry[];
}

// ---------------------------------------------------------------------------
// Service contract (spec 006 verbatim)
// ---------------------------------------------------------------------------

export interface QueryService {
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
