import type { QueryContext, QueryService } from "@dkm/query";
import type { ViewEngine } from "@dkm/view-projection";

/**
 * The GraphQL resolver context. Every resolver delegates to {@link queryService}
 * (Graph Query domain) or {@link views} (View Projection domain) and threads
 * {@link context} (the per-request {@link QueryContext}) into the service call, so the
 * `AccessFilter` RBAC seam is on the hot path from day one (UI-D3 / criterion 8).
 *
 * This module holds **no node-only imports** (no `fs`/`http`) so the studio's MSW
 * handlers can import it to execute the schema in-process (UI-D2).
 */
export interface GraphQLContext {
  /** The Query Interface (entry/entries/traverse/paths/search/impact). */
  queryService: QueryService;
  /** The View Projection engine (coverage/gap/domain/behaviour). */
  views: ViewEngine;
  /** The per-request identity/scope context (dev-fake until Feature 03 — UI-D8). */
  context: QueryContext;
}

/**
 * The env-gated **dev fake identity** (UI-D8): a full-scope reader so the app is
 * clickable with no IdP. RBAC enforcement is Phase 5 — this only fills the seam.
 */
export function devQueryContext(overrides: Partial<QueryContext> = {}): QueryContext {
  return { userId: "dev", roles: ["reader"], scopes: ["*"], requestId: "dev-request", ...overrides };
}

/** Bundle a seeded backend + a {@link QueryContext} into a resolver {@link GraphQLContext}. */
export function createGraphQLContext(
  backend: { queryService: QueryService; views: ViewEngine },
  context: QueryContext = devQueryContext(),
): GraphQLContext {
  return { queryService: backend.queryService, views: backend.views, context };
}
