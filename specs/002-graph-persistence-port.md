# 002 — Graph Persistence Port

## Purpose & Scope

The Graph Persistence Port defines the abstract interface through which the platform reads from and writes to a graph store. It isolates all graph storage concerns behind a contract, enabling the team to defer the graph database choice (Neo4j, Neptune, in-memory) until load profiles are understood — while developing and testing against the interface from day one.

**In scope:**
- Abstract port interface for graph CRUD operations (nodes and edges)
- Event log contract (every mutation produces an immutable event)
- Transaction semantics (atomic multi-operation commits)
- Query primitives (traversal, pattern matching, path finding)
- In-memory stub implementation for development and testing
- Port contract test suite (adapter-agnostic, runnable against any implementation)

**Out of scope:**
- Specific graph database implementation (Neo4j adapter, Neptune adapter) — those are adapters
- Vector/embedding storage — separate port
- Relational storage (PostgreSQL) — separate port
- Query planning and optimisation — that's the Query Interface's job

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Node (inventory entry) | Loaders, API mutations | Validated JSON conforming to inventory type schema |
| Edge (relationship) | Loaders, API mutations | Validated JSON conforming to relationship schema |
| Query specification | Query Interface, View Engine | Typed query objects (see Interfaces below) |
| Transaction boundary | Orchestrating component | Begin/commit/rollback signals |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Query results | Query Interface, View Engine | Typed result sets (nodes, edges, paths) |
| Mutation events | Event log consumers (quality scoring, real-time UI, audit) | Immutable event objects |
| Transaction outcome | Caller | Success/failure with rollback on failure |

---

## Behaviour

### Node Operations

- **upsert(node)**: Insert or update a node. If a node with the same `id` exists, update it (creating a new version). Emits `NodeCreated` or `NodeUpdated` event.
- **get(id)**: Retrieve a node by ID. Returns latest version by default. Supports temporal query (get state at time T).
- **delete(id)**: Soft-delete: sets `lifecycle_status` to `retired` and `validTo` to now. Emits `NodeRetired` event. Hard-delete only via admin operation.
- **exists(id)**: Check existence without retrieving full node.

### Edge Operations

- **link(source, target, relationshipType, metadata)**: Create a typed, directed edge. Validates cardinality constraints. Emits `EdgeCreated` event.
- **unlink(source, target, relationshipType)**: Remove an edge. Emits `EdgeRemoved` event.
- **getEdges(nodeId, direction, type?)**: Get edges for a node, optionally filtered by direction and type.

### Query Operations

- **traverse(startNode, pattern, depth)**: Follow edges matching a pattern up to N hops. Returns subgraph.
- **findByType(type, filters)**: Find all nodes of a given inventory type, with optional property filters.
- **findPath(source, target, constraints)**: Find paths between two nodes, optionally constrained by edge types or intermediate node types.
- **pattern(graphPattern)**: Match a graph pattern (e.g., "Decision that evaluates Rule that governs Service").

### Event Log

Every mutation operation produces an immutable event:

```typescript
interface GraphMutationEvent {
  eventId: string;              // UUID
  timestamp: string;            // ISO 8601
  mutationType: 'NodeCreated' | 'NodeUpdated' | 'NodeRetired' | 'EdgeCreated' | 'EdgeRemoved';
  entityType: string;           // Inventory type or relationship type
  entityId: string;             // Affected node/edge ID
  previousState: object | null; // null for create
  newState: object | null;      // null for delete
  trigger: {
    type: 'loader' | 'api' | 'agent' | 'admin';
    identity: string;           // Who/what initiated the change
  };
  confidence: number;           // For agent-initiated changes
  transactionId: string;        // Groups events within a transaction
}
```

### Transaction Semantics

- **Atomicity**: Multiple operations can be grouped in a transaction. Either all succeed or all roll back.
- **Event emission**: Events are emitted only on successful commit.
- **Optimistic concurrency**: Node updates include a version check. If the node was modified since read, the update fails with a conflict error.

### Temporal Queries

- **Point-in-time**: "What did the graph look like at time T?" — reconstructed from event log.
- **Diff**: "What changed between T1 and T2?" — events within the time range.
- **Bi-temporal**: Supports both valid time (when the fact was true) and transaction time (when we learned it).

---

## Interfaces & Contracts

### GraphPort (Primary Interface)

```typescript
interface GraphPort {
  // Node operations
  upsertNode(node: InventoryEntry): Promise<MutationResult>;
  getNode(id: string, atTime?: string): Promise<InventoryEntry | null>;
  deleteNode(id: string): Promise<MutationResult>;
  nodeExists(id: string): Promise<boolean>;

  // Edge operations
  createEdge(edge: RelationshipEntry): Promise<MutationResult>;
  removeEdge(sourceId: string, targetId: string, type: string): Promise<MutationResult>;
  getEdges(nodeId: string, direction: 'in' | 'out' | 'both', type?: string): Promise<RelationshipEntry[]>;

  // Query operations
  traverse(query: TraversalQuery): Promise<Subgraph>;
  findByType(type: InventoryType, filters?: PropertyFilter[]): Promise<InventoryEntry[]>;
  findPath(query: PathQuery): Promise<GraphPath[]>;
  patternMatch(pattern: GraphPattern): Promise<PatternResult[]>;

  // Transaction support
  beginTransaction(): Promise<Transaction>;
  
  // Event log access
  getEvents(since: string, until?: string, filters?: EventFilter[]): Promise<GraphMutationEvent[]>;
}

interface Transaction {
  upsertNode(node: InventoryEntry): Promise<MutationResult>;
  createEdge(edge: RelationshipEntry): Promise<MutationResult>;
  removeEdge(sourceId: string, targetId: string, type: string): Promise<MutationResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface MutationResult {
  success: boolean;
  eventId: string;
  error?: GraphError;
}

interface TraversalQuery {
  startNodeId: string;
  edgeTypes?: string[];       // Filter by relationship type
  nodeTypes?: string[];       // Filter intermediate nodes by type
  direction: 'out' | 'in' | 'both';
  maxDepth: number;
  limit?: number;
}

interface PathQuery {
  sourceId: string;
  targetId: string;
  edgeTypes?: string[];
  maxDepth?: number;
  limit?: number;             // Max number of paths to return
}

interface Subgraph {
  nodes: InventoryEntry[];
  edges: RelationshipEntry[];
}
```

### Port Contract Test Suite

The contract test suite validates that any adapter implementation satisfies the port's behavioural contract:

1. **CRUD correctness**: Upsert creates; re-upsert updates; get returns latest; delete soft-removes
2. **Edge operations**: Link creates; unlink removes; cardinality enforced
3. **Event emission**: Every mutation produces exactly one event with correct type and payload
4. **Transaction atomicity**: Partial failure rolls back all operations in the transaction
5. **Concurrency**: Optimistic locking rejects stale updates
6. **Temporal queries**: Point-in-time retrieval returns correct historical state
7. **Traversal correctness**: Multi-hop traversal returns complete reachable subgraph within depth limit
8. **Idempotency**: Re-upserting the same node (same version) is a no-op

These tests are parameterised — they accept a factory that produces a `GraphPort` instance. Running against in-memory stub in unit tests; running against real DB in integration tests.

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Schema Module | Validates nodes/edges before persistence |

| Depended on by | Reason |
|----------------|--------|
| Graph Loader | Writes extracted entries to the graph |
| Query Interface | Reads from the graph |
| View Projection Engine | Reads graph data to materialise views |
| Impact Assessment Agent | Traverses the graph for impact analysis |
| Contradiction Agent | Queries the graph for conflicting facts |
| Real-time update system | Consumes the event log |
| Audit trail | Event log provides compliance audit |

---

## Key Decisions

### Decision 1: Interface Granularity

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Single unified port (as above)** | One interface to implement per adapter; simpler dependency injection; query and mutation in one place | Large interface; adapters must implement everything; harder to mock partially |
| **Separated read/write ports (CQRS-style)** | Clear separation of concerns; read port can be optimised independently; write port focused on mutation + events | More interfaces to manage; some operations (e.g., "upsert then read back") span both; more complex wiring |
| **Fine-grained ports (per operation category)** | Maximum flexibility; each concern testable in isolation | Interface proliferation; complex DI configuration; over-engineering for current scale |

**Recommendation: Single unified port with logical method grouping**

*Rationale*: At our scale (single-team, early phases), the overhead of CQRS separation isn't justified. The unified port is simpler to implement, test, and reason about. If query patterns diverge significantly from write patterns in Phase 3+, we can split the interface then. The contract test suite already groups tests by concern, making future separation straightforward.

---

### Decision 2: Event Log Storage

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Co-located with graph store** | Single deployment; events and state consistent; simpler transactions | Ties event log to graph DB choice; may not scale independently; replaying events requires graph DB access |
| **Separate append-only store (e.g., event table in PostgreSQL, or Kafka)** | Independent scaling; event log survives graph DB replacement; natural pub/sub for consumers | Distributed transaction complexity; eventual consistency between graph state and events; additional infra |
| **Embedded in adapter (each adapter manages its own events)** | Simplest implementation; no additional infra; events are an adapter concern | Events are coupled to adapter implementation; harder to consume events from multiple stores |

**Recommendation: Separate append-only store (PostgreSQL event table initially)**

*Rationale*: The event log serves multiple consumers (real-time updates, audit, temporal queries, undo) that should not depend on the graph DB. PostgreSQL is already in the stack for structured queries. An event table with immutable inserts is simple, queryable, and supports the replay/time-travel use cases. If throughput demands grow, the table can be replaced with a streaming platform (Kafka) behind the same interface.

---

### Decision 3: Graph Database Selection Timing

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Decide now (Neo4j)** | Team can learn the technology early; production-grade from start; rich Cypher query language | Premature commitment; may not suit actual query patterns; licensing cost before validation |
| **Defer until end of Phase 0 (as plan states)** | Query patterns inform choice; port interface proves the abstraction works; can evaluate multiple options | Development uses in-memory stub; integration tests deferred; risk of port interface not fitting chosen DB |
| **Defer until Phase 1 (after first vertical slice)** | Real extraction data available; realistic load profile; most informed decision | Longest deferral; more rework if port interface needs significant changes |

**Recommendation: Defer until end of Phase 0, with Neo4j as the leading candidate**

*Rationale*: The plan's Last Responsible Moment strategy is correct. The port interface stabilises in Phase 0b; we evaluate Neo4j (Community Edition) for the Phase 1 integration tests. In-memory stub is sufficient for unit tests and Phase 0 development. If the port contract tests pass against both the stub and Neo4j, we have confidence the abstraction works.

---

### Decision 4: Optimistic Concurrency Mechanism

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Version number (incrementing integer)** | Simple; deterministic; easy to compare | Requires read-before-write; version must be stored and maintained |
| **ETag / content hash** | No separate version counter needed; detects any change | Expensive to compute for large nodes; doesn't indicate direction of change |
| **Timestamp-based (last-modified)** | Already have `updatedAt`; no additional field | Clock skew issues; sub-second conflicts not detected |

**Recommendation: Version number (incrementing integer)**

*Rationale*: We already have `version` as a semantic version for the schema, but nodes need a separate monotonic revision counter for concurrency control. It's the simplest and most deterministic approach. The revision is incremented on every successful upsert and checked on update — if the provided revision doesn't match the stored revision, the update is rejected with a conflict error.

---

## Open Questions

1. **Bulk operations**: Should the port support batch upsert (for loader performance), or should bulk be handled at the transaction level?
2. **Index hints**: Should the port interface allow callers to hint at expected query patterns, or is indexing purely an adapter concern?
3. **Event ordering guarantees**: Within a transaction, are events ordered? Across transactions, is ordering guaranteed (global sequence) or only per-entity?
