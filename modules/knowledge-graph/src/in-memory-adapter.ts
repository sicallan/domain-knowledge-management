import { randomUUID } from "node:crypto";
import { RelationshipTypeRegistry } from "@dkm/schema";
import type { InventoryEntry, RelationshipEntry } from "@dkm/schema";
import type {
  Direction,
  EventFilter,
  GraphMutationEvent,
  GraphPath,
  GraphPort,
  MutationResult,
  MutationType,
  PathQuery,
  PropertyFilter,
  Subgraph,
  Transaction,
  TraversalQuery,
  Trigger,
  UpsertOptions,
} from "./port";

interface NodeRecord {
  current: InventoryEntry;
  revision: number;
  history: Array<{ timestamp: string; state: InventoryEntry; retired: boolean }>;
}

/** Strictly-monotonic ISO-8601 clock so temporal ordering is unambiguous. */
function monotonicClock(): () => string {
  let last = 0;
  return () => {
    let now = Date.now();
    if (now <= last) now = last + 1;
    last = now;
    return new Date(now).toISOString();
  };
}

export interface InMemoryGraphOptions {
  clock?: () => string;
  defaultTrigger?: Trigger;
  relationshipRegistry?: RelationshipTypeRegistry;
}

/** One staged mutation inside an open transaction. */
type StagedOp =
  | { kind: "upsert"; node: InventoryEntry; options?: UpsertOptions }
  | { kind: "createEdge"; edge: RelationshipEntry }
  | { kind: "removeEdge"; sourceId: string; targetId: string; type: string };

/**
 * In-memory implementation of {@link GraphPort}. Suitable for unit/contract tests
 * and local development; records every mutation in an immutable event log and
 * supports point-in-time reads, optimistic concurrency, and atomic transactions.
 */
export class InMemoryGraphAdapter implements GraphPort {
  private readonly nodes = new Map<string, NodeRecord>();
  private readonly edges: RelationshipEntry[] = [];
  private readonly events: GraphMutationEvent[] = [];
  private readonly clock: () => string;
  private readonly defaultTrigger: Trigger;
  private readonly relRegistry: RelationshipTypeRegistry;

  constructor(options: InMemoryGraphOptions = {}) {
    this.clock = options.clock ?? monotonicClock();
    this.defaultTrigger = options.defaultTrigger ?? { type: "api", identity: "system" };
    this.relRegistry = options.relationshipRegistry ?? new RelationshipTypeRegistry();
  }

  // ---- Node operations -------------------------------------------------------

  async upsertNode(node: InventoryEntry, options: UpsertOptions = {}): Promise<MutationResult> {
    return this.applyUpsert(node, options, this.newTransactionId());
  }

  async getNode(id: string, atTime?: string): Promise<InventoryEntry | null> {
    const record = this.nodes.get(id);
    if (!record) return null;
    if (!atTime) {
      return clone(record.current);
    }
    // Point-in-time: latest snapshot whose timestamp is <= atTime.
    let snapshot: InventoryEntry | null = null;
    for (const h of record.history) {
      if (h.timestamp <= atTime) {
        snapshot = h.state;
      } else {
        break;
      }
    }
    return snapshot ? clone(snapshot) : null;
  }

  async deleteNode(id: string): Promise<MutationResult> {
    return this.applyDelete(id, this.newTransactionId());
  }

  async nodeExists(id: string): Promise<boolean> {
    return this.nodes.has(id);
  }

  // ---- Edge operations -------------------------------------------------------

  async createEdge(edge: RelationshipEntry): Promise<MutationResult> {
    return this.applyCreateEdge(edge, this.newTransactionId());
  }

  async removeEdge(sourceId: string, targetId: string, type: string): Promise<MutationResult> {
    return this.applyRemoveEdge(sourceId, targetId, type, this.newTransactionId());
  }

  async getEdges(nodeId: string, direction: Direction, type?: string): Promise<RelationshipEntry[]> {
    return this.edges
      .filter((e) => {
        if (type && e.relationshipType !== type) return false;
        if (direction === "out") return e.sourceId === nodeId;
        if (direction === "in") return e.targetId === nodeId;
        return e.sourceId === nodeId || e.targetId === nodeId;
      })
      .map(clone);
  }

  // ---- Query operations ------------------------------------------------------

  async traverse(query: TraversalQuery): Promise<Subgraph> {
    const visited = new Set<string>();
    const collectedEdges = new Map<string, RelationshipEntry>();
    const queue: Array<{ id: string; depth: number }> = [{ id: query.startNodeId, depth: 0 }];
    visited.add(query.startNodeId);

    while (queue.length > 0) {
      const { id, depth } = queue.shift() as { id: string; depth: number };
      if (depth >= query.maxDepth) continue;
      for (const edge of this.edges) {
        if (query.edgeTypes && !query.edgeTypes.includes(edge.relationshipType)) continue;
        const next = this.neighbourThrough(edge, id, query.direction);
        if (next === null) continue;
        const neighbour = this.nodes.get(next);
        if (query.nodeTypes && (!neighbour || !query.nodeTypes.includes(neighbour.current.type))) {
          continue;
        }
        collectedEdges.set(edge.id, edge);
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ id: next, depth: depth + 1 });
        }
      }
    }

    const nodes: InventoryEntry[] = [];
    for (const id of visited) {
      const rec = this.nodes.get(id);
      if (rec) nodes.push(clone(rec.current));
      if (query.limit && nodes.length >= query.limit) break;
    }
    return { nodes, edges: [...collectedEdges.values()].map(clone) };
  }

  async findByType(type: string, filters: PropertyFilter[] = []): Promise<InventoryEntry[]> {
    const results: InventoryEntry[] = [];
    for (const rec of this.nodes.values()) {
      if (rec.current.type !== type) continue;
      if (!filters.every((f) => matchesFilter(rec.current, f))) continue;
      results.push(clone(rec.current));
    }
    return results;
  }

  async findPath(query: PathQuery): Promise<GraphPath[]> {
    const maxDepth = query.maxDepth ?? 5;
    const limit = query.limit ?? Infinity;
    const paths: GraphPath[] = [];

    const dfs = (current: string, nodeIds: string[], edges: RelationshipEntry[]): void => {
      if (paths.length >= limit) return;
      if (current === query.targetId && nodeIds.length > 1) {
        paths.push({ nodeIds: [...nodeIds], edges: [...edges] });
        return;
      }
      if (edges.length >= maxDepth) return;
      for (const edge of this.edges) {
        if (query.edgeTypes && !query.edgeTypes.includes(edge.relationshipType)) continue;
        const next = this.neighbourThrough(edge, current, "out");
        if (next === null || nodeIds.includes(next)) continue;
        dfs(next, [...nodeIds, next], [...edges, edge]);
      }
    };

    dfs(query.sourceId, [query.sourceId], []);
    return paths.map((p) => ({ nodeIds: p.nodeIds, edges: p.edges.map(clone) }));
  }

  // ---- Transactions ----------------------------------------------------------

  async beginTransaction(): Promise<Transaction> {
    const staged: StagedOp[] = [];
    return {
      upsertNode: async (node: InventoryEntry, options?: UpsertOptions): Promise<void> => {
        staged.push({ kind: "upsert", node, options });
      },
      createEdge: async (edge: RelationshipEntry): Promise<void> => {
        staged.push({ kind: "createEdge", edge });
      },
      removeEdge: async (sourceId: string, targetId: string, type: string): Promise<void> => {
        staged.push({ kind: "removeEdge", sourceId, targetId, type });
      },
      commit: async (): Promise<void> => {
        await this.commitStaged(staged);
      },
      rollback: async (): Promise<void> => {
        staged.length = 0;
      },
    };
  }

  // ---- Event log -------------------------------------------------------------

  async getEvents(since?: string, until?: string, filters: EventFilter[] = []): Promise<GraphMutationEvent[]> {
    return this.events
      .filter((e) => (since ? e.timestamp >= since : true))
      .filter((e) => (until ? e.timestamp <= until : true))
      .filter((e) => filters.every((f) => matchesEventFilter(e, f)))
      .map(clone);
  }

  // ---- Internals -------------------------------------------------------------

  /**
   * Commit a transaction atomically. All operations are dry-run validated against
   * a snapshot first; only if every operation succeeds are they applied for real.
   */
  private async commitStaged(staged: StagedOp[]): Promise<void> {
    const txId = this.newTransactionId();
    const snapshot = this.snapshot();
    try {
      for (const op of staged) {
        let result: MutationResult;
        if (op.kind === "upsert") {
          result = this.applyUpsert(op.node, op.options ?? {}, txId);
        } else if (op.kind === "createEdge") {
          result = this.applyCreateEdge(op.edge, txId);
        } else {
          result = this.applyRemoveEdge(op.sourceId, op.targetId, op.type, txId);
        }
        if (!result.success) {
          throw new Error(result.error?.message ?? "transaction operation failed");
        }
      }
    } catch (err) {
      this.restore(snapshot);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private applyUpsert(node: InventoryEntry, options: UpsertOptions, txId: string): MutationResult {
    const existing = this.nodes.get(node.id);
    if (existing && options.expectedRevision !== undefined && options.expectedRevision !== existing.revision) {
      return {
        success: false,
        eventId: "",
        error: {
          code: "CONFLICT",
          message: `Optimistic concurrency conflict: expected revision ${options.expectedRevision}, found ${existing.revision}`,
        },
      };
    }

    const timestamp = this.clock();
    if (!existing) {
      const stored = clone(node);
      this.nodes.set(node.id, {
        current: stored,
        revision: 1,
        history: [{ timestamp, state: clone(stored), retired: false }],
      });
      const eventId = this.emit("NodeCreated", node.type, node.id, null, stored, options, txId, timestamp);
      return { success: true, eventId, revision: 1 };
    }

    if (deepEqual(existing.current, node)) {
      return { success: true, eventId: "", revision: existing.revision, noop: true };
    }

    const previous = clone(existing.current);
    const updated = clone(node);
    existing.current = updated;
    existing.revision += 1;
    existing.history.push({ timestamp, state: clone(updated), retired: false });
    const eventId = this.emit("NodeUpdated", node.type, node.id, previous, updated, options, txId, timestamp);
    return { success: true, eventId, revision: existing.revision };
  }

  private applyDelete(id: string, txId: string): MutationResult {
    const existing = this.nodes.get(id);
    if (!existing) {
      return { success: false, eventId: "", error: { code: "NOT_FOUND", message: `Node ${id} does not exist` } };
    }
    const timestamp = this.clock();
    const previous = clone(existing.current);
    const retired = clone(existing.current);
    retired.lifecycle_status = "retired";
    retired.validTo = timestamp;
    existing.current = retired;
    existing.revision += 1;
    existing.history.push({ timestamp, state: clone(retired), retired: true });
    const eventId = this.emit("NodeRetired", retired.type, id, previous, retired, {}, txId, timestamp);
    return { success: true, eventId, revision: existing.revision };
  }

  private applyCreateEdge(edge: RelationshipEntry, txId: string): MutationResult {
    const currentCount = this.edges.filter(
      (e) => e.sourceId === edge.sourceId && e.relationshipType === edge.relationshipType,
    ).length;
    const cardinality = this.relRegistry.canAddEdge(edge.relationshipType, currentCount);
    if (!cardinality.valid) {
      return {
        success: false,
        eventId: "",
        error: { code: "CARDINALITY", message: cardinality.errors[0]?.message ?? "cardinality violation" },
      };
    }
    const stored = clone(edge);
    this.edges.push(stored);
    const timestamp = this.clock();
    const eventId = this.emit("EdgeCreated", `Relationship:${edge.relationshipType}`, edge.id, null, stored, {}, txId, timestamp);
    return { success: true, eventId };
  }

  private applyRemoveEdge(sourceId: string, targetId: string, type: string, txId: string): MutationResult {
    const idx = this.edges.findIndex(
      (e) => e.sourceId === sourceId && e.targetId === targetId && e.relationshipType === type,
    );
    if (idx === -1) {
      return { success: false, eventId: "", error: { code: "NOT_FOUND", message: "edge does not exist" } };
    }
    const [removed] = this.edges.splice(idx, 1);
    const timestamp = this.clock();
    const eventId = this.emit("EdgeRemoved", `Relationship:${type}`, removed!.id, removed!, null, {}, txId, timestamp);
    return { success: true, eventId };
  }

  private emit(
    mutationType: MutationType,
    entityType: string,
    entityId: string,
    previousState: object | null,
    newState: object | null,
    options: UpsertOptions,
    transactionId: string,
    timestamp: string,
  ): string {
    const eventId = randomUUID();
    this.events.push({
      eventId,
      timestamp,
      mutationType,
      entityType,
      entityId,
      previousState: previousState ? clone(previousState) : null,
      newState: newState ? clone(newState) : null,
      trigger: options.trigger ?? this.defaultTrigger,
      confidence: options.confidence ?? 1,
      transactionId,
    });
    return eventId;
  }

  private neighbourThrough(edge: RelationshipEntry, from: string, direction: Direction): string | null {
    if (direction === "out" || direction === "both") {
      if (edge.sourceId === from) return edge.targetId;
    }
    if (direction === "in" || direction === "both") {
      if (edge.targetId === from) return edge.sourceId;
    }
    return null;
  }

  private newTransactionId(): string {
    return randomUUID();
  }

  private snapshot(): { nodes: Map<string, NodeRecord>; edges: RelationshipEntry[]; eventCount: number } {
    const nodes = new Map<string, NodeRecord>();
    for (const [id, rec] of this.nodes) {
      nodes.set(id, {
        current: clone(rec.current),
        revision: rec.revision,
        history: rec.history.map((h) => ({ ...h, state: clone(h.state) })),
      });
    }
    return { nodes, edges: this.edges.map(clone), eventCount: this.events.length };
  }

  private restore(snapshot: { nodes: Map<string, NodeRecord>; edges: RelationshipEntry[]; eventCount: number }): void {
    this.nodes.clear();
    for (const [id, rec] of snapshot.nodes) this.nodes.set(id, rec);
    this.edges.length = 0;
    this.edges.push(...snapshot.edges);
    this.events.length = snapshot.eventCount;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function matchesFilter(entry: InventoryEntry, filter: PropertyFilter): boolean {
  const actual = entry[filter.field];
  if (filter.op === "eq") return actual === filter.value;
  return actual !== filter.value;
}

function matchesEventFilter(event: GraphMutationEvent, filter: EventFilter): boolean {
  if (filter.mutationType && event.mutationType !== filter.mutationType) return false;
  if (filter.entityId && event.entityId !== filter.entityId) return false;
  if (filter.entityType && event.entityType !== filter.entityType) return false;
  return true;
}
