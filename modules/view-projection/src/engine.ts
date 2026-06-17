import type { QueryContext, QueryService } from "@dkm/query";
import type { ViewEngine, ViewMetadata, ViewProjector, ViewResult } from "./types";

/**
 * Default {@link ViewEngine}: a registry of {@link ViewProjector}s with on-demand
 * materialisation (spec 007). `getView` dispatches to the registered projector,
 * then wraps the raw projection in a {@link ViewResult} with freshness metadata.
 *
 * **OCP-closed**: the engine never changes when a new view is added — a projector
 * registers via {@link registerProjector} and that is the only touch-point. The
 * engine needs only the closed-minimum port (`viewType`/`project`/`invalidatedBy`);
 * the optional `describe`/`entriesIncluded` hooks enrich `listViews`/metadata when a
 * projector provides them, and are defaulted when it does not.
 *
 * Phase 1 has no caching: every view is on-demand, so `cacheHit`/`stale` are always
 * `false` and `refreshView` is a no-op (the `invalidatedBy` hook stays unused).
 */
export class DefaultViewEngine implements ViewEngine {
  private readonly projectors = new Map<string, ViewProjector<unknown, unknown>>();

  /**
   * @param _service Reserved: the Query Interface the engine projects over. Phase 1
   *   projectors hold their own {@link QueryService} (constructed with it), so the
   *   engine does not use it directly — accepting it keeps the `service → engine`
   *   wiring explicit at the call site and reserves the seam for shared use later.
   */
  constructor(_service?: QueryService) {}

  registerProjector(projector: ViewProjector<unknown, unknown>): void {
    this.projectors.set(projector.viewType, projector);
  }

  listViews(): ViewMetadata[] {
    return [...this.projectors.values()]
      .map((projector) => this.metadataFor(projector))
      .sort((a, b) => a.viewType.localeCompare(b.viewType));
  }

  async getView<T>(
    viewType: string,
    params: Record<string, unknown>,
    context: QueryContext,
  ): Promise<ViewResult<T>> {
    const projector = this.projectors.get(viewType);
    if (!projector) {
      throw new Error(`No view projector registered for viewType '${viewType}'`);
    }
    const data = (await projector.project(params, context)) as T;
    const entriesIncluded = projector.entriesIncluded ? projector.entriesIncluded(data) : 0;
    return {
      data,
      metadata: {
        viewType,
        computedAt: new Date().toISOString(),
        entriesIncluded,
        stale: false, // on-demand projections are always freshly computed
        cacheHit: false, // no caching in Phase 1
      },
    };
  }

  async refreshView(viewType: string, _params: Record<string, unknown>): Promise<void> {
    if (!this.projectors.has(viewType)) {
      throw new Error(`No view projector registered for viewType '${viewType}'`);
    }
    // On-demand views have no materialised cache to refresh (Phase 1) — no-op.
  }

  private metadataFor(projector: ViewProjector<unknown, unknown>): ViewMetadata {
    if (projector.describe) {
      return projector.describe();
    }
    return {
      viewType: projector.viewType,
      description: "",
      parameters: [],
      refreshPolicy: "on-demand",
      estimatedComputeTime: "<1s",
    };
  }
}
