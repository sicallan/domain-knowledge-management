import type { GraphPort } from "@dkm/knowledge-graph";
import { createFullRelationshipRegistry } from "@dkm/schema";
import type { JsonlEntry, RelationshipTypeRegistry } from "@dkm/schema";
import { entryToEdge, entryToNode, isRelationship, MappingError } from "./mapping";
import type {
  EntryLoadResult,
  HealthStatus,
  IntegrityViolation,
  LoaderConfig,
  LoaderPort,
  LoadError,
  LoadResult,
  QuarantinedEdge,
  QuarantineReason,
} from "./port";

/** Per-run bookkeeping for idempotency and rollback (held by the loader). */
interface RunRecord {
  /** JSONL entry ids processed in this run — backs `hasProcessed`. */
  entryIds: Set<string>;
  /** Node ids created in this run — removed on `rollbackRun`. */
  nodeIds: Set<string>;
  /** Edges created in this run — removed on `rollbackRun`. */
  edges: Array<{ sourceId: string; targetId: string; type: string }>;
}

export interface GraphLoaderOptions {
  /** JSONL fields required before an entry is mappable (default `["type", "data"]`). */
  requiredFields?: string[];
  /**
   * The single shared rule set used for link-time endpoint-type + cardinality validation
   * (D-P2.2). Defaults to {@link createFullRelationshipRegistry} (decision-specific +
   * structural + behavioural + cross-layer). Inject a custom registry to add edge types
   * without modifying the loader (OCP).
   */
  relationshipRegistry?: RelationshipTypeRegistry;
}

/**
 * GraphLoader — the first concrete {@link LoaderPort} (spec 003), populating the
 * graph store from the intermediate JSONL. It writes **through the spec-002 graph
 * port** ({@link GraphPort}) and never touches a graph DB directly, so the database
 * choice stays swappable (D-P1.2: in-memory for dev/CI, Neo4j for integration).
 *
 * Behaviour highlights:
 *  - **Streaming**: consumes `AsyncIterable<JsonlEntry>` one entry at a time.
 *  - **Entity-first** (`orderedProcessing: true`): inventory entries become nodes;
 *    relationship entries become edges only once both endpoints exist — a missing
 *    endpoint is a *non-retriable* error in `LoadResult.errors[]`, not a crash.
 *  - **Idempotent**: `hasProcessed(id, runId)` skips already-loaded entries on replay,
 *    so a re-run reports `skipped == total`, `loaded == 0`, and leaves the graph as-is.
 *  - **Skip-and-continue**: one bad entry never aborts the load; errors are classified
 *    `retriable` (transient store fault) vs not (bad data / schema).
 *  - **Rollback**: `rollbackRun(runId)` removes that run's edges and nodes through the
 *    port, whose event log records each removal as a reversal.
 *  - **Events**: every node/edge mutation emits a graph event (the port's event log),
 *    consumed downstream by Query cache invalidation and Quality re-scoring.
 *
 * Idempotency/rollback state lives in the loader instance (spec 003: "stored by each
 * loader in its own target store"); cross-run deduplication is out of scope (Phase 5).
 */
export class GraphLoader implements LoaderPort {
  readonly name = "graph-loader";
  readonly targetStore = "graph";
  /** Entities must be processed before the relationships that reference them. */
  readonly orderedProcessing = true;
  readonly requiredFields: string[];

  private readonly graph: GraphPort;
  private readonly registry: RelationshipTypeRegistry;
  private initialized = false;
  private readonly runs = new Map<string, RunRecord>();

  constructor(graph: GraphPort, options: GraphLoaderOptions = {}) {
    this.graph = graph;
    this.requiredFields = options.requiredFields ?? ["type", "data"];
    this.registry = options.relationshipRegistry ?? createFullRelationshipRegistry();
  }

  async initialize(_config: LoaderConfig): Promise<void> {
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.initialized ? { healthy: true } : { healthy: false, detail: "loader not initialized" };
  }

  async load(entries: AsyncIterable<JsonlEntry>, runId: string): Promise<LoadResult> {
    const start = Date.now();
    let total = 0;
    let loaded = 0;
    let skipped = 0;
    let failed = 0;
    const errors: LoadError[] = [];
    const quarantine: QuarantinedEdge[] = [];

    for await (const entry of entries) {
      total += 1;
      const result = await this.loadSingle(entry, runId);
      if (result.status === "loaded") {
        loaded += 1;
      } else if (result.status === "skipped") {
        skipped += 1;
      } else if (result.status === "quarantined" && result.quarantine) {
        quarantine.push({ entryId: result.entryId, ...result.quarantine });
      } else {
        failed += 1;
        errors.push({
          entryId: result.entryId,
          error: result.error ?? "unknown",
          retriable: result.retriable ?? false,
        });
      }
    }

    // Totals reconcile by construction: loaded + skipped + failed + quarantined === totalEntries.
    return {
      runId,
      totalEntries: total,
      loaded,
      skipped,
      failed,
      errors,
      quarantined: quarantine.length,
      quarantine,
      duration: Date.now() - start,
    };
  }

  async loadSingle(entry: JsonlEntry, runId: string): Promise<EntryLoadResult> {
    const entryId = entry?.id ?? "(unknown)";

    if (entry?.id && (await this.hasProcessed(entry.id, runId))) {
      return { entryId, status: "skipped" };
    }

    const missing = this.missingRequiredFields(entry);
    if (missing.length > 0) {
      return {
        entryId,
        status: "failed",
        error: `missing required field(s): ${missing.join(", ")}`,
        retriable: false,
      };
    }

    try {
      return isRelationship(entry)
        ? await this.loadRelationship(entry, runId)
        : await this.loadEntity(entry, runId);
    } catch (err) {
      if (err instanceof MappingError) {
        return { entryId, status: "failed", error: err.message, retriable: false };
      }
      // An unexpected throw is treated as a transient store fault → retriable.
      const message = err instanceof Error ? err.message : String(err);
      return { entryId, status: "failed", error: message, retriable: true };
    }
  }

  async hasProcessed(entryId: string, runId: string): Promise<boolean> {
    return this.runs.get(runId)?.entryIds.has(entryId) ?? false;
  }

  async rollbackRun(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record) return;
    // Remove explicit edges first, then nodes (removeNode also detaches any
    // remaining incident edges). Each removal is recorded in the port's event log.
    for (const edge of record.edges) {
      await this.graph.removeEdge(edge.sourceId, edge.targetId, edge.type);
    }
    for (const nodeId of record.nodeIds) {
      await this.graph.removeNode(nodeId);
    }
    this.runs.delete(runId);
  }

  // ---- Internals -------------------------------------------------------------

  private async loadEntity(entry: JsonlEntry, runId: string): Promise<EntryLoadResult> {
    const node = entryToNode(entry);
    const result = await this.graph.upsertNode(node, {
      trigger: { type: "loader", identity: this.name },
      confidence: entry.confidence,
    });
    if (!result.success) {
      return { entryId: entry.id, status: "failed", error: result.error?.message ?? "upsert failed", retriable: false };
    }
    this.record(runId, entry.id).nodeIds.add(node.id);
    return { entryId: entry.id, status: "loaded" };
  }

  private async loadRelationship(entry: JsonlEntry, runId: string): Promise<EntryLoadResult> {
    const edge = entryToEdge(entry); // throws MappingError when endpoints/type are absent

    // 1. Resolve both endpoints. A missing endpoint is a *dangling* edge: quarantine it for
    //    cross-pass resolution — never commit, never drop (D-P2.5). We do NOT record it as
    //    processed, so a later pass that supplies the endpoint can still link it.
    const [source, target] = await Promise.all([
      this.graph.getNode(edge.sourceId),
      this.graph.getNode(edge.targetId),
    ]);
    if (!source || !target) {
      const missing = [source ? null : edge.sourceId, target ? null : edge.targetId].filter(
        (id): id is string => id !== null,
      );
      return this.quarantined(edge, "dangling-endpoint", `missing endpoint node(s): ${missing.join(", ")}`);
    }

    // 2. Validate endpoint TYPES against the shared registry — a coarse link-time gate (the
    //    fine per-kind constraint is the emit-time JSON-Schema gate). A wrong-typed endpoint is
    //    quarantined + reported, not committed (criterion 1). Edge types with open endpoints
    //    (or unknown to the registry) carry no constraint and pass (OCP default).
    const def = this.registry.get(edge.relationshipType);
    if (def?.sourceTypes && !def.sourceTypes.includes(source.type)) {
      return this.quarantined(
        edge,
        "endpoint-type-mismatch",
        `source ${edge.sourceId} is '${source.type}', expected one of ${def.sourceTypes.join("/")}`,
      );
    }
    if (def?.targetTypes && !def.targetTypes.includes(target.type)) {
      return this.quarantined(
        edge,
        "endpoint-type-mismatch",
        `target ${edge.targetId} is '${target.type}', expected one of ${def.targetTypes.join("/")}`,
      );
    }

    // 3. Max-cardinality at link time against the same rule set (e.g. belongsTo N:1). A breach
    //    is quarantined, not hard-failed (D-P2.5 / criterion 2).
    const existing = await this.graph.getEdges(edge.sourceId, "out", edge.relationshipType);
    const cardinality = this.registry.canAddEdge(edge.relationshipType, existing.length);
    if (!cardinality.valid) {
      return this.quarantined(edge, "cardinality-violation", cardinality.errors[0]?.message ?? "cardinality violation");
    }

    // 4. Commit. The port re-checks cardinality against its own rule set; a breach there is
    //    also quarantined rather than failed.
    const result = await this.graph.createEdge(edge);
    if (!result.success) {
      if (result.error?.code === "CARDINALITY") {
        return this.quarantined(edge, "cardinality-violation", result.error.message);
      }
      return {
        entryId: entry.id,
        status: "failed",
        error: result.error?.message ?? "edge create failed",
        retriable: false,
      };
    }
    this.record(runId, entry.id).edges.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.relationshipType,
    });
    return { entryId: entry.id, status: "loaded" };
  }

  /**
   * Link-time completeness check for a Decision node (D-P2.2), reading the shared registry:
   * `evaluates ≥ 1`, `produces ≥ 1`, and the conditional `automated ⇒ triggeredBy`. Returns
   * the violations (the review-queue signal); it does not un-commit anything. Run after a
   * load so cross-pass edges have arrived. A non-Decision / absent node yields no violations.
   */
  async checkDecisionIntegrity(decisionId: string): Promise<IntegrityViolation[]> {
    const node = await this.graph.getNode(decisionId);
    if (!node || node.type !== "Decision") return [];
    const violations: IntegrityViolation[] = [];

    for (const relationshipType of ["evaluates", "produces"]) {
      const count = (await this.graph.getEdges(decisionId, "out", relationshipType)).length;
      const result = this.registry.checkMinimum(relationshipType, count);
      if (!result.valid) {
        violations.push({
          decisionId,
          relationshipType,
          keyword: "minCardinality",
          detail: result.errors[0]?.message ?? `${relationshipType} below minimum`,
        });
      }
    }

    // triggeredBy targets the Decision, so the decision is the edge's target → count 'in' edges.
    const decisionType = typeof node.decisionType === "string" ? node.decisionType : "";
    const triggeredByCount = (await this.graph.getEdges(decisionId, "in", "triggeredBy")).length;
    const trigger = this.registry.checkAutomatedDecisionTrigger(decisionType, triggeredByCount);
    if (!trigger.valid) {
      violations.push({
        decisionId,
        relationshipType: "triggeredBy",
        keyword: "conditionalCardinality",
        detail: trigger.errors[0]?.message ?? "automated Decision requires a triggeredBy edge",
      });
    }

    return violations;
  }

  /** Build a quarantined {@link EntryLoadResult} (D-P2.5: held for review, not committed). */
  private quarantined(
    edge: { id: string; sourceId: string; targetId: string; relationshipType: string },
    reason: QuarantineReason,
    detail: string,
  ): EntryLoadResult {
    return {
      entryId: edge.id,
      status: "quarantined",
      quarantine: {
        relationshipType: edge.relationshipType,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        reason,
        detail,
      },
    };
  }

  private record(runId: string, entryId: string): RunRecord {
    let record = this.runs.get(runId);
    if (!record) {
      record = { entryIds: new Set(), nodeIds: new Set(), edges: [] };
      this.runs.set(runId, record);
    }
    record.entryIds.add(entryId);
    return record;
  }

  private missingRequiredFields(entry: JsonlEntry): string[] {
    const record = entry as unknown as Record<string, unknown>;
    return this.requiredFields.filter((field) => record?.[field] === undefined || record[field] === null);
  }
}
