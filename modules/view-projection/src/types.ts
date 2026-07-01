import type { GraphMutationEvent } from "@dkm/knowledge-graph";
import type { QueryContext } from "@dkm/query";

/**
 * View Projection Engine contracts — spec 007 §Interfaces & Contracts, reproduced
 * **verbatim** and completed with the marker types the spec references but does not
 * spell out ({@link ParameterDefinition}). These are the **OCP-closed** surfaces:
 * the {@link ViewEngine}/{@link ViewProjector} method signatures, the
 * {@link ViewResult} shape and the {@link DomainMapView} output schema must not
 * change as new views land — they may only be extended additively.
 */

// Re-export the dependencies the port signatures reference so consumers import
// the whole view surface from one place.
export type { QueryContext } from "@dkm/query";
export type { GraphMutationEvent } from "@dkm/knowledge-graph";

// ---------------------------------------------------------------------------
// Engine + projector port (spec 007 §View Projection Pattern, §Interfaces)
// ---------------------------------------------------------------------------

/**
 * A single configurable parameter a view accepts (spec 007 `ViewMetadata.parameters`,
 * referenced but not defined in §Interfaces). Used purely for self-description via
 * {@link ViewEngine.listViews}; the projector reads its own typed params object.
 */
export interface ParameterDefinition {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description?: string;
}

/** A view's refresh strategy (spec 007 §Refresh Strategy). Phase 1 uses `on-demand`. */
export type RefreshPolicy = "on-demand" | "cached" | "periodic";

/** Self-describing metadata for a registered view (spec 007 §Interfaces). */
export interface ViewMetadata {
  viewType: string;
  description: string;
  parameters: ParameterDefinition[];
  refreshPolicy: RefreshPolicy;
  /** Rough compute-time hint, e.g. "<1s", "2-5s". */
  estimatedComputeTime: string;
}

/** The materialised view plus its freshness metadata (spec 007 §Interfaces). */
export interface ViewResult<T> {
  data: T;
  metadata: {
    viewType: string;
    computedAt: string;
    entriesIncluded: number;
    stale: boolean;
    cacheHit: boolean;
  };
}

/**
 * Every view projector implements this port (spec 007 §View Projection Pattern).
 * `viewType`, `project` and `invalidatedBy` are the **closed minimum** — a projector
 * needs only these three to register and serve.
 *
 * `describe` and `entriesIncluded` are **additive (OCP-open) optional** hooks: they
 * let a projector self-describe (for {@link ViewEngine.listViews}) and report how
 * many inventory entries a result covers (for {@link ViewResult} freshness metadata).
 * When absent the engine synthesises sensible defaults, so the verbatim three-member
 * interface remains sufficient to register a new view with no engine change.
 */
export interface ViewProjector<TParams, TResult> {
  readonly viewType: string;

  /** Project the view from graph data (spec 007: composes the Query Interface). */
  project(params: TParams, context: QueryContext): Promise<TResult>;

  /** Which graph events invalidate this view's cache. Must be total (never throw). */
  invalidatedBy(event: GraphMutationEvent): boolean;

  /** Optional self-description surfaced by {@link ViewEngine.listViews}. */
  describe?(): ViewMetadata;

  /** Optional count of inventory entries the result covers (freshness metadata). */
  entriesIncluded?(result: TResult): number;
}

/** The view engine: a registry of projectors with on-demand materialisation. */
export interface ViewEngine {
  /** Get a materialised view, wrapped with freshness metadata. */
  getView<T>(
    viewType: string,
    params: Record<string, unknown>,
    context: QueryContext,
  ): Promise<ViewResult<T>>;

  /** Force refresh a cached view. No-op while every view is on-demand (Phase 1). */
  refreshView(viewType: string, params: Record<string, unknown>): Promise<void>;

  /** List available views with metadata. */
  listViews(): ViewMetadata[];

  /** Register a new view projector — the OCP extension point. */
  registerProjector(projector: ViewProjector<unknown, unknown>): void;
}

// ---------------------------------------------------------------------------
// Domain Map view (spec 007 §Example View Output Schemas — verbatim shape)
// ---------------------------------------------------------------------------

/** Parameters accepted by the Domain Map projector (spec 007 §Defined Views). */
export interface DomainMapParams {
  /** Restrict to a single subdomain (by id or name). Omitted → every subdomain. */
  subdomain?: string;
  /** Reserved traversal depth knob (spec 007). The two-tier map ignores it in Phase 1. */
  depth?: number;
}

/** A relationship a bounded context has to another context (within a context entry). */
export interface ContextRelationship {
  targetContextId: string;
  type: string;
}

/** A bounded context as it appears nested under its subdomain in the Domain Map. */
export interface DomainMapContext {
  id: string;
  name: string;
  conceptCount: number;
  serviceCount: number;
  relationships: ContextRelationship[];
}

/** A subdomain with its nested bounded contexts. */
export interface DomainMapSubdomain {
  id: string;
  name: string;
  contexts: DomainMapContext[];
}

/** An aggregated cross-context relationship (spec 007: strength = edge count). */
export interface CrossContextRelationship {
  source: string;
  target: string;
  type: string;
  strength: number;
}

/** The Domain Map view output (spec 007 §Example View Output Schemas — verbatim). */
export interface DomainMapView {
  subdomains: DomainMapSubdomain[];
  crossContextRelationships: CrossContextRelationship[];
}

// ---------------------------------------------------------------------------
// Capability Map view (issue #84). The EA business-function lens: the extracted
// BusinessCapability hierarchy (level / parentCapability) surfaced as a tree, each
// node carrying counts of the evidence attached to it. A pure read-time projection
// of already-extracted structure — no new assertions (see ADR-0008). Additive only.
// ---------------------------------------------------------------------------

/** Parameters accepted by the Capability Map projector. */
export interface CapabilityMapParams {
  /** Restrict to one root capability's subtree (by id or name). Omitted → every root. */
  root?: string;
  /** Reserved traversal depth knob. Unused in the first cut (the full tree is returned). */
  depth?: number;
}

/** Per-capability counts of the evidence attached to it (one hop, by neighbour type). */
export interface CapabilityCounts {
  rules: number;
  invariants: number;
  decisions: number;
  concepts: number;
  realisations: number;
}

/** A capability as it appears in the hierarchy tree (recursive). */
export interface CapabilityNode {
  id: string;
  name: string;
  /** The extracted `level` (1/2/3…), retained for reference; depth comes from the tree. */
  level: number | null;
  /** True when a `parentCapability` was declared but could not be resolved (surfaced as a root). */
  orphaned: boolean;
  counts: CapabilityCounts;
  /** Size of this node's subtree (excluding itself). */
  descendantCount: number;
  children: CapabilityNode[];
}

/** The Capability Map view output: the forest of capability roots. */
export interface CapabilityMapView {
  roots: CapabilityNode[];
}

// ---------------------------------------------------------------------------
// Behaviour Flow view (feature 04 §7). Spec 007 lists the Behaviour Flow view
// but leaves its output schema to the implementing feature, mirroring the Domain
// Map precedent. Additive only — fields may grow but never change (spec 007 Open
// Q2): consumers stay protected until a GraphQL contract pins it (Phase 3).
// ---------------------------------------------------------------------------

/** Parameters accepted by the Behaviour Flow projector (spec 007 §Defined Views). */
export interface BehaviourFlowParams {
  /** The OrchestrationFlow id to project. */
  flowId: string;
}

/** An event a step emits or consumes, surfaced in the flow view. */
export interface BehaviourFlowEventRef {
  eventId: string;
  name: string;
}

/** An outgoing state transition from a step (StateTransition node fields). */
export interface BehaviourFlowTransition {
  fromState: string;
  toState: string;
  guardCondition?: string;
}

/** A single branch of a decision point: an outcome label + the event it may produce. */
export interface BehaviourFlowOutcome {
  label: string;
  /** The Event a `produces` edge ties to this outcome, when one matches. */
  producesEventId?: string;
}

/** The Decision a step invokes — the highlighted decision point (criterion 3). */
export interface BehaviourFlowDecision {
  id: string;
  name: string;
  /** The Decision's axis field (`decisionType` on the node, not the base `type`). */
  type: "automated" | "manual" | "hybrid";
  outcomes: BehaviourFlowOutcome[];
}

/** A single step in the projected flow, surfaced in `sequence` order. */
export interface BehaviourFlowStep {
  id: string;
  sequence: number;
  actionType: string;
  serviceOrComponent?: string;
  emits: BehaviourFlowEventRef[];
  consumes: BehaviourFlowEventRef[];
  transitions: BehaviourFlowTransition[];
  isDecisionPoint: boolean;
  decision?: BehaviourFlowDecision;
  /** The stepId this step compensates (saga rollback), when it is a compensation step. */
  compensates?: string;
}

/** The flow header — the OrchestrationFlow node's own fields (feature 04 §7). */
export interface BehaviourFlowHeader {
  id: string;
  name: string;
  trigger: string;
  owningService?: string;
}

/** The Behaviour Flow view output (feature 04 §7). */
export interface BehaviourFlowView {
  flow: BehaviourFlowHeader;
  steps: BehaviourFlowStep[];
}

// ---------------------------------------------------------------------------
// Vendor Coverage Map view (Phase 3 feature 03 §7). Spec 007 lists the view
// (viewType `vendor-coverage`) but leaves the output schema to this feature,
// mirroring the Domain Map / Behaviour Flow precedent. Additive only — fields
// may grow but never change until a Phase 3 GraphQL contract pins it (D-P3.2).
// ---------------------------------------------------------------------------

/** A cell's coverage status — maps 1:1 from `coverage ∈ {full,partial,none}` (D-P3.2). */
export type CoverageStatus = "covered" | "partial" | "uncovered";

/** The L1 element kind that forms the matrix rows. */
export type CoverageRowKind = "BusinessCapability" | "DomainConcept";

/**
 * A matrix row — an L1 capability/concept. `status` is its roll-up across all
 * vendor mappings/edges and `gap` (⇔ `status === "uncovered"`) is the per-row gap
 * flag (criterion 4); both are driven by the shared realisation predicate so they
 * agree with the Gap view (D-P3.3). `status`/`gap` are additive to spec 007's
 * `{id,name,kind}` row.
 */
export interface VendorCoverageRow {
  id: string;
  name: string;
  kind: CoverageRowKind;
  /** The row's overall coverage roll-up (covered ⇔ a `full` mapping; partial ⇔ realised, no full). */
  status: CoverageStatus;
  /** Per-row gap flag — true ⇔ the row is functionally unrealised (`status === "uncovered"`). */
  gap: boolean;
  /** The row's domain, when the node carries one (drives the `domain` filter). */
  domain?: string;
}

/** A matrix column — a vendor product. */
export interface VendorCoverageColumn {
  id: string;
  name: string;
  vendor: string;
}

/** A single matrix cell: how well one vendor product (column) covers one capability (row). */
export interface VendorCoverageCell {
  rowId: string;
  columnId: string;
  status: CoverageStatus;
  coveragePercentage?: number;
  mappingId?: string;
  gaps?: string[];
}

/** Matrix totals (criterion 4). */
export interface VendorCoverageSummary {
  totalCapabilities: number;
  covered: number;
  partial: number;
  uncovered: number;
  /** Weighted overall coverage: covered=1, partial=0.5, uncovered=0, as a 0–100 percentage. */
  coveragePercentage: number;
}

/** The Vendor Coverage Map view output (feature 03 §7). */
export interface VendorCoverageView {
  rows: VendorCoverageRow[];
  columns: VendorCoverageColumn[];
  cells: VendorCoverageCell[];
  summary: VendorCoverageSummary;
}

/** Parameters accepted by the Vendor Coverage projector (feature 03 §7). */
export interface VendorCoverageParams {
  /** Restrict columns to one vendor (matched on the product's `vendor`, id or name). */
  vendor?: string;
  /** Restrict rows to one domain (matched on the row node's `domain`/`subdomain`). */
  domain?: string;
  /** Additive (OCP-open): which L1 element kind forms the rows. Defaults to `BusinessCapability`. */
  rowKind?: CoverageRowKind;
}

// ---------------------------------------------------------------------------
// Gap Analysis view (Phase 3 feature 04 §7). The deterministic inverse of the
// Coverage Map — it consumes the SAME realisation predicate (D-P3.3), so the two
// can never disagree. Additive only.
// ---------------------------------------------------------------------------

/** A realisation layer an L1 element can be missing. */
export type RealisationLayer = "L2" | "L3";

/** A single gap: an L1 element with at least one absent realisation layer. */
export interface GapAnalysisGap {
  id: string;
  name: string;
  kind: CoverageRowKind;
  domain?: string;
  /** Which realisation is absent — `L2` (functional) and/or `L3` (technical). */
  missingLayers: RealisationLayer[];
  /** Deterministic rank: the element's incoming-edge (dependent) count; higher = more depended-upon. */
  priority: number;
  /** Human-readable, computed explanation of the gap. */
  reason: string;
}

/** Gap totals over the assessed population (independent of the `layer` filter). */
export interface GapAnalysisSummary {
  totalAssessed: number;
  functionalGaps: number;
  technicalGaps: number;
  fullyRealised: number;
}

/** The Gap Analysis view output (feature 04 §7). */
export interface GapAnalysisView {
  gaps: GapAnalysisGap[];
  summary: GapAnalysisSummary;
}

/** Parameters accepted by the Gap Analysis projector (feature 04 §7). */
export interface GapAnalysisParams {
  /** Restrict assessment to one domain (matched on the element node's `domain`/`subdomain`). */
  domain?: string;
  /** Which gaps to list: functional (no L2), technical (no L3), or both. Defaults to `both`. */
  layer?: "functional" | "technical" | "both";
}
