import { useQuery } from "urql";
import type { CapabilityCounts } from "../capability-map/useCapabilityMap";
import { BUSINESS_ARCHITECTURE_QUERY } from "./queries";

/** Whether a tree node is a curated spine node or a classified raw capability (mirrors the projector). */
export type BusinessArchitectureOrigin = "reference" | "classified";

/**
 * A node in the normalised business-architecture tree (recursive). `children` is **optional**: a
 * fixed-depth GraphQL selection can't express arbitrary depth, so nodes at the fetch boundary come
 * back without it — `descendantCount` still reflects the full subtree. Reference (spine) nodes carry
 * `framework`; classified nodes carry the classifier's `confidence` / `rationale` and evidence `counts`.
 */
export interface BusinessArchitectureNode {
  id: string;
  name: string;
  level: number;
  origin: BusinessArchitectureOrigin;
  framework?: string | null;
  confidence?: number | null;
  rationale?: string | null;
  descendantCount: number;
  counts?: CapabilityCounts | null;
  children?: BusinessArchitectureNode[];
}

/** Rejected classifications, tallied by reason (deterministically ordered). */
export interface BusinessArchitectureRejections {
  count: number;
  byReason: { reason: string; count: number }[];
}

/** Raw capabilities with no trusted placement — a capped, sorted sample plus the total count. */
export interface BusinessArchitectureUnclassified {
  count: number;
  names: string[];
}

/** The Business-Architecture projection (mirrors `@dkm/view-projection`'s `BusinessArchitectureView`). */
export interface BusinessArchitectureView {
  domains: BusinessArchitectureNode[];
  rejected: BusinessArchitectureRejections;
  unclassified: BusinessArchitectureUnclassified;
}

export interface UseBusinessArchitectureResult {
  view: BusinessArchitectureView | null;
  loading: boolean;
  error: string | null;
  /** True when the gateway resolved a valid model with no domains (empty state, not an error). */
  empty: boolean;
}

/**
 * Read the Business-Architecture model through the gateway. `pause` keeps the query dormant until
 * the EA lens is actually selected, so the screen only pays for the projection the user asked for.
 */
export function useBusinessArchitecture(pause = false): UseBusinessArchitectureResult {
  const [{ data, fetching, error }] = useQuery<{ businessArchitecture: BusinessArchitectureView }>({
    query: BUSINESS_ARCHITECTURE_QUERY,
    pause,
  });

  const view = data?.businessArchitecture ?? null;
  return {
    view,
    loading: fetching,
    error: error?.message ?? null,
    empty: !fetching && !error && view !== null && view.domains.length === 0,
  };
}
