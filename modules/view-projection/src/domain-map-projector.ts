import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import type {
  ContextRelationship,
  CrossContextRelationship,
  DomainMapContext,
  DomainMapParams,
  DomainMapSubdomain,
  DomainMapView,
  ViewMetadata,
  ViewProjector,
} from "./types";

const SUBDOMAIN = "Subdomain";
const BOUNDED_CONTEXT = "BoundedContext";
const DOMAIN_CONCEPT = "DomainConcept";
const SERVICE = "Service";
const BELONGS_TO = "belongsTo";

/** Synthetic bucket for bounded contexts that resolve to no subdomain (orphans). */
const UNASSIGNED_SUBDOMAIN_ID = "__unassigned__";

/** Node types whose mutation could change the Domain Map (used by `invalidatedBy`). */
const RELEVANT_NODE_TYPES = new Set([SUBDOMAIN, BOUNDED_CONTEXT, DOMAIN_CONCEPT, SERVICE]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/**
 * Domain Map projector (spec 007 §Example View Output Schemas; feature 05). Produces a
 * {@link DomainMapView} — subdomains → bounded contexts → contained concepts, plus
 * aggregated cross-context relationships — by composing **only** the Query Interface
 * primitives (`listEntries`, `traverse`). It never touches the graph port directly, so
 * adapter parity (in-memory ↔ Neo4j) is inherited from the Query Interface (D-P1.2).
 *
 * Nesting is read from the graph: bounded contexts and members are linked by `belongsTo`
 * edges (a context belongsTo a subdomain; concepts/services belongsTo a context), with
 * the denormalised `BoundedContext.subdomain` field as a fallback. Cross-context
 * relationships are edges between concepts in **different** contexts, aggregated with
 * `strength` = edge count.
 *
 * Registered with refresh policy `on-demand` (Phase 1). `invalidatedBy` is defined but
 * unused while on-demand (no cache to invalidate).
 *
 * **OCP**: this projector adds a view purely by implementing {@link ViewProjector} and
 * registering — the engine is untouched.
 */
export class DomainMapProjector implements ViewProjector<DomainMapParams, DomainMapView> {
  readonly viewType = "domain-map";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description:
        "Subdomains → bounded contexts → contained concepts, with cross-context relationships.",
      parameters: [
        { name: "subdomain", type: "string", required: false, description: "Restrict to a single subdomain (id or name)." },
        { name: "depth", type: "number", required: false, description: "Reserved traversal depth (unused in Phase 1)." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: DomainMapParams, context: QueryContext): Promise<DomainMapView> {
    const subdomainNodes = await this.listAll(SUBDOMAIN, context);
    const contextNodes = await this.listAll(BOUNDED_CONTEXT, context);

    if (subdomainNodes.length === 0 && contextNodes.length === 0) {
      // Empty-but-valid view (acceptance 5): no nulls, no throws.
      return { subdomains: [], crossContextRelationships: [] };
    }

    // 1. Members per context (via belongsTo edges into the context) + node→context map.
    const membersByContext = new Map<string, InventoryEntry[]>();
    const nodeContext = new Map<string, string>();
    for (const ctxNode of contextNodes) {
      const subgraph = await this.service.traverse(
        { startNodeId: ctxNode.id, direction: "in", edgeTypes: [BELONGS_TO], maxDepth: 1, includeEdges: false },
        context,
      );
      const members = subgraph.nodes.filter((node) => node.id !== ctxNode.id);
      membersByContext.set(ctxNode.id, members);
      for (const member of members) nodeContext.set(member.id, ctxNode.id);
    }

    // 2. Context → subdomain (belongsTo edge out of the context; denormalised field fallback).
    const contextSubdomain = new Map<string, string>();
    for (const ctxNode of contextNodes) {
      const subgraph = await this.service.traverse(
        { startNodeId: ctxNode.id, direction: "out", edgeTypes: [BELONGS_TO], maxDepth: 1, includeEdges: false },
        context,
      );
      const subdomainNode = subgraph.nodes.find((node) => node.id !== ctxNode.id && node.type === SUBDOMAIN);
      const subdomainId = subdomainNode?.id ?? str(ctxNode.subdomain);
      if (subdomainId) contextSubdomain.set(ctxNode.id, subdomainId);
    }

    // 3. Cross-context relationships: edges between members of different contexts.
    const crossContextRelationships = await this.aggregateCrossContext(membersByContext, nodeContext, context);

    // 4. Nest contexts under their subdomains.
    const buildContext = (ctxNode: InventoryEntry): DomainMapContext => {
      const members = membersByContext.get(ctxNode.id) ?? [];
      const relationships: ContextRelationship[] = crossContextRelationships
        .filter((rel) => rel.source === ctxNode.id)
        .map((rel) => ({ targetContextId: rel.target, type: rel.type }))
        .sort((a, b) => a.targetContextId.localeCompare(b.targetContextId) || a.type.localeCompare(b.type));
      return {
        id: ctxNode.id,
        name: str(ctxNode.name) ?? ctxNode.id,
        conceptCount: members.filter((m) => m.type === DOMAIN_CONCEPT).length,
        serviceCount: members.filter((m) => m.type === SERVICE).length,
        relationships,
      };
    };

    const subdomainName = new Map(subdomainNodes.map((node) => [node.id, str(node.name) ?? node.id]));
    const orderedSubdomainIds = [...subdomainNodes.map((node) => node.id)];
    for (const ctxNode of contextNodes) {
      const subdomainId = contextSubdomain.get(ctxNode.id);
      if (subdomainId && !orderedSubdomainIds.includes(subdomainId)) orderedSubdomainIds.push(subdomainId);
    }

    let subdomains: DomainMapSubdomain[] = orderedSubdomainIds.map((subdomainId) => ({
      id: subdomainId,
      name: subdomainName.get(subdomainId) ?? subdomainId,
      contexts: contextNodes
        .filter((ctxNode) => contextSubdomain.get(ctxNode.id) === subdomainId)
        .map(buildContext)
        .sort(byId),
    }));

    const orphans = contextNodes.filter((ctxNode) => !contextSubdomain.get(ctxNode.id));
    if (orphans.length > 0) {
      subdomains.push({
        id: UNASSIGNED_SUBDOMAIN_ID,
        name: "Unassigned",
        contexts: orphans.map(buildContext).sort(byId),
      });
    }
    subdomains.sort(byId);

    let scopedCrossContext = crossContextRelationships;

    // 5. Parameter scoping (acceptance 4): restrict to one subdomain by id or name.
    const subdomainParam = str(params.subdomain);
    if (subdomainParam) {
      const needle = subdomainParam.toLowerCase();
      subdomains = subdomains.filter(
        (sub) => sub.id.toLowerCase() === needle || sub.name.toLowerCase() === needle,
      );
      const retained = new Set(subdomains.flatMap((sub) => sub.contexts.map((ctx) => ctx.id)));
      scopedCrossContext = crossContextRelationships.filter(
        (rel) => retained.has(rel.source) && retained.has(rel.target),
      );
      for (const sub of subdomains) {
        for (const ctx of sub.contexts) {
          ctx.relationships = ctx.relationships.filter((rel) => retained.has(rel.targetContextId));
        }
      }
    }

    return { subdomains, crossContextRelationships: scopedCrossContext };
  }

  /** Defined per the port; unused while the view is on-demand (no cache to invalidate). */
  invalidatedBy(event: GraphMutationEvent): boolean {
    return RELEVANT_NODE_TYPES.has(event.entityType) || event.entityType.startsWith("Relationship:");
  }

  /** Freshness metadata: count every inventory entry the view covers. */
  entriesIncluded(result: DomainMapView): number {
    let count = result.subdomains.length;
    for (const subdomain of result.subdomains) {
      count += subdomain.contexts.length;
      for (const context of subdomain.contexts) {
        count += context.conceptCount + context.serviceCount;
      }
    }
    return count;
  }

  // ---- Internals -------------------------------------------------------------

  /** Aggregate edges between members of different contexts; strength = edge count. */
  private async aggregateCrossContext(
    membersByContext: Map<string, InventoryEntry[]>,
    nodeContext: Map<string, string>,
    context: QueryContext,
  ): Promise<CrossContextRelationship[]> {
    const aggregate = new Map<string, CrossContextRelationship>();
    const seenEdges = new Set<string>();

    for (const members of membersByContext.values()) {
      for (const member of members) {
        const subgraph = await this.service.traverse(
          { startNodeId: member.id, direction: "out", maxDepth: 1, includeEdges: true },
          context,
        );
        for (const edge of subgraph.edges) {
          if (edge.relationshipType === BELONGS_TO) continue;
          if (edge.sourceId !== member.id || seenEdges.has(edge.id)) continue;
          seenEdges.add(edge.id);
          const sourceContext = nodeContext.get(edge.sourceId);
          const targetContext = nodeContext.get(edge.targetId);
          if (!sourceContext || !targetContext || sourceContext === targetContext) continue;
          const key = `${sourceContext}|${targetContext}|${edge.relationshipType}`;
          const existing = aggregate.get(key);
          if (existing) {
            existing.strength += 1;
          } else {
            aggregate.set(key, {
              source: sourceContext,
              target: targetContext,
              type: edge.relationshipType,
              strength: 1,
            });
          }
        }
      }
    }

    return [...aggregate.values()].sort(
      (a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.type.localeCompare(b.type),
    );
  }

  /** Read every entry of a type through the Query Interface, following cursors. */
  private async listAll(type: string, context: QueryContext): Promise<InventoryEntry[]> {
    const all: InventoryEntry[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.service.listEntries({ type, limit: 100, cursor }, context);
      all.push(...page.items);
      cursor = page.cursor ?? undefined;
    } while (cursor);
    return all;
  }
}
