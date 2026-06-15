import { randomUUID } from "node:crypto";
import neo4j from "neo4j-driver";
import type { Driver, ManagedTransaction, Session } from "neo4j-driver";
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

export interface Neo4jGraphOptions {
  database?: string;
  clock?: () => string;
  defaultTrigger?: Trigger;
  relationshipRegistry?: RelationshipTypeRegistry;
}

interface NodeMeta {
  doc: InventoryEntry;
  revision: number;
  history: Array<{ timestamp: string; state: InventoryEntry; retired: boolean }>;
}

type StagedOp =
  | { kind: "upsert"; node: InventoryEntry; options?: UpsertOptions }
  | { kind: "createEdge"; edge: RelationshipEntry }
  | { kind: "removeEdge"; sourceId: string; targetId: string; type: string };

/**
 * Neo4j implementation of {@link GraphPort} (D-P1.2 integration adapter). It is the
 * same port the in-memory adapter satisfies and passes the identical contract
 * suite — see `graph-port.contract.test.ts`, whose Neo4j variant auto-skips unless
 * `NEO4J_URI` is set. Complex/nested fields are stored as JSON-encoded properties so
 * arbitrary inventory payloads round-trip without a fixed column model.
 *
 * Storage model:
 *  - Node:  `(:Entry { id, type, __meta })`   __meta = JSON { doc, revision, history }
 *  - Edge:  `(:Entry)-[:REL { id, relationshipType, __doc }]->(:Entry)`
 *  - Event: `(:GraphEvent { ...flat strings, __previous, __new, __trigger })`
 */
export class Neo4jGraphAdapter implements GraphPort {
  private readonly driver: Driver;
  private readonly database: string | undefined;
  private readonly clock: () => string;
  private readonly defaultTrigger: Trigger;
  private readonly relRegistry: RelationshipTypeRegistry;

  constructor(driver: Driver, options: Neo4jGraphOptions = {}) {
    this.driver = driver;
    this.database = options.database;
    this.clock = options.clock ?? monotonicClock();
    this.defaultTrigger = options.defaultTrigger ?? { type: "api", identity: "system" };
    this.relRegistry = options.relationshipRegistry ?? new RelationshipTypeRegistry();
  }

  private session(): Session {
    return this.database ? this.driver.session({ database: this.database }) : this.driver.session();
  }

  // ---- Node operations -------------------------------------------------------

  async upsertNode(node: InventoryEntry, options: UpsertOptions = {}): Promise<MutationResult> {
    const session = this.session();
    try {
      return await session.executeWrite((tx) => this.applyUpsert(tx, node, options, this.newTransactionId()));
    } finally {
      await session.close();
    }
  }

  async getNode(id: string, atTime?: string): Promise<InventoryEntry | null> {
    const session = this.session();
    try {
      const meta = await this.readMeta(session, id);
      if (!meta) return null;
      if (!atTime) return clone(meta.doc);
      let snapshot: InventoryEntry | null = null;
      for (const h of meta.history) {
        if (h.timestamp <= atTime) snapshot = h.state;
        else break;
      }
      return snapshot ? clone(snapshot) : null;
    } finally {
      await session.close();
    }
  }

  async deleteNode(id: string): Promise<MutationResult> {
    const session = this.session();
    try {
      return await session.executeWrite((tx) => this.applyDelete(tx, id, this.newTransactionId()));
    } finally {
      await session.close();
    }
  }

  async removeNode(id: string): Promise<MutationResult> {
    const session = this.session();
    try {
      return await session.executeWrite((tx) => this.applyRemoveNode(tx, id, this.newTransactionId()));
    } finally {
      await session.close();
    }
  }

  async nodeExists(id: string): Promise<boolean> {
    const session = this.session();
    try {
      const res = await session.executeRead((tx) =>
        tx.run("MATCH (n:Entry {id: $id}) RETURN count(n) AS c", { id }),
      );
      return toNumber(res.records[0]?.get("c")) > 0;
    } finally {
      await session.close();
    }
  }

  // ---- Edge operations -------------------------------------------------------

  async createEdge(edge: RelationshipEntry): Promise<MutationResult> {
    const session = this.session();
    try {
      return await session.executeWrite((tx) => this.applyCreateEdge(tx, edge, this.newTransactionId()));
    } finally {
      await session.close();
    }
  }

  async removeEdge(sourceId: string, targetId: string, type: string): Promise<MutationResult> {
    const session = this.session();
    try {
      return await session.executeWrite((tx) =>
        this.applyRemoveEdge(tx, sourceId, targetId, type, this.newTransactionId()),
      );
    } finally {
      await session.close();
    }
  }

  async getEdges(nodeId: string, direction: Direction, type?: string): Promise<RelationshipEntry[]> {
    const session = this.session();
    try {
      const edges = await this.readAllEdges(session);
      return edges
        .filter((e) => {
          if (type && e.relationshipType !== type) return false;
          if (direction === "out") return e.sourceId === nodeId;
          if (direction === "in") return e.targetId === nodeId;
          return e.sourceId === nodeId || e.targetId === nodeId;
        })
        .map(clone);
    } finally {
      await session.close();
    }
  }

  // ---- Query operations ------------------------------------------------------

  async traverse(query: TraversalQuery): Promise<Subgraph> {
    const session = this.session();
    try {
      const nodesById = await this.readAllNodes(session);
      const edges = await this.readAllEdges(session);
      const visited = new Set<string>();
      const collectedEdges = new Map<string, RelationshipEntry>();
      const queue: Array<{ id: string; depth: number }> = [{ id: query.startNodeId, depth: 0 }];
      visited.add(query.startNodeId);

      while (queue.length > 0) {
        const { id, depth } = queue.shift() as { id: string; depth: number };
        if (depth >= query.maxDepth) continue;
        for (const edge of edges) {
          if (query.edgeTypes && !query.edgeTypes.includes(edge.relationshipType)) continue;
          const next = neighbourThrough(edge, id, query.direction);
          if (next === null) continue;
          const neighbour = nodesById.get(next);
          if (query.nodeTypes && (!neighbour || !query.nodeTypes.includes(neighbour.type))) continue;
          collectedEdges.set(edge.id, edge);
          if (!visited.has(next)) {
            visited.add(next);
            queue.push({ id: next, depth: depth + 1 });
          }
        }
      }

      const nodes: InventoryEntry[] = [];
      for (const id of visited) {
        const n = nodesById.get(id);
        if (n) nodes.push(clone(n));
        if (query.limit && nodes.length >= query.limit) break;
      }
      return { nodes, edges: [...collectedEdges.values()].map(clone) };
    } finally {
      await session.close();
    }
  }

  async findByType(type: string, filters: PropertyFilter[] = []): Promise<InventoryEntry[]> {
    const session = this.session();
    try {
      const res = await session.executeRead((tx) =>
        tx.run("MATCH (n:Entry {type: $type}) RETURN n.__meta AS meta", { type }),
      );
      const out: InventoryEntry[] = [];
      for (const rec of res.records) {
        const doc = (JSON.parse(rec.get("meta") as string) as NodeMeta).doc;
        if (filters.every((f) => matchesFilter(doc, f))) out.push(clone(doc));
      }
      return out;
    } finally {
      await session.close();
    }
  }

  async findPath(query: PathQuery): Promise<GraphPath[]> {
    const session = this.session();
    try {
      const edges = await this.readAllEdges(session);
      const maxDepth = query.maxDepth ?? 5;
      const limit = query.limit ?? Infinity;
      const paths: GraphPath[] = [];

      const dfs = (current: string, nodeIds: string[], path: RelationshipEntry[]): void => {
        if (paths.length >= limit) return;
        if (current === query.targetId && nodeIds.length > 1) {
          paths.push({ nodeIds: [...nodeIds], edges: [...path] });
          return;
        }
        if (path.length >= maxDepth) return;
        for (const edge of edges) {
          if (query.edgeTypes && !query.edgeTypes.includes(edge.relationshipType)) continue;
          const next = neighbourThrough(edge, current, "out");
          if (next === null || nodeIds.includes(next)) continue;
          dfs(next, [...nodeIds, next], [...path, edge]);
        }
      };

      dfs(query.sourceId, [query.sourceId], []);
      return paths.map((p) => ({ nodeIds: p.nodeIds, edges: p.edges.map(clone) }));
    } finally {
      await session.close();
    }
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
    const session = this.session();
    try {
      const res = await session.executeRead((tx) =>
        tx.run("MATCH (e:GraphEvent) RETURN e ORDER BY e.timestamp, e.seq"),
      );
      return res.records
        .map((rec) => parseEvent(rec.get("e").properties as Record<string, unknown>))
        .filter((e) => (since ? e.timestamp >= since : true))
        .filter((e) => (until ? e.timestamp <= until : true))
        .filter((e) => filters.every((f) => matchesEventFilter(e, f)));
    } finally {
      await session.close();
    }
  }

  /** Remove every node, edge and event — test helper, not part of the port. */
  async clear(): Promise<void> {
    const session = this.session();
    try {
      await session.executeWrite((tx) => tx.run("MATCH (n) DETACH DELETE n"));
    } finally {
      await session.close();
    }
  }

  // ---- Internals -------------------------------------------------------------

  private async commitStaged(staged: StagedOp[]): Promise<void> {
    const txId = this.newTransactionId();
    const session = this.session();
    try {
      await session.executeWrite(async (tx) => {
        for (const op of staged) {
          let result: MutationResult;
          if (op.kind === "upsert") result = await this.applyUpsert(tx, op.node, op.options ?? {}, txId);
          else if (op.kind === "createEdge") result = await this.applyCreateEdge(tx, op.edge, txId);
          else result = await this.applyRemoveEdge(tx, op.sourceId, op.targetId, op.type, txId);
          if (!result.success) {
            // Throwing aborts the managed transaction → all staged ops roll back.
            throw new Error(result.error?.message ?? "transaction operation failed");
          }
        }
      });
    } finally {
      await session.close();
    }
  }

  private async applyUpsert(
    tx: ManagedTransaction,
    node: InventoryEntry,
    options: UpsertOptions,
    txId: string,
  ): Promise<MutationResult> {
    const meta = await this.readMetaTx(tx, node.id);
    if (meta && options.expectedRevision !== undefined && options.expectedRevision !== meta.revision) {
      return {
        success: false,
        eventId: "",
        error: {
          code: "CONFLICT",
          message: `Optimistic concurrency conflict: expected revision ${options.expectedRevision}, found ${meta.revision}`,
        },
      };
    }

    const timestamp = this.clock();
    if (!meta) {
      const stored = clone(node);
      const newMeta: NodeMeta = { doc: stored, revision: 1, history: [{ timestamp, state: clone(stored), retired: false }] };
      await tx.run("CREATE (n:Entry {id: $id, type: $type, __meta: $meta})", {
        id: node.id,
        type: node.type,
        meta: JSON.stringify(newMeta),
      });
      const eventId = await this.emit(tx, "NodeCreated", node.type, node.id, null, stored, options, txId, timestamp);
      return { success: true, eventId, revision: 1 };
    }

    if (deepEqual(meta.doc, node)) {
      return { success: true, eventId: "", revision: meta.revision, noop: true };
    }

    const previous = clone(meta.doc);
    const updated = clone(node);
    const newMeta: NodeMeta = {
      doc: updated,
      revision: meta.revision + 1,
      history: [...meta.history, { timestamp, state: clone(updated), retired: false }],
    };
    await tx.run("MATCH (n:Entry {id: $id}) SET n.type = $type, n.__meta = $meta", {
      id: node.id,
      type: node.type,
      meta: JSON.stringify(newMeta),
    });
    const eventId = await this.emit(tx, "NodeUpdated", node.type, node.id, previous, updated, options, txId, timestamp);
    return { success: true, eventId, revision: newMeta.revision };
  }

  private async applyDelete(tx: ManagedTransaction, id: string, txId: string): Promise<MutationResult> {
    const meta = await this.readMetaTx(tx, id);
    if (!meta) {
      return { success: false, eventId: "", error: { code: "NOT_FOUND", message: `Node ${id} does not exist` } };
    }
    const timestamp = this.clock();
    const previous = clone(meta.doc);
    const retired = clone(meta.doc);
    retired.lifecycle_status = "retired";
    retired.validTo = timestamp;
    const newMeta: NodeMeta = {
      doc: retired,
      revision: meta.revision + 1,
      history: [...meta.history, { timestamp, state: clone(retired), retired: true }],
    };
    await tx.run("MATCH (n:Entry {id: $id}) SET n.__meta = $meta", { id, meta: JSON.stringify(newMeta) });
    const eventId = await this.emit(tx, "NodeRetired", retired.type, id, previous, retired, {}, txId, timestamp);
    return { success: true, eventId, revision: newMeta.revision };
  }

  private async applyRemoveNode(tx: ManagedTransaction, id: string, txId: string): Promise<MutationResult> {
    const meta = await this.readMetaTx(tx, id);
    if (!meta) {
      return { success: false, eventId: "", error: { code: "NOT_FOUND", message: `Node ${id} does not exist` } };
    }
    const timestamp = this.clock();
    const previous = clone(meta.doc);
    // Emit EdgeRemoved for each incident edge before detaching.
    const incident = await tx.run(
      "MATCH (n:Entry {id: $id})-[r:REL]-() RETURN r.id AS id, r.relationshipType AS type, r.__doc AS doc",
      { id },
    );
    for (const rec of incident.records) {
      const edge = JSON.parse(rec.get("doc") as string) as RelationshipEntry;
      await this.emit(tx, "EdgeRemoved", `Relationship:${edge.relationshipType}`, edge.id, edge, null, {}, txId, this.clock());
    }
    await tx.run("MATCH (n:Entry {id: $id}) DETACH DELETE n", { id });
    const eventId = await this.emit(tx, "NodeRetired", previous.type, id, previous, null, {}, txId, timestamp);
    return { success: true, eventId };
  }

  private async applyCreateEdge(tx: ManagedTransaction, edge: RelationshipEntry, txId: string): Promise<MutationResult> {
    const countRes = await tx.run(
      "MATCH (:Entry {id: $src})-[r:REL {relationshipType: $type}]->() RETURN count(r) AS c",
      { src: edge.sourceId, type: edge.relationshipType },
    );
    const currentCount = toNumber(countRes.records[0]?.get("c"));
    const cardinality = this.relRegistry.canAddEdge(edge.relationshipType, currentCount);
    if (!cardinality.valid) {
      return {
        success: false,
        eventId: "",
        error: { code: "CARDINALITY", message: cardinality.errors[0]?.message ?? "cardinality violation" },
      };
    }
    const stored = clone(edge);
    await tx.run(
      `MATCH (s:Entry {id: $src}), (t:Entry {id: $tgt})
       CREATE (s)-[:REL {id: $id, relationshipType: $type, __doc: $doc}]->(t)`,
      { src: edge.sourceId, tgt: edge.targetId, id: edge.id, type: edge.relationshipType, doc: JSON.stringify(stored) },
    );
    const timestamp = this.clock();
    const eventId = await this.emit(tx, "EdgeCreated", `Relationship:${edge.relationshipType}`, edge.id, null, stored, {}, txId, timestamp);
    return { success: true, eventId };
  }

  private async applyRemoveEdge(
    tx: ManagedTransaction,
    sourceId: string,
    targetId: string,
    type: string,
    txId: string,
  ): Promise<MutationResult> {
    const found = await tx.run(
      `MATCH (:Entry {id: $src})-[r:REL {relationshipType: $type}]->(:Entry {id: $tgt})
       RETURN r.__doc AS doc LIMIT 1`,
      { src: sourceId, tgt: targetId, type },
    );
    const docStr = found.records[0]?.get("doc") as string | undefined;
    if (!docStr) {
      return { success: false, eventId: "", error: { code: "NOT_FOUND", message: "edge does not exist" } };
    }
    const removed = JSON.parse(docStr) as RelationshipEntry;
    await tx.run(
      `MATCH (:Entry {id: $src})-[r:REL {relationshipType: $type}]->(:Entry {id: $tgt}) DELETE r`,
      { src: sourceId, tgt: targetId, type },
    );
    const timestamp = this.clock();
    const eventId = await this.emit(tx, "EdgeRemoved", `Relationship:${type}`, removed.id, removed, null, {}, txId, timestamp);
    return { success: true, eventId };
  }

  private async emit(
    tx: ManagedTransaction,
    mutationType: MutationType,
    entityType: string,
    entityId: string,
    previousState: object | null,
    newState: object | null,
    options: UpsertOptions,
    transactionId: string,
    timestamp: string,
  ): Promise<string> {
    const eventId = randomUUID();
    await tx.run(
      `CREATE (e:GraphEvent {
        eventId: $eventId, timestamp: $timestamp, seq: $seq, mutationType: $mutationType,
        entityType: $entityType, entityId: $entityId, __previous: $previous, __new: $new,
        __trigger: $trigger, confidence: $confidence, transactionId: $transactionId
      })`,
      {
        eventId,
        timestamp,
        seq: this.nextSeq(),
        mutationType,
        entityType,
        entityId,
        previous: previousState ? JSON.stringify(previousState) : null,
        new: newState ? JSON.stringify(newState) : null,
        trigger: JSON.stringify(options.trigger ?? this.defaultTrigger),
        confidence: options.confidence ?? 1,
        transactionId,
      },
    );
    return eventId;
  }

  private async readMeta(session: Session, id: string): Promise<NodeMeta | null> {
    const res = await session.executeRead((tx) =>
      tx.run("MATCH (n:Entry {id: $id}) RETURN n.__meta AS meta", { id }),
    );
    const meta = res.records[0]?.get("meta") as string | undefined;
    return meta ? (JSON.parse(meta) as NodeMeta) : null;
  }

  private async readMetaTx(tx: ManagedTransaction, id: string): Promise<NodeMeta | null> {
    const res = await tx.run("MATCH (n:Entry {id: $id}) RETURN n.__meta AS meta", { id });
    const meta = res.records[0]?.get("meta") as string | undefined;
    return meta ? (JSON.parse(meta) as NodeMeta) : null;
  }

  private async readAllNodes(session: Session): Promise<Map<string, InventoryEntry>> {
    const res = await session.executeRead((tx) => tx.run("MATCH (n:Entry) RETURN n.__meta AS meta"));
    const map = new Map<string, InventoryEntry>();
    for (const rec of res.records) {
      const doc = (JSON.parse(rec.get("meta") as string) as NodeMeta).doc;
      map.set(doc.id, doc);
    }
    return map;
  }

  private async readAllEdges(session: Session): Promise<RelationshipEntry[]> {
    const res = await session.executeRead((tx) => tx.run("MATCH ()-[r:REL]->() RETURN r.__doc AS doc"));
    return res.records.map((rec) => JSON.parse(rec.get("doc") as string) as RelationshipEntry);
  }

  private newTransactionId(): string {
    return randomUUID();
  }

  private seq = 0;
  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}

/**
 * Build a {@link Neo4jGraphAdapter} from `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`
 * (used by the guarded integration test). Returns `null` when `NEO4J_URI` is unset
 * so callers can skip cleanly without an external service. Run locally with e.g.:
 *
 *   docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
 *   NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword pnpm test
 */
export function neo4jAdapterFromEnv(options: Neo4jGraphOptions = {}): { adapter: Neo4jGraphAdapter; driver: Driver } | null {
  const uri = process.env.NEO4J_URI;
  if (!uri) return null;
  const user = process.env.NEO4J_USER ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "neo4j";
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return { adapter: new Neo4jGraphAdapter(driver, options), driver };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function neighbourThrough(edge: RelationshipEntry, from: string, direction: Direction): string | null {
  if (direction === "out" || direction === "both") {
    if (edge.sourceId === from) return edge.targetId;
  }
  if (direction === "in" || direction === "both") {
    if (edge.targetId === from) return edge.sourceId;
  }
  return null;
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

function parseEvent(props: Record<string, unknown>): GraphMutationEvent {
  return {
    eventId: props.eventId as string,
    timestamp: props.timestamp as string,
    mutationType: props.mutationType as MutationType,
    entityType: props.entityType as string,
    entityId: props.entityId as string,
    previousState: props.__previous ? (JSON.parse(props.__previous as string) as object) : null,
    newState: props.__new ? (JSON.parse(props.__new as string) as object) : null,
    trigger: JSON.parse(props.__trigger as string) as Trigger,
    confidence: typeof props.confidence === "number" ? props.confidence : toNumber(props.confidence),
    transactionId: props.transactionId as string,
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  // neo4j Integer has a toNumber(); fall back to Number().
  const maybe = value as { toNumber?: () => number };
  if (typeof maybe.toNumber === "function") return maybe.toNumber();
  return Number(value);
}
