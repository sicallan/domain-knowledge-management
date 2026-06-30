import { useQuery } from "urql";
import { CAPABILITY_MAP_QUERY } from "./queries";

/** Per-capability counts of attached evidence (mirrors the projector's `CapabilityCounts`). */
export interface CapabilityCounts {
  rules: number;
  invariants: number;
  decisions: number;
  concepts: number;
  realisations: number;
}

/**
 * A capability in the hierarchy tree (recursive). `children` is **optional**: a fixed-depth
 * GraphQL selection can't express arbitrary depth, so nodes at the fetch boundary come back
 * without it — `descendantCount` still reflects the full (possibly deeper) subtree.
 */
export interface CapabilityNode {
  id: string;
  name: string;
  level: number | null;
  orphaned: boolean;
  descendantCount: number;
  counts: CapabilityCounts;
  children?: CapabilityNode[];
}

/** The Capability Map projection (mirrors `@dkm/view-projection`'s `CapabilityMapView`). */
export interface CapabilityMapView {
  roots: CapabilityNode[];
}

export interface UseCapabilityMapResult {
  view: CapabilityMapView | null;
  loading: boolean;
  error: string | null;
  /** True when the gateway resolved a valid map with no capabilities (empty state, not an error). */
  empty: boolean;
}

/**
 * Read the Capability Map through the gateway (UI-D3). `root` scopes to one root capability's
 * subtree server-side, so focusing a root **re-issues** rather than filtering client-side.
 */
export function useCapabilityMap(root?: string | null): UseCapabilityMapResult {
  const [{ data, fetching, error }] = useQuery<{ capabilityMap: CapabilityMapView }>({
    query: CAPABILITY_MAP_QUERY,
    variables: { root: root ?? undefined },
  });

  const view = data?.capabilityMap ?? null;
  return {
    view,
    loading: fetching,
    error: error?.message ?? null,
    empty: !fetching && !error && view !== null && view.roots.length === 0,
  };
}
