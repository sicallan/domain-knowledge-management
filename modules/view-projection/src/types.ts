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
