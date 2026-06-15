import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";

export type MutationType =
  | "NodeCreated"
  | "NodeUpdated"
  | "NodeRetired"
  | "EdgeCreated"
  | "EdgeRemoved";

export type TriggerType = "loader" | "api" | "agent" | "admin";

export interface Trigger {
  type: TriggerType;
  identity: string;
}

/** Immutable record of a single graph mutation (plan.md "Knowledge Graph Event Log"). */
export interface GraphMutationEvent {
  eventId: string;
  timestamp: string;
  mutationType: MutationType;
  entityType: string;
  entityId: string;
  previousState: object | null;
  newState: object | null;
  trigger: Trigger;
  confidence: number;
  transactionId: string;
}

export interface GraphError {
  code: string;
  message: string;
}

export interface MutationResult {
  success: boolean;
  eventId: string;
  /** Monotonic revision of the affected node after a successful mutation. */
  revision?: number;
  /** True when an idempotent re-upsert resulted in no change. */
  noop?: boolean;
  error?: GraphError;
}

export interface UpsertOptions {
  /** Optimistic concurrency: fail if the stored revision differs from this. */
  expectedRevision?: number;
  trigger?: Trigger;
  confidence?: number;
}

export type Direction = "in" | "out" | "both";

export interface TraversalQuery {
  startNodeId: string;
  edgeTypes?: string[];
  nodeTypes?: string[];
  direction: Direction;
  maxDepth: number;
  limit?: number;
}

export interface PathQuery {
  sourceId: string;
  targetId: string;
  edgeTypes?: string[];
  maxDepth?: number;
  limit?: number;
}

export interface Subgraph {
  nodes: InventoryEntry[];
  edges: RelationshipEntry[];
}

export interface GraphPath {
  nodeIds: string[];
  edges: RelationshipEntry[];
}

export interface PropertyFilter {
  field: string;
  op: "eq" | "neq";
  value: unknown;
}

export interface EventFilter {
  mutationType?: MutationType;
  entityId?: string;
  entityType?: string;
}

/** Transactional handle: operations are buffered and applied atomically on commit. */
export interface Transaction {
  upsertNode(node: InventoryEntry, options?: UpsertOptions): Promise<void>;
  createEdge(edge: RelationshipEntry): Promise<void>;
  removeEdge(sourceId: string, targetId: string, type: string): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * GraphPort — the abstract interface every graph storage adapter implements
 * (spec 002). The team develops and tests against this from day one; the concrete
 * graph database (Neo4j, Neptune, …) is selected later behind this port.
 *
 * Note: `patternMatch` from the spec is deferred to Phase 1 (when query patterns
 * are concrete); traverse / findByType / findPath cover the foundation's needs.
 */
export interface GraphPort {
  // Node operations
  upsertNode(node: InventoryEntry, options?: UpsertOptions): Promise<MutationResult>;
  getNode(id: string, atTime?: string): Promise<InventoryEntry | null>;
  deleteNode(id: string): Promise<MutationResult>;
  /**
   * Hard-remove a node and all of its incident edges. Unlike {@link deleteNode}
   * (a soft retire), this physically deletes the node — used by loader
   * `rollbackRun` to reverse a load. Emits a `NodeRetired` reversal event.
   */
  removeNode(id: string): Promise<MutationResult>;
  nodeExists(id: string): Promise<boolean>;

  // Edge operations
  createEdge(edge: RelationshipEntry): Promise<MutationResult>;
  removeEdge(sourceId: string, targetId: string, type: string): Promise<MutationResult>;
  getEdges(nodeId: string, direction: Direction, type?: string): Promise<RelationshipEntry[]>;

  // Query operations
  traverse(query: TraversalQuery): Promise<Subgraph>;
  findByType(type: string, filters?: PropertyFilter[]): Promise<InventoryEntry[]>;
  findPath(query: PathQuery): Promise<GraphPath[]>;

  // Transaction support
  beginTransaction(): Promise<Transaction>;

  // Event log access
  getEvents(since?: string, until?: string, filters?: EventFilter[]): Promise<GraphMutationEvent[]>;
}

/** A factory the contract test suite uses to obtain a fresh adapter instance. */
export type GraphPortFactory = () => GraphPort | Promise<GraphPort>;
