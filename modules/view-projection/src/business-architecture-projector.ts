import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import type {
  BusinessArchitectureNode,
  BusinessArchitectureParams,
  BusinessArchitectureView,
  CapabilityCounts,
  ViewMetadata,
  ViewProjector,
} from "./types";

const REFERENCE_CAPABILITY = "ReferenceCapability";
const CAPABILITY_CLASSIFICATION = "CapabilityClassification";
const BUSINESS_CAPABILITY = "BusinessCapability";
const RULE = "Rule";
const BUSINESS_INVARIANT = "BusinessInvariant";
const DECISION = "Decision";
const DOMAIN_CONCEPT = "DomainConcept";
/** Neighbour types counted together as "realisations" of a capability (L3 / behaviour). */
const REALISATION_TYPES = new Set(["OrchestrationFlow", "OrchestrationStep", "Service"]);

/** Node types whose mutation could change the Business-Architecture view (`invalidatedBy`). */
const RELEVANT_NODE_TYPES = new Set([
  REFERENCE_CAPABILITY, CAPABILITY_CLASSIFICATION, BUSINESS_CAPABILITY,
  RULE, BUSINESS_INVARIANT, DECISION, DOMAIN_CONCEPT, ...REALISATION_TYPES,
]);

/** The unclassified bucket carries a capped, sorted sample of names — never the full list. */
const UNCLASSIFIED_SAMPLE_CAP = 50;

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

function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** A trusted placement: the classification plus the fields the tree needs. */
interface Placement {
  entry: InventoryEntry;
  parentDeclared: string | undefined;
  level: number | null;
}

/**
 * Business-Architecture projector (Feature 08, #86 — ADR-0009). The **normalised EA lens**: it
 * projects the curated {@link ReferenceCapability} spine (L1 domain → L2 capability) with each raw
 * `BusinessCapability` classified beneath it as an L3 function / L4 activity, and surfaces the
 * `rejected` and `unclassified` remainders as their own buckets.
 *
 * It is a **pure, deterministic read-time projection** over the spine + the materialised
 * {@link CapabilityClassification} judgments — it asserts nothing new itself (ADR-0008); the
 * expensive/non-deterministic LLM judgment lives in the classifications, computed once by the
 * classification pass. Composes only the Query Interface (`listEntries`, `traverse`), so adapter
 * parity is inherited (D-P1.2).
 *
 * Parents are denormalised **name** references (like the raw Capability Map): a classification's
 * `assignedParent` and a reference node's `parent` resolve against a name/id index. A placement whose
 * parent (or a low `confidence`, below `minConfidence`) leaves it homeless falls into `unclassified`
 * — honest about coverage rather than dropped. Placement chains are cycle-safe.
 *
 * **OCP**: adds a view purely by implementing {@link ViewProjector} and registering.
 */
export class BusinessArchitectureProjector
  implements ViewProjector<BusinessArchitectureParams, BusinessArchitectureView>
{
  readonly viewType = "business-architecture";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description:
        "The curated reference-capability spine (L1 domain → L2 capability) with raw capabilities classified beneath it as L3/L4, plus rejected/unclassified buckets.",
      parameters: [
        { name: "root", type: "string", required: false, description: "Restrict to one domain's subtree (id or name)." },
        { name: "minConfidence", type: "number", required: false, description: "Drop classifications below this confidence; their subjects fall to unclassified." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: BusinessArchitectureParams, context: QueryContext): Promise<BusinessArchitectureView> {
    const [refs, classifications, rawCaps] = await Promise.all([
      this.listAll(REFERENCE_CAPABILITY, context),
      this.listAll(CAPABILITY_CLASSIFICATION, context),
      this.listAll(BUSINESS_CAPABILITY, context),
    ]);

    // Deterministic order so name-collision and cycle resolution are stable.
    refs.sort((a, b) => a.id.localeCompare(b.id));
    classifications.sort((a, b) => a.id.localeCompare(b.id));
    rawCaps.sort((a, b) => a.id.localeCompare(b.id));

    const refById = new Map(refs.map((r) => [r.id, r]));
    const bcById = new Map(rawCaps.map((c) => [c.id, c]));

    // 1. Reference name/id → refId (reference nodes are the authoritative parents).
    const refKey = new Map<string, string>();
    for (const r of refs) {
      if (!refKey.has(r.id.toLowerCase())) refKey.set(r.id.toLowerCase(), r.id);
      const name = str(r.name);
      if (name && !refKey.has(norm(name))) refKey.set(norm(name), r.id);
    }

    // 2. Reference parent (L2 → L1); a ref with no resolved ref-parent is a root.
    const refParentOf = new Map<string, string>();
    for (const r of refs) {
      const declared = str(r.parent);
      if (!declared) continue;
      const parentId = refKey.get(norm(declared));
      if (parentId && parentId !== r.id) refParentOf.set(r.id, parentId);
    }

    // 3. Partition classifications: trusted placements (with a subject that exists) vs rejections.
    //    Untrusted (below minConfidence) are dropped here → their subjects fall to unclassified.
    const minConf = num(params.minConfidence);
    const trusted = (entry: InventoryEntry): boolean => {
      if (minConf === null) return true;
      const c = num(entry.confidence);
      return c !== null && c >= minConf;
    };
    const placements = new Map<string, Placement>();
    const rejectedSubjects = new Set<string>();
    const rejectedReasons: string[] = [];
    for (const cls of classifications) {
      const subject = str(cls.subject);
      if (!subject || !trusted(cls)) continue;
      const disposition = str(cls.disposition);
      if (disposition === "rejected") {
        rejectedSubjects.add(subject);
        rejectedReasons.push(str(cls.rejectionReason) ?? "unspecified");
      } else if (disposition === "placed" && bcById.has(subject)) {
        placements.set(subject, { entry: cls, parentDeclared: str(cls.assignedParent), level: num(cls.assignedLevel) });
      }
    }

    // 4. Parent-key index: reference nodes (authoritative) + placed raw caps, so a placement may
    //    hang under a reference node OR another placed capability (L2 → L3 → L4 nesting).
    const parentKey = new Map<string, string>(refKey);
    for (const subject of placements.keys()) {
      const cap = bcById.get(subject)!;
      if (!parentKey.has(subject.toLowerCase())) parentKey.set(subject.toLowerCase(), subject);
      const name = str(cap.name);
      if (name && !parentKey.has(norm(name))) parentKey.set(norm(name), subject);
    }

    // 5. Resolve each placement's parent; homeless/cyclic placements → unclassified.
    const placedParentOf = new Map<string, string>();
    for (const [subject, placement] of placements) {
      const declared = placement.parentDeclared;
      const parentId = declared ? parentKey.get(norm(declared)) : undefined;
      if (!parentId || parentId === subject) continue; // homeless → not in tree → unclassified
      if (this.wouldCycle(subject, parentId, placedParentOf)) continue;
      placedParentOf.set(subject, parentId);
    }

    // 6. Children indexes + per-classified-capability evidence counts.
    const refChildrenOf = new Map<string, string[]>();
    for (const [childRef, parentId] of refParentOf) push(refChildrenOf, parentId, childRef);
    const placedChildrenOf = new Map<string, string[]>();
    for (const [subject, parentId] of placedParentOf) push(placedChildrenOf, parentId, subject);
    const counts = new Map<string, CapabilityCounts>();
    for (const subject of placedParentOf.keys()) counts.set(subject, await this.countEvidence(subject, context));

    // 7. Build the tree. Reference nodes carry reference children + placed children; a placed
    //    capability carries its placed children.
    const buildClassified = (subject: string): BusinessArchitectureNode => {
      const cap = bcById.get(subject)!;
      const placement = placements.get(subject)!;
      const children = (placedChildrenOf.get(subject) ?? [])
        .map(buildClassified)
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: subject,
        name: str(cap.name) ?? subject,
        level: placement.level ?? 3,
        origin: "classified",
        confidence: num(placement.entry.confidence),
        rationale: str(placement.entry.rationale),
        counts: counts.get(subject) ?? emptyCounts(),
        descendantCount: children.reduce((n, c) => n + 1 + c.descendantCount, 0),
        children,
      };
    };
    const buildRef = (id: string): BusinessArchitectureNode => {
      const r = refById.get(id)!;
      const children = [
        ...(refChildrenOf.get(id) ?? []).map(buildRef),
        ...(placedChildrenOf.get(id) ?? []).map(buildClassified),
      ].sort((a, b) => a.name.localeCompare(b.name));
      return {
        id,
        name: str(r.name) ?? id,
        level: num(r.level) ?? 1,
        origin: "reference",
        framework: str(r.framework),
        descendantCount: children.reduce((n, c) => n + 1 + c.descendantCount, 0),
        children,
      };
    };

    let domains = refs
      .filter((r) => !refParentOf.has(r.id))
      .map((r) => buildRef(r.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Root scoping (params.root): restrict to one domain subtree by id or name.
    const wanted = str(params.root);
    if (wanted) {
      const needle = norm(wanted);
      domains = domains.filter((d) => d.id.toLowerCase() === wanted.toLowerCase() || norm(d.name) === needle);
    }

    // 8. Buckets. Rejected: tally by reason (count desc, then reason). Unclassified: raw caps that
    //    neither landed in the tree nor were rejected (homeless/untrusted/never-classified).
    const byReasonMap = new Map<string, number>();
    for (const reason of rejectedReasons) byReasonMap.set(reason, (byReasonMap.get(reason) ?? 0) + 1);
    const byReason = [...byReasonMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([reason, count]) => ({ reason, count }));

    const handled = new Set<string>([...placedParentOf.keys(), ...rejectedSubjects]);
    const unclassifiedCaps = rawCaps.filter((c) => !handled.has(c.id));
    const names = unclassifiedCaps.map((c) => str(c.name) ?? c.id).sort((a, b) => a.localeCompare(b));

    return {
      domains,
      rejected: { count: rejectedReasons.length, byReason },
      unclassified: { count: unclassifiedCaps.length, names: names.slice(0, UNCLASSIFIED_SAMPLE_CAP) },
    };
  }

  /** Defined per the port; unused while the view is on-demand (no cache to invalidate). */
  invalidatedBy(event: GraphMutationEvent): boolean {
    return RELEVANT_NODE_TYPES.has(event.entityType) || event.entityType.startsWith("Relationship:");
  }

  /** Freshness metadata: the number of tree nodes the view covers. */
  entriesIncluded(result: BusinessArchitectureView): number {
    let count = 0;
    const walk = (node: BusinessArchitectureNode) => {
      count += 1;
      node.children.forEach(walk);
    };
    result.domains.forEach(walk);
    return count;
  }

  // ---- Internals -------------------------------------------------------------

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
