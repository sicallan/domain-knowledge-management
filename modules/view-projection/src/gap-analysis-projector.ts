import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import {
  buildMappingIndex,
  isFunctionallyRealised,
  isTechnicallyRealised,
  missingLayers,
  readElementRealisation,
} from "./realisation-predicate";
import type {
  CoverageRowKind,
  GapAnalysisGap,
  GapAnalysisParams,
  GapAnalysisSummary,
  GapAnalysisView,
  RealisationLayer,
  ViewMetadata,
  ViewProjector,
} from "./types";

const MAPPING = "VendorCapabilityMapping";

/** The L1 element kinds the Gap view assesses (aligned with the Coverage Map population). */
const ASSESSED_KINDS: CoverageRowKind[] = ["BusinessCapability", "DomainConcept"];

/** Node types whose mutation could open or close a gap. */
const RELEVANT_NODE_TYPES = new Set([
  "BusinessCapability",
  "DomainConcept",
  "VendorProduct",
  MAPPING,
  "ProjectSpec",
  "Service",
]);

/** Edge types whose mutation could open or close a gap. */
const RELEVANT_EDGE_TYPES = new Set(["fulfils", "specifies", "realizesVendorCap", "implements", "realizedBy"]);

const RELATIONSHIP_PREFIX = "Relationship:";

const L2_REASON = "no fulfils/specifies edge or vendor mapping";
const L3_REASON = "no implementing service";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function domainOf(node: InventoryEntry): string | undefined {
  return str(node.domain) ?? str(node.subdomain);
}

/**
 * Gap Analysis projector (Phase 3 feature 04; spec 007 viewType `gap-analysis`). The
 * deterministic inverse of the Coverage Map: it surfaces L1 capabilities/concepts that
 * lack functional (L2) and/or technical (L3) realisation. Plan step 3.4 calls it an
 * "agent", but a gap is the **absence of realisation edges** — a pure graph property — so
 * it is a projector, not an LLM: exact, cheap, CI-green without secrets. The "agent"
 * framing is met by a computed `reason` + a `priority` hint per gap.
 *
 * It **imports the same realisation predicate** the Coverage Map defines (D-P3.3), so the
 * gap list and the coverage matrix can never disagree (a parity test guards this — a
 * release blocker). Composes **only** the Query Interface, inheriting adapter parity.
 *
 * **OCP**: a new view added purely by implementing {@link ViewProjector} + registering.
 */
export class GapAnalysisProjector implements ViewProjector<GapAnalysisParams, GapAnalysisView> {
  readonly viewType = "gap-analysis";

  constructor(private readonly service: QueryService) {}

  describe(): ViewMetadata {
    return {
      viewType: this.viewType,
      description: "L1 concepts/capabilities lacking L2 (functional) and/or L3 (technical) realisation.",
      parameters: [
        { name: "domain", type: "string", required: false, description: "Restrict assessment to one domain." },
        { name: "layer", type: "string", required: false, description: "functional | technical | both (default)." },
      ],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }

  async project(params: GapAnalysisParams, context: QueryContext): Promise<GapAnalysisView> {
    const layer = params.layer ?? "both";
    const domainFilter = str(params.domain)?.toLowerCase();
    const mappingIndex = buildMappingIndex(await this.listAll(MAPPING, context));

    const assessed: GapAnalysisGap[] = [];
    let fullyRealised = 0;
    let functionalGaps = 0;
    let technicalGaps = 0;

    for (const kind of ASSESSED_KINDS) {
      const nodes = (await this.listAll(kind, context)).filter(
        (node) => !domainFilter || domainOf(node)?.toLowerCase() === domainFilter,
      );
      for (const node of nodes) {
        const realisation = await readElementRealisation(this.service, node.id, mappingIndex, context);
        const missing = missingLayers(realisation);
        if (missing.length === 0) fullyRealised += 1;
        if (!isFunctionallyRealised(realisation)) functionalGaps += 1;
        if (!isTechnicallyRealised(realisation)) technicalGaps += 1;
        if (missing.length === 0) continue;

        const gap: GapAnalysisGap = {
          id: node.id,
          name: str(node.name) ?? node.id,
          kind,
          missingLayers: missing,
          priority: await this.countIncomingEdges(node.id, context),
          reason: reasonFor(missing),
        };
        const domain = domainOf(node);
        if (domain) gap.domain = domain;
        assessed.push(gap);
      }
    }

    const summary: GapAnalysisSummary = {
      totalAssessed: fullyRealised + assessed.length,
      functionalGaps,
      technicalGaps,
      fullyRealised,
    };

    const gaps = assessed
      .filter((gap) => includeForLayer(gap.missingLayers, layer))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

    return { gaps, summary };
  }

  invalidatedBy(event: GraphMutationEvent): boolean {
    if (RELEVANT_NODE_TYPES.has(event.entityType)) return true;
    if (event.entityType.startsWith(RELATIONSHIP_PREFIX)) {
      return RELEVANT_EDGE_TYPES.has(event.entityType.slice(RELATIONSHIP_PREFIX.length));
    }
    return false;
  }

  /** Freshness metadata: the number of gaps surfaced. */
  entriesIncluded(result: GapAnalysisView): number {
    return result.gaps.length;
  }

  /** Deterministic prioritisation proxy: how many edges depend on (point into) this element. */
  private async countIncomingEdges(elementId: string, context: QueryContext): Promise<number> {
    const subgraph = await this.service.traverse(
      { startNodeId: elementId, direction: "in", maxDepth: 1, includeEdges: true },
      context,
    );
    return subgraph.edges.filter((edge) => edge.targetId === elementId).length;
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

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function includeForLayer(missing: RealisationLayer[], layer: "functional" | "technical" | "both"): boolean {
  if (layer === "functional") return missing.includes("L2");
  if (layer === "technical") return missing.includes("L3");
  return missing.length > 0;
}

function reasonFor(missing: RealisationLayer[]): string {
  const noL2 = missing.includes("L2");
  const noL3 = missing.includes("L3");
  if (noL2 && noL3) {
    return `No functional realisation (${L2_REASON}) and no technical realisation (${L3_REASON}).`;
  }
  if (noL2) {
    return `No functional realisation (${L2_REASON}); technically realised at L3.`;
  }
  return `Functionally realised at L2 but not technically realised (${L3_REASON}).`;
}
