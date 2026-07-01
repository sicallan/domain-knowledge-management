import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import type {
  CapabilityCounts,
  CapabilityMapParams,
  CapabilityMapView,
  CapabilityNode,
  ViewMetadata,
  ViewProjector,
} from "./types";

const BUSINESS_CAPABILITY = "BusinessCapability";
const RULE = "Rule";
const BUSINESS_INVARIANT = "BusinessInvariant";
const DECISION = "Decision";
const DOMAIN_CONCEPT = "DomainConcept";
/** Neighbour types counted together as "realisations" of a capability (L3 / behaviour). */
const REALISATION_TYPES = new Set(["OrchestrationFlow", "OrchestrationStep", "Service"]);

/** Node types whose mutation could change the Capability Map (used by `invalidatedBy`). */
const RELEVANT_NODE_TYPES = new Set([
  BUSINESS_CAPABILITY, RULE, BUSINESS_INVARIANT, DECISION, DOMAIN_CONCEPT, ...REALISATION_TYPES,
]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function emptyCounts(): CapabilityCounts {
  return { rules: 0, invariants: 0, decisions: 0, concepts: 0, realisations: 0 };
}

/**
 * Capability Map projector (issue #84) — the **EA business-function lens**. It surfaces the
 * already-extracted `BusinessCapability` hierarchy (`level` / `parentCapability`) as a tree, each
 * node carrying counts of the evidence attached to it (governing rules, constraining invariants,
 * related decisions/concepts, realising flows/services). It is a **pure read-time projection** of
 * extracted structure — it asserts nothing new (ADR-0008) — composing only the Query Interface
 * (`listEntries`, `traverse`), so adapter parity is inherited (D-P1.2).
 *
 * `parentCapability` is a denormalised **name** reference, so parents are resolved by name against
 * each capability's name **or its recorded `aliases`** (which `normalise` leaves on a survivor when
 * it merges duplicates) — no dependency on `normalise` having rewritten the field. Unresolved
 * parents surface their capability as an `orphaned` root; mutual-parent cycles are broken
 * deterministically so the tree never loops.
 *
 * **OCP**: adds a view purely by implementing {@link ViewProjector} and registering.
 */
export class CapabilityMapProjector implements ViewProjector<CapabilityMapParams, CapabilityMapView> {
  readonly viewType = "capability-map";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description:
        "The BusinessCapability hierarchy (business-function map), each node with attached-evidence counts.",
      parameters: [
        { name: "root", type: "string", required: false, description: "Restrict to one root capability's subtree (id or name)." },
        { name: "depth", type: "number", required: false, description: "Reserved; the full tree is returned in the first cut." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: CapabilityMapParams, context: QueryContext): Promise<CapabilityMapView> {
    const capabilities = await this.listAll(BUSINESS_CAPABILITY, context);
    if (capabilities.length === 0) return { roots: [] };

    // Deterministic order so name-collision and cycle resolution are stable.
    capabilities.sort((a, b) => a.id.localeCompare(b.id));

    // 1. Name/alias → id index (first writer wins on collision).
    const idByName = new Map<string, string>();
    for (const cap of capabilities) {
      for (const key of this.nameKeys(cap)) if (!idByName.has(key)) idByName.set(key, cap.id);
    }

    // 2. Resolve each capability's parent; record orphans (declared but unresolvable).
    const parentOf = new Map<string, string>();
    const orphaned = new Set<string>();
    for (const cap of capabilities) {
      const declared = str(cap.parentCapability);
      if (!declared) continue;
      const parentId = idByName.get(norm(declared));
      if (!parentId || parentId === cap.id) {
        orphaned.add(cap.id);
        continue;
      }
      if (this.wouldCycle(cap.id, parentId, parentOf)) continue; // cut the edge → root, not orphaned
      parentOf.set(cap.id, parentId);
    }

    // 3. children index + per-capability counts.
    const childrenOf = new Map<string, string[]>();
    for (const [childId, pId] of parentOf) {
      (childrenOf.get(pId) ?? childrenOf.set(pId, []).get(pId)!).push(childId);
    }
    const byId = new Map(capabilities.map((c) => [c.id, c]));
    const counts = new Map<string, CapabilityCounts>();
    for (const cap of capabilities) counts.set(cap.id, await this.countEvidence(cap.id, context));

    // 4. Build the node tree from a root id.
    const nameOf = (id: string) => str(byId.get(id)?.name) ?? id;
    const build = (id: string): CapabilityNode => {
      const cap = byId.get(id)!;
      const children = (childrenOf.get(id) ?? [])
        .map(build)
        .sort((a, b) => a.name.localeCompare(b.name));
      const descendantCount = children.reduce((n, c) => n + 1 + c.descendantCount, 0);
      return {
        id,
        name: nameOf(id),
        level: num(cap.level),
        orphaned: orphaned.has(id),
        counts: counts.get(id) ?? emptyCounts(),
        descendantCount,
        children,
      };
    };

    let roots = capabilities
      .filter((c) => !parentOf.has(c.id))
      .map((c) => build(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 5. Root scoping (params.root): restrict to one root subtree by id or name.
    const wanted = str(params.root);
    if (wanted) {
      const needle = norm(wanted);
      roots = roots.filter((r) => r.id.toLowerCase() === wanted.toLowerCase() || norm(r.name) === needle);
    }
    return { roots };
  }

  /** Defined per the port; unused while the view is on-demand (no cache to invalidate). */
  invalidatedBy(event: GraphMutationEvent): boolean {
    return RELEVANT_NODE_TYPES.has(event.entityType) || event.entityType.startsWith("Relationship:");
  }

  /** Freshness metadata: the number of capabilities the tree covers. */
  entriesIncluded(result: CapabilityMapView): number {
    let count = 0;
    const walk = (node: CapabilityNode) => {
      count += 1;
      node.children.forEach(walk);
    };
    result.roots.forEach(walk);
    return count;
  }

  // ---- Internals -------------------------------------------------------------

  private nameKeys(cap: InventoryEntry): string[] {
    const keys: string[] = [];
    const name = str(cap.name);
    if (name) keys.push(norm(name));
    const aliases = cap.aliases;
    if (Array.isArray(aliases)) {
      for (const alias of aliases) if (typeof alias === "string" && alias.trim()) keys.push(norm(alias));
    }
    return keys;
  }

  /** True if committing `child → parent` would close a cycle through already-committed links. */
  private wouldCycle(childId: string, parentId: string, parentOf: Map<string, string>): boolean {
    let cur: string | undefined = parentId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === childId) return true;
      if (seen.has(cur)) return true; // pre-existing cycle upstream — don't extend it
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  }

  /** Count 1-hop neighbours by type; capability↔capability links are structural, not evidence. */
  private async countEvidence(capId: string, context: QueryContext): Promise<CapabilityCounts> {
    const subgraph = await this.service.traverse(
      { startNodeId: capId, direction: "both", maxDepth: 1, includeEdges: false },
      context,
    );
    const counts = emptyCounts();
    for (const node of subgraph.nodes) {
      if (node.id === capId) continue;
      switch (node.type) {
        case RULE: counts.rules += 1; break;
        case BUSINESS_INVARIANT: counts.invariants += 1; break;
        case DECISION: counts.decisions += 1; break;
        case DOMAIN_CONCEPT: counts.concepts += 1; break;
        default:
          if (REALISATION_TYPES.has(node.type)) counts.realisations += 1;
      }
    }
    return counts;
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
