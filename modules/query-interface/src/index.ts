import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import type { GraphPort } from "@dkm/knowledge-graph";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type {
  AccessFilter,
  BackendId,
  BackendUnavailableResult,
  DiffResult,
  EntryResult,
  ImpactRequest,
  ImpactResult,
  ListQuery,
  MetricsSink,
  PaginatedResult,
  PathRequest,
  PathResult,
  QueryContext,
  QueryPath,
  QueryPlan,
  QueryService,
  QueryType,
  SearchRequest,
  SearchResult,
  SubgraphResult,
  TraversalRequest,
} from "./types";

export * from "./types";

// ---------------------------------------------------------------------------
// Constants (spec 006 §Pagination, Open Q1)
// ---------------------------------------------------------------------------

/** Default page size when a query omits `limit` (spec 006 §Pagination). */
export const DEFAULT_PAGE_SIZE = 25;
/** Maximum page size; larger requests are clamped (spec 006 §Pagination). */
export const MAX_PAGE_SIZE = 100;
/**
 * Default ceiling on traversal / path depth. Resolves spec 006 Open Q1 (query
 * complexity limits): even in Phase 1 an unbounded `maxDepth` is clamped to this
 * so a single query cannot scan the whole graph. Configurable per service via
 * {@link GraphQueryServiceOptions.maxDepthCap}.
 */
export const DEFAULT_MAX_DEPTH_CAP = 5;

// ---------------------------------------------------------------------------
// Query routing (spec 006 §Query Routing)
// ---------------------------------------------------------------------------

/** Backends wired in Phase 1. Only the graph is live; the rest land Phase 3+. */
const AVAILABLE_BACKENDS = new Set<BackendId>(["graph"]);

/** The static routing table (spec 006 §Query Routing), sans the derived `available`. */
const QUERY_PLANS: Record<QueryType, Omit<QueryPlan, "available">> = {
  entityLookup: { queryType: "entityLookup", backends: ["graph"] },
  typeListing: { queryType: "typeListing", backends: ["graph"] },
  traversal: { queryType: "traversal", backends: ["graph"] },
  pathFinding: { queryType: "pathFinding", backends: ["graph"] },
  impact: { queryType: "impact", backends: ["graph"] },
  semanticSearch: { queryType: "semanticSearch", backends: ["vector"], fallback: ["graph"] },
  facetedBrowse: { queryType: "facetedBrowse", backends: ["postgresql"] },
  temporal: { queryType: "temporal", backends: ["postgresql"] },
  fullText: { queryType: "fullText", backends: ["postgresql"] },
  hybrid: { queryType: "hybrid", backends: ["vector", "graph"], merge: "reciprocalRankFusion" },
};

/**
 * Map a query type to its backend plan (spec 006 §Query Routing). `available` is
 * `true` only when every required backend is wired in the current phase — graph
 * queries are available now; vector/PostgreSQL-backed ones are not until Phase 3+.
 * **OCP-open**: new query types extend {@link QUERY_PLANS} without touching the
 * existing branches.
 */
export function routeQuery(queryType: QueryType): QueryPlan {
  const base = QUERY_PLANS[queryType];
  const available = base.backends.every((backend) => AVAILABLE_BACKENDS.has(backend));
  return { ...base, available };
}

/** Human-readable, never-thrown reasons for each Phase-1-deferred query type. */
const UNAVAILABLE_REASON: Partial<Record<QueryType, string>> = {
  semanticSearch: "Semantic search requires the vector store, which is not wired in Phase 1 (Phase 3+).",
  fullText: "Full-text/keyword search requires PostgreSQL full-text, not wired in Phase 1 (Phase 3+).",
  facetedBrowse: "Faceted browse requires PostgreSQL materialised views, not wired in Phase 1 (Phase 3+).",
  temporal: "Temporal queries require the PostgreSQL event-log store, not wired in Phase 1 (Phase 3+).",
  hybrid: "Hybrid search requires both the vector and graph backends, not wired in Phase 1 (Phase 3+).",
  impact: "Impact assessment is deferred to Phase 4 (Impact Assessment Agent).",
};

function unavailableResult(queryType: QueryType): BackendUnavailableResult {
  const plan = routeQuery(queryType);
  return {
    available: false,
    reason: UNAVAILABLE_REASON[queryType] ?? `Query type '${queryType}' is not available in Phase 1.`,
    queryType,
    requiredBackends: plan.backends,
  };
}

// ---------------------------------------------------------------------------
// Cursor pagination (spec 006 Decision 3 — keyset pagination)
// ---------------------------------------------------------------------------

/** The opaque payload a pagination cursor encodes: the last-seen sort key + id. */
export interface CursorPayload {
  sortValue: unknown;
  id: string;
}

/** Encode a {@link CursorPayload} into an opaque, URL-safe cursor string. */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decode a cursor produced by {@link encodeCursor}; throws on a malformed value. */
export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error(`Malformed pagination cursor: ${cursor}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    !("sortValue" in parsed) ||
    typeof (parsed as { id: unknown }).id !== "string"
  ) {
    throw new Error(`Malformed pagination cursor: ${cursor}`);
  }
  const obj = parsed as { sortValue: unknown; id: string };
  return { sortValue: obj.sortValue, id: obj.id };
}

/** Clamp a requested page size to `[1, MAX]`, defaulting an absent/invalid value. */
export function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}

function fieldValue(node: InventoryEntry, field: string): unknown {
  if (field === "id") return node.id;
  return (node as unknown as Record<string, unknown>)[field];
}

/** Total order over raw values: numbers numerically, everything else as strings; nullish last. */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  return String(a) < String(b) ? -1 : 1;
}

/** Comparator over entries: primary sort field (directional) then id (ascending, stable). */
function nodeComparator(
  sortField: string,
  direction: "asc" | "desc",
): (a: InventoryEntry, b: InventoryEntry) => number {
  const dir = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const primary = compareValues(fieldValue(a, sortField), fieldValue(b, sortField)) * dir;
    if (primary !== 0) return primary;
    return compareValues(a.id, b.id);
  };
}

/** Keyset predicate: is `node` strictly after `cursor` in the configured order? */
function isAfterCursor(
  node: InventoryEntry,
  cursor: CursorPayload,
  sortField: string,
  direction: "asc" | "desc",
): boolean {
  const dir = direction === "desc" ? -1 : 1;
  const primary = compareValues(fieldValue(node, sortField), cursor.sortValue) * dir;
  if (primary !== 0) return primary > 0;
  return compareValues(node.id, cursor.id) > 0;
}

// ---------------------------------------------------------------------------
// Access filtering (RBAC seam — spec 006 §Access Filtering)
// ---------------------------------------------------------------------------

/**
 * Phase-1 no-op {@link AccessFilter}: returns nodes/edges unchanged. The seam is
 * still invoked on the hot path of every query so a real RBAC implementation can
 * be pushed down later **behind the same interface** without reworking callers
 * (auth lands Phase 3). **OCP-open**: replace this with a scope-enforcing filter
 * via {@link GraphQueryServiceOptions.accessFilter}.
 */
export class PassThroughAccessFilter implements AccessFilter {
  filterNodes(nodes: InventoryEntry[], _context: QueryContext): InventoryEntry[] {
    return nodes;
  }

  filterEdges(edges: RelationshipEntry[], _context: QueryContext): RelationshipEntry[] {
    return edges;
  }
}

// ---------------------------------------------------------------------------
// Query service
// ---------------------------------------------------------------------------

export interface GraphQueryServiceOptions {
  /** Sink for per-query {@link import("./types").QueryMetric}s. Defaults to a no-op. */
  metrics?: MetricsSink;
  /** Access-control seam. Defaults to {@link PassThroughAccessFilter}. */
  accessFilter?: AccessFilter;
  /** Traversal/path depth ceiling. Defaults to {@link DEFAULT_MAX_DEPTH_CAP}. */
  maxDepthCap?: number;
}

/**
 * The Phase-1 {@link QueryService}: the consumer-facing read API over the graph
 * (spec 006). Implements the graph-served subset — entity lookup, type listing
 * (cursor pagination), traversal and path finding — by orchestrating the
 * {@link GraphPort}; it never implements storage logic itself. Query types that
 * need vector/PostgreSQL backends (semantic/full-text/faceted/temporal search,
 * impact assessment) return a typed "not available in Phase 1" result rather than
 * throwing (acceptance criterion 5).
 *
 * **OCP-closed**: the {@link QueryService} method signatures and result shapes do
 * not change as new backends land — adding semantic search later must not alter
 * `getEntry`/`traverse`.
 */
export class GraphQueryService implements QueryService {
  private readonly graph: GraphPort;
  private readonly metrics: MetricsSink;
  private readonly accessFilter: AccessFilter;
  private readonly maxDepthCap: number;

  constructor(graph: GraphPort, options: GraphQueryServiceOptions = {}) {
    this.graph = graph;
    this.metrics = options.metrics ?? ((): void => {});
    this.accessFilter = options.accessFilter ?? new PassThroughAccessFilter();
    this.maxDepthCap = options.maxDepthCap ?? DEFAULT_MAX_DEPTH_CAP;
  }

  async getEntry(id: string, context: QueryContext): Promise<EntryResult | null> {
    const start = performance.now();
    const node = await this.graph.getNode(id);
    let result: EntryResult | null = null;
    if (node) {
      const visible = this.accessFilter.filterNodes([node], context);
      result = visible.length > 0 && visible[0] ? { entry: visible[0] } : null;
    }
    this.emit("entityLookup", ["graph"], start, context.requestId);
    return result;
  }

  async listEntries(
    query: ListQuery,
    context: QueryContext,
  ): Promise<PaginatedResult<InventoryEntry>> {
    const start = performance.now();
    const sortField = query.sort?.field ?? "id";
    const direction = query.sort?.direction ?? "asc";

    const matching = query.type ? await this.graph.findByType(query.type, query.filters) : [];
    const visible = this.accessFilter.filterNodes(matching, context);
    const sorted = [...visible].sort(nodeComparator(sortField, direction));
    const totalCount = query.includeTotal === false ? null : sorted.length;

    let remaining = sorted;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      remaining = sorted.filter((node) => isAfterCursor(node, cursor, sortField, direction));
    }

    const limit = clampLimit(query.limit);
    const items = remaining.slice(0, limit);
    const hasMore = remaining.length > limit;
    const last = items.at(-1);
    const cursor = hasMore && last ? encodeCursor({ sortValue: fieldValue(last, sortField), id: last.id }) : null;

    this.emit("typeListing", ["graph"], start, context.requestId);
    return { items, cursor, hasMore, totalCount };
  }

  async traverse(query: TraversalRequest, context: QueryContext): Promise<SubgraphResult> {
    const start = performance.now();
    const effectiveDepth = Math.min(query.maxDepth, this.maxDepthCap);
    const truncated = query.maxDepth > this.maxDepthCap;

    const subgraph = await this.graph.traverse({
      startNodeId: query.startNodeId,
      direction: query.direction,
      edgeTypes: query.edgeTypes,
      nodeTypes: query.nodeTypes,
      maxDepth: effectiveDepth,
    });

    const nodes = this.accessFilter.filterNodes(subgraph.nodes, context);
    const edges = query.includeEdges ? this.accessFilter.filterEdges(subgraph.edges, context) : [];

    this.emit("traversal", ["graph"], start, context.requestId);
    return { nodes, edges, truncated };
  }

  async findPaths(query: PathRequest, context: QueryContext): Promise<PathResult> {
    const start = performance.now();
    const raw = await this.graph.findPath({
      sourceId: query.sourceId,
      targetId: query.targetId,
      edgeTypes: query.edgeTypes,
      maxDepth: query.maxDepth,
      limit: query.limit,
    });

    const paths: QueryPath[] = raw.map((path) => ({
      nodeIds: path.nodeIds,
      edges: this.accessFilter.filterEdges(path.edges, context),
    }));

    this.emit("pathFinding", ["graph"], start, context.requestId);
    return { paths, found: paths.length > 0 };
  }

  async search(query: SearchRequest, context: QueryContext): Promise<SearchResult> {
    const start = performance.now();
    const queryType: QueryType =
      query.mode === "semantic" ? "semanticSearch" : query.mode === "keyword" ? "fullText" : "hybrid";
    this.emit(queryType, [], start, context.requestId);
    return unavailableResult(queryType);
  }

  async assessImpact(_query: ImpactRequest, context: QueryContext): Promise<ImpactResult> {
    const start = performance.now();
    this.emit("impact", [], start, context.requestId);
    return unavailableResult("impact");
  }

  async getStateAtTime(
    _entityId: string,
    _timestamp: string,
    context: QueryContext,
  ): Promise<EntryResult | null> {
    const start = performance.now();
    // Temporal point-in-time reads need the event-log store (Phase 3+); Phase 1
    // returns null rather than throwing.
    this.emit("temporal", [], start, context.requestId);
    return null;
  }

  async getDiff(
    _entityId: string,
    _from: string,
    _to: string,
    context: QueryContext,
  ): Promise<DiffResult> {
    const start = performance.now();
    this.emit("temporal", [], start, context.requestId);
    return unavailableResult("temporal");
  }

  private emit(queryType: QueryType, backendsCalled: BackendId[], start: number, requestId: string): void {
    this.metrics({
      queryType,
      duration: Math.max(0, performance.now() - start),
      backendsCalled,
      cacheHit: false,
      requestId,
    });
  }
}
