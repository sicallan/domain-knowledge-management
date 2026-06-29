import { useQuery } from "urql";
import { DOMAIN_MAP_QUERY } from "./queries";

/** A relationship from one context to another, by **id** (the UI resolves ids → names). */
export interface ContextRelationship {
  targetContextId: string;
  type: string;
}

/** A bounded context with its contained-member counts and outgoing context relationships. */
export interface DomainMapContext {
  id: string;
  name: string;
  conceptCount: number;
  serviceCount: number;
  relationships: ContextRelationship[];
}

/** A subdomain grouping its bounded contexts. */
export interface DomainMapSubdomain {
  id: string;
  name: string;
  contexts: DomainMapContext[];
}

/** An aggregated relationship between two contexts; `strength` = edge count. */
export interface CrossContextRelationship {
  source: string;
  target: string;
  type: string;
  strength: number;
}

/** The full Domain Map projection (mirrors `@dkm/view-projection`'s `DomainMapView`). */
export interface DomainMapView {
  subdomains: DomainMapSubdomain[];
  crossContextRelationships: CrossContextRelationship[];
}

export interface UseDomainMapResult {
  view: DomainMapView | null;
  loading: boolean;
  error: string | null;
  /** True when the gateway resolved a valid map with no subdomains (empty state, not an error). */
  empty: boolean;
}

/**
 * Read the Domain Map through the gateway (UI-D3). `subdomain` scopes the query server-side (the
 * projector honours it), so focusing a subdomain **re-issues** rather than filtering client-side.
 */
export function useDomainMap(subdomain?: string | null): UseDomainMapResult {
  const [{ data, fetching, error }] = useQuery<{ domainMap: DomainMapView }>({
    query: DOMAIN_MAP_QUERY,
    variables: { subdomain: subdomain ?? undefined },
  });

  const view = data?.domainMap ?? null;
  return {
    view,
    loading: fetching,
    error: error?.message ?? null,
    empty: !fetching && !error && view !== null && view.subdomains.length === 0,
  };
}
