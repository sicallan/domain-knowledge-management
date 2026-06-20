# Feature 05 — Cross-Layer Linking (Decisions ↔ L1 / L2 / L3)

## 1. Feature

- **Name**: Cross-layer linking — persist and traverse the edges that connect a Decision to its L1
  domain concepts, L2 specs and L3 services, so cross-layer paths are queryable.
- **Plan step**: 2.5 — *Cross-layer linking: decisions link to L1 domain concepts, L2 specs, L3
  services* ([plan.md §Phase 2](../../../plan.md)).
- **Spec(s) expanded**:
  [specs/006-query-interface.md](../../../specs/006-query-interface.md) (traversal / path-finding —
  "return correct cross-layer paths") and
  [specs/002-graph-persistence-port.md](../../../specs/002-graph-persistence-port.md) (typed directed
  edges with cardinality enforcement + bidirectional traversal). Builds on the relationship schemas
  defined in **Feature 01**.

## 2. Summary & scope

The phase's integrating step: it makes the graph *cross-layer* by ensuring the decision-specific and
behavioural edges (defined in Feature 01, populated in Features 02/03) are **persisted with their
endpoints validated** and **traversable in both directions**, so a query can walk from a Decision out
to the L1 rules/invariants it evaluates, the L2 specs that satisfy it, and the L3 services that
realise it — and back. This realises the plan's promise that *"all relationships are navigable in
both directions for graph traversal"* and that the loader/query layers enforce the cardinality
constraints from [plan.md §Relationship Cardinality](../../../plan.md).

**In scope**
- **Loader support** for the behavioural + decision-specific edge types: validate endpoint types and
  cardinality against the Feature 01 schemas before `createEdge` (spec 002 §Edge Operations
  "Validates cardinality constraints").
- **Cross-layer traversal**: Query Interface `traverse`/`findPaths` returning correct paths that
  cross L1↔L2↔L3 (e.g. `Decision —evaluates→ Rule (L1)`, `Decision —realizedBy→ Service (L3)`,
  `RegulatoryRequirement —satisfiedBy→ Decision`).
- **Bidirectional navigability**: every cross-layer edge traversable `out`, `in`, and `both`
  (spec 006 `TraversalRequest.direction`).
- **Reference resolution / dangling-edge policy** for edges whose endpoint was extracted in a
  different pass (Feature 02/03 ordering): resolve to existing nodes or route to the review queue —
  no dangling edges committed.
- A **cross-layer integrity check**: enforce the conditional/cardinality rules at link time
  (`evaluates ≥ 1`, `produces ≥ 1`, `automated ⇒ triggeredBy`, `belongsTo` N:1, etc.).

**Out of scope**
- Defining the relationship schemas (Feature 01) or extracting the edges (Features 02/03).
- The **Compliance Matrix / Gap Analysis** cross-layer *views* (Phase 3+, spec 007) — this feature
  provides the traversable substrate, not those projections.
- L2 population — `VendorProduct`/`ProjectSpec` schemas arrive in Phase 3; where an L2 endpoint
  doesn't exist yet, the edge type is supported but simply has no instances (forward-compatible).
- Impact-assessment traversal/scoring (Phase 4, spec 009) — this is plain path-finding, not scoring.

## 3. Dependencies

- **Upstream**: **Feature 01** (edge schemas + cardinality rules); **Features 02/03** (the edges to
  persist); the **Phase 1 Graph Loader** (spec 002/003) and **Query Interface** (spec 006 `traverse`,
  `findPaths`) — both extended here, not replaced; the **Graph Persistence Port** (`createEdge`,
  `getEdges`, `traverse`, `findPaths`, event log).
- **Unblocks**: Feature 04's *cross-layer* decision highlighting (e.g. `realizedBy` service);
  Phase 3 coverage/gap views; Phase 4 impact assessment, which traverses exactly these
  decision-centric cross-layer edges for "the most signal".
- **Cross-feature**: shares the reference-resolution / review-queue contract flagged in Features
  02 §11 and 03 §11.

## 4. Applied decisions

> Phase 2 decisions are locked in [`docs/phase-2/decisions.md`](../../phase-2/decisions.md). Binding
> here: **D-P2.2** (cardinality enforced at load/link time too, one shared rule set), **D-P2.5**
> (quarantine invalid/dangling edges to the review queue, never drop or commit dangling), and the
> "Deferred to their own feature" note on L2 endpoints (register types now, don't gate on L2 data).
> Carried-forward Phase 1 decisions and accepted ADRs also bind; §11 holds residual risks.

| Decision | How it constrains this feature |
|---|---|
| **D-P1.2 — in-memory + Neo4j adapters** | Cross-layer traversal must give identical results on both adapters (the port-parity contract). |
| **D-P1.3 — language split** | Loader + Query Interface are **TypeScript**; consume the Python-emitted JSONL edges across the file boundary. |
| **D-P1.4 — flesh out, don't build** | Definition only this round. |
| **spec 002 §Edge Operations** | Cardinality validated at `link`/`createEdge`; `EdgeCreated` events emitted (feed view invalidation). |
| **spec 006 Decision 1 — dedicated Query Service** | Cross-layer traversal is exposed through the Query Service, not direct port access from consumers. |
| **spec 006 Decision 3 — cursor pagination** | Large traversal/path result sets paginate via cursors. |
| **ADR-0001** | Edges arrive as typed JSONL relationship entries; no OKF at the core. |

## 5. User stories

- *As a compliance officer, I want to trace an automated decision to the rules it evaluates, the
  invariants that constrain it, and the regulation it satisfies, so that I can prove regulatory
  alignment across layers in one traversal.*
- *As a developer, I want to walk from a decision to the L3 service that realises it (and back from a
  service to the decisions it implements), so that I can assess change blast-radius.*
- *As a domain architect, I want cross-layer edges rejected at load time if they violate cardinality
  (e.g. an automated decision with no trigger), so that the graph never holds structurally invalid
  decision links.*
- *As a platform maintainer, I want traversal to behave identically on the in-memory and Neo4j
  adapters, so that the port abstraction is proven before any graph-DB lock-in.*

## 6. Acceptance criteria (Given/When/Then)

1. **Edge persisted with validated endpoints** — *Given* an `evaluates(Decision→Rule)` relationship
   entry, *when* the loader processes it, *then* `createEdge` is called only after endpoint **types**
   and the Feature 01 schema validate; an edge with a wrong-typed endpoint is rejected + reported
   (not silently dropped).
2. **Cardinality enforced at link time** — *Given* a `Decision` being linked with zero `evaluates`
   edges, *when* the integrity check runs, *then* the link/load is rejected (or queued) per the
   `evaluates ≥ 1` rule; likewise `produces ≥ 1` and `automated ⇒ triggeredBy`.
3. **Cross-layer path found** — *Given* a seeded graph with `Decision —evaluates→ Rule (L1)` and
   `Decision —realizedBy→ Service (L3)`, *when* `findPaths(decisionId → serviceId)` runs, *then* the
   correct cross-layer path is returned.
4. **Bidirectional navigability** — *Given* `Decision —realizedBy→ Service`, *when* traversing from
   the **Service** with `direction: 'in'`, *then* the Decision is reached (the edge is navigable both
   ways — plan guarantee).
5. **Regulatory trace** — *Given* `RegulatoryRequirement —satisfiedBy→ Decision —evaluates→ Rule`,
   *when* traversing from the requirement with `maxDepth ≥ 2`, *then* the decision and its rules are
   returned as a connected subgraph.
6. **Dangling-edge resolution** — *Given* an `invokes(Step→Decision)` edge whose Decision endpoint
   wasn't extracted, *when* the loader processes it, *then* it is **not** committed as a dangling
   edge — it is routed to review and counted (the cross-pass resolution contract from Features
   02/03).
7. **Adapter parity** — *Given* identical seed data, *when* the cross-layer traversals run against
   the in-memory and Neo4j adapters, *then* results are identical (D-P1.2 / spec 002 contract tests).
8. **Edge events emitted** — *Given* a successful cross-layer `createEdge`, *when* it commits, *then*
   an `EdgeCreated` `GraphMutationEvent` is logged (so Feature 04's `invalidatedBy` can react).

## 7. Interface contracts

Reuse spec 002 + spec 006 verbatim — no new interfaces; this feature extends the loader's edge
handling and exercises existing traversal:

```typescript
// spec 002 — graph port (unchanged)
interface GraphPort {
  createEdge(edge: RelationshipEntry): Promise<MutationResult>;   // validates cardinality, emits EdgeCreated
  getEdges(nodeId: string, direction: 'in'|'out'|'both', type?: string): Promise<RelationshipEntry[]>;
  traverse(query: TraversalQuery): Promise<Subgraph>;
  // findPaths(query: PathQuery): Promise<...>  // path-finding
}

// spec 006 — query service (unchanged)
interface QueryService {
  traverse(query: TraversalRequest, context: QueryContext): Promise<SubgraphResult>;
  findPaths(query: PathRequest, context: QueryContext): Promise<PathResult>;
}
interface TraversalRequest {
  startNodeId: string; direction: 'out'|'in'|'both';
  edgeTypes?: string[]; nodeTypes?: string[]; maxDepth: number; includeEdges: boolean;
}
```

The supported cross-layer edge types are exactly those in [plan.md §Relationships](../../../plan.md)
that span layers: decision-specific (`evaluates`, `consumes`, `constrainedBy`, `triggeredBy`,
`produces`, `realizedBy`), structural (`implements`, `belongsTo`, `constrainedBy`, `usesReferenceData`,
`governs`), and regulatory (`satisfiedBy`, `obliges`, `exposes`).

## 8. TDD test plan (write these first)

- **Unit — `cross-layer-edge-load.test.ts`**: valid edge → `createEdge`; wrong-typed endpoint →
  rejected + reported; schema-invalid edge excluded (criterion 1).
- **Unit — `link-time-cardinality.test.ts`**: `evaluates ≥ 1`, `produces ≥ 1`, `automated ⇒
  triggeredBy`, `belongsTo` N:1 enforced at load (criterion 2).
- **Unit — `dangling-edge-policy.test.ts`**: edge with a missing endpoint routed to review, not
  committed; counted in stats (criterion 6).
- **Contract — `traversal-cross-layer.test.ts`**: cross-layer `findPaths`/`traverse` return correct
  paths; bidirectional navigation (criteria 3–5).
- **Contract — `adapter-parity-traversal.test.ts`** (auto-skips Neo4j without `NEO4J_URI` per
  [CLAUDE.md](../../../CLAUDE.md)): identical results on in-memory and Neo4j adapters (criterion 7).
- **Integration — `cross-layer-end-to-end.test.ts`**: JSONL edges from Features 02/03 fixtures →
  loader → graph → cross-layer traversal returns the expected connected subgraph; `EdgeCreated`
  events logged (criterion 8).

## 9. Task breakdown

1. [ ] Extend the loader to recognise + validate the behavioural and decision-specific edge types
   against the Feature 01 schemas (endpoint types).
2. [ ] Implement the link-time cardinality/conditional integrity check (reusing Feature 01 rules).
3. [ ] Implement the dangling-edge / cross-pass reference-resolution policy (resolve or queue).
4. [ ] Verify Query Interface `traverse`/`findPaths` handle the new edge types with bidirectional
   navigation + node/edge-type filters.
5. [ ] Add cross-layer fixtures spanning L1↔L3 (and a regulatory→decision trace).
6. [ ] Contract + integration tests, including in-memory/Neo4j parity (Neo4j auto-skip without env).
7. [ ] Confirm `EdgeCreated` events fire so Feature 04 invalidation reacts.

## 10. OCP extension points

- **Open**: new cross-layer edge types (e.g. L2 `satisfiedBy → ProjectSpec` instances when Phase 3
  lands) supported by adding their Feature 01 schemas — loader/query handle them generically by
  type; new graph adapters behind the port.
- **Closed**: the `GraphPort` and `QueryService` interfaces; the JSONL relationship contract; the
  bidirectional-traversal guarantee. Adding an edge type must not modify loader/query core or the
  port — it is driven by the relationship schema registry.

## 11. Open questions / risks

- **Where cardinality is *enforced* vs *defined*.** Feature 01 *defines* the rules; this feature
  enforces them at **load/link time**, and the extraction gate (Feature 03) enforces them at
  **emit time**. *Recommendation:* both layers enforce (defence in depth) reading one shared rule
  set — confirm the rules live in one place (the cardinality/quality module) to avoid drift.
- **Reject vs quarantine for invalid cross-layer edges.** Hard-reject keeps the graph clean but loses
  signal; quarantine (review queue) preserves it. *Recommendation:* quarantine + count (consistent
  with D-P1.5's two-tier "missed/uncertain is recoverable, wrong auto-merge is expensive" stance).
- **Path explosion on deep cross-layer traversal** (spec 006 Open Q1). Decision→…→Service paths can
  fan out. *Recommendation:* enforce a `maxDepth` and result cap with a "truncated" marker; align with
  the Query Interface complexity-limit decision.
- **L2 endpoints absent until Phase 3.** `satisfiedBy → ProjectSpec` and vendor edges have no
  instances yet. Confirm the edge *types* are registered now (forward-compatible) but not gated on L2
  data existing.
- **Workflow engine** (deferred, Phase 2): not triggered by this feature — loading is synchronous and
  in-process. Noted only so the phase-level decision is made deliberately (see Feature 02 §11).
