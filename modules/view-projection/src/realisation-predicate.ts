import type { QueryContext, QueryService } from "@dkm/query";
import type { InventoryEntry } from "@dkm/schema";
import type { CoverageStatus, RealisationLayer } from "./types";

/**
 * The **single source of truth** for "is this L1 element realised?" (Phase 3 D-P3.3).
 * Defined once here and consumed by BOTH the Vendor Coverage Map (feature 03) and the
 * Gap Analysis view (feature 04), so the matrix and the gap list can never disagree — a
 * divergence would be a silent correctness bug (the single-source lesson from Phase 2.5).
 *
 * The module splits into two layers:
 *  - **pure predicate** ({@link isFunctionallyRealised} … {@link rowCoverageStatus}) over an
 *    already-gathered {@link ElementRealisation} — trivially unit-testable, no I/O;
 *  - a thin **reader** ({@link buildMappingIndex}, {@link readElementRealisation}) that gathers
 *    that struct by composing **only** the Query Interface, so both projectors gather
 *    identically and inherit adapter parity (D-P1.2).
 */

/** A mapping's coverage level — the L2 `VendorCapabilityMapping.coverage` enum (D-P3.2). */
export type Coverage = "full" | "partial" | "none";

/** The realisation-relevant facts about one L1 element, gathered from the graph. */
export interface ElementRealisation {
  /** Incoming `fulfils` edges (VendorProduct → this) — L2 functional. */
  incomingFulfils: number;
  /** Incoming `specifies` edges (ProjectSpec → this) — L2 functional. */
  incomingSpecifies: number;
  /** Coverage values of VendorCapabilityMappings whose `mappedConcept` targets this — L2 functional. */
  mappingCoverages: Coverage[];
  /** Incoming `implements`/`realizedBy` edges (Service → this) — L3 technical. */
  incomingTechnical: number;
}

/** A flattened VendorCapabilityMapping, indexed for the views (carries the cell detail). */
export interface MappingRef {
  mappingId: string;
  vendorCapability: string;
  coverage: Coverage;
  coveragePercentage?: number;
  gaps?: string[];
}

/** The relationship types each realisation layer is carried by (D-P3.3). */
export const FUNCTIONAL_EDGE_TYPES = ["fulfils", "specifies"] as const;
export const TECHNICAL_EDGE_TYPES = ["implements", "realizedBy"] as const;

// ---------------------------------------------------------------------------
// Pure predicate (D-P3.3)
// ---------------------------------------------------------------------------

/** Functionally (L2) realised ⇔ ≥1 `fulfils`/`specifies` edge OR a mapping with coverage ≠ none. */
export function isFunctionallyRealised(r: ElementRealisation): boolean {
  return (
    r.incomingFulfils > 0 ||
    r.incomingSpecifies > 0 ||
    r.mappingCoverages.some((coverage) => coverage !== "none")
  );
}

/** Technically (L3) realised ⇔ ≥1 `implements`/`realizedBy` edge. */
export function isTechnicallyRealised(r: ElementRealisation): boolean {
  return r.incomingTechnical > 0;
}

/** Which realisation layers are absent for this element — drives the Gap view (feature 04). */
export function missingLayers(r: ElementRealisation): RealisationLayer[] {
  const missing: RealisationLayer[] = [];
  if (!isFunctionallyRealised(r)) missing.push("L2");
  if (!isTechnicallyRealised(r)) missing.push("L3");
  return missing;
}

/**
 * Roll a set of mapping coverages up to a single **cell** status (D-P3.2 worst-wins for
 * the gap signal): empty/any `none` → uncovered; else any `partial` → partial; else covered.
 */
export function rollUpCoverage(coverages: Coverage[]): CoverageStatus {
  if (coverages.length === 0 || coverages.includes("none")) return "uncovered";
  if (coverages.includes("partial")) return "partial";
  return "covered";
}

/**
 * A **row**'s overall status (Coverage Map summary + per-row gap flag). Unlike a cell, a
 * row aggregates every edge/mapping touching the element, so it is driven by the
 * realisation predicate — keeping the per-row `uncovered` set equal to the Gap view's
 * functional-gap set (D-P3.3 parity): `uncovered` ⇔ not functionally realised; `covered`
 * ⇔ a `full` mapping exists; otherwise `partial`.
 */
export function rowCoverageStatus(r: ElementRealisation): CoverageStatus {
  if (!isFunctionallyRealised(r)) return "uncovered";
  return r.mappingCoverages.includes("full") ? "covered" : "partial";
}

/** The greatest stated coverage percentage in a set, ignoring `undefined` (D-P3.2). */
export function maxCoveragePercentage(percentages: (number | undefined)[]): number | undefined {
  const defined = percentages.filter((p): p is number => typeof p === "number");
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

// ---------------------------------------------------------------------------
// Reader (Query-Interface-only — shared by both projectors)
// ---------------------------------------------------------------------------

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function coverageOf(value: unknown): Coverage {
  return value === "full" || value === "partial" ? value : "none";
}

/**
 * Index VendorCapabilityMapping nodes by their `mappedConcept.targetId`, so a row's
 * mappings are an O(1) lookup. The `mappedConcept` typed reference (D-P3.6) is a field,
 * not an edge, so mappings cannot be traversed to — they are scanned once and indexed.
 */
export function buildMappingIndex(mappings: InventoryEntry[]): Map<string, MappingRef[]> {
  const index = new Map<string, MappingRef[]>();
  for (const mapping of mappings) {
    const mappedConcept = mapping.mappedConcept as { targetId?: unknown } | undefined;
    const targetId = str(mappedConcept?.targetId);
    if (!targetId) continue;
    const ref: MappingRef = {
      mappingId: mapping.id,
      vendorCapability: str(mapping.vendorCapability) ?? "",
      coverage: coverageOf(mapping.coverage),
      coveragePercentage: typeof mapping.coveragePercentage === "number" ? mapping.coveragePercentage : undefined,
      gaps: Array.isArray(mapping.gaps) ? (mapping.gaps as string[]) : undefined,
    };
    const existing = index.get(targetId);
    if (existing) existing.push(ref);
    else index.set(targetId, [ref]);
  }
  return index;
}

/**
 * Gather the realisation inputs for one element by composing the Query Interface: a single
 * incoming traversal (counting `fulfils`/`specifies` and `implements`/`realizedBy` edges)
 * plus the pre-built mapping index. Both projectors call this, so they gather identically.
 */
export async function readElementRealisation(
  service: QueryService,
  elementId: string,
  mappingIndex: Map<string, MappingRef[]>,
  context: QueryContext,
): Promise<ElementRealisation> {
  const subgraph = await service.traverse(
    {
      startNodeId: elementId,
      direction: "in",
      edgeTypes: [...FUNCTIONAL_EDGE_TYPES, ...TECHNICAL_EDGE_TYPES],
      maxDepth: 1,
      includeEdges: true,
    },
    context,
  );

  let incomingFulfils = 0;
  let incomingSpecifies = 0;
  let incomingTechnical = 0;
  for (const edge of subgraph.edges) {
    if (edge.targetId !== elementId) continue;
    if (edge.relationshipType === "fulfils") incomingFulfils += 1;
    else if (edge.relationshipType === "specifies") incomingSpecifies += 1;
    else if (edge.relationshipType === "implements" || edge.relationshipType === "realizedBy") incomingTechnical += 1;
  }

  return {
    incomingFulfils,
    incomingSpecifies,
    incomingTechnical,
    mappingCoverages: (mappingIndex.get(elementId) ?? []).map((m) => m.coverage),
  };
}
