import { useCallback, useEffect, useState } from "react";
import { useClient } from "urql";
import { knownInventoryTypes } from "./encoding";
import { mergeSubgraphs, type Subgraph } from "./graph-adapter";
import { ROOTS_QUERY, TRAVERSE_QUERY } from "./queries";

/**
 * Anchor types to seed the canvas from, in layer-priority order: the L1 structural anchors
 * (Subdomain → BoundedContext → DomainConcept) first, then every other known type as a safety
 * net. The hook seeds from the **first type that has entries**, so a domain whose extraction
 * produced no Subdomains/BoundedContexts (the current `dkm process` reality) still renders from
 * its DomainConcepts rather than showing a blank graph. Deduplicated, anchors kept first.
 */
export const ROOT_SEED_TYPES: string[] = [
  ...new Set(["Subdomain", "BoundedContext", "DomainConcept", ...knownInventoryTypes()]),
];

/**
 * Probe anchor types in priority order and return the ids of the first non-empty one — the
 * canvas's seed set. `probe(type)` lists a few entries of that type (the gateway lists one type
 * at a time); seeding stops as soon as a type yields entries, so the common case is one query.
 */
export async function findSeedIds(
  probe: (type: string) => Promise<string[]>,
  seedTypes: string[] = ROOT_SEED_TYPES,
): Promise<string[]> {
  for (const type of seedTypes) {
    const ids = await probe(type);
    if (ids.length > 0) return ids;
  }
  return [];
}

/** The raw GraphQL shapes (before normalisation to the renderer's `Subgraph`). */
interface RawNode {
  id: string;
  type: string;
  lifecycleStatus?: string | null;
  data?: { name?: unknown } | null;
}
interface RawEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
}
interface RawTraverse {
  traverse: { nodes: RawNode[]; edges: RawEdge[]; truncated: boolean };
}
interface RawRoots {
  entries: { items: { id: string }[] };
}

function normalise(raw: RawTraverse["traverse"]): Subgraph {
  return {
    nodes: raw.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: typeof node.data?.name === "string" ? node.data.name : node.id,
      lifecycleStatus: node.lifecycleStatus ?? undefined,
    })),
    edges: raw.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      relationshipType: edge.relationshipType,
    })),
    truncated: raw.truncated,
  };
}

export interface ExplorerGraph {
  subgraph: Subgraph;
  loading: boolean;
  error: string | null;
  /** Lazy-expand: traverse from a node and merge the result (criterion 4). */
  expand: (nodeId: string) => Promise<void>;
}

/**
 * Loads the canvas's graph **only through the gateway's `traverse`** (UI-D3): it seeds from
 * the subdomains, traverses both directions to a bounded depth, and exposes `expand` for
 * lazy growth — never the whole graph at once (NFR perf). Normalises the GraphQL result to
 * the renderer's `Subgraph` (label from `data.name`).
 */
export function useExplorerGraph(depth = 3): ExplorerGraph {
  const client = useClient();
  const [subgraph, setSubgraph] = useState<Subgraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const traverseFrom = useCallback(
    async (startNodeId: string, maxDepth: number): Promise<Subgraph | null> => {
      const result = await client
        .query<RawTraverse>(TRAVERSE_QUERY, {
          startNodeId,
          direction: "BOTH",
          maxDepth,
          includeEdges: true,
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return null;
      }
      return result.data ? normalise(result.data.traverse) : null;
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      // Seed from the best available anchor type (Subdomain → … → DomainConcept → …), so a
      // domain with no extracted Subdomains still renders rather than showing a blank canvas.
      const seedIds = await findSeedIds(async (type) => {
        const roots = await client.query<RawRoots>(ROOTS_QUERY, { type, limit: 5 }).toPromise();
        if (roots.error) {
          setError(roots.error.message);
          return [];
        }
        return (roots.data?.entries.items ?? []).map((item) => item.id);
      });
      if (cancelled) return;
      let accumulated: Subgraph = { nodes: [], edges: [] };
      for (const id of seedIds) {
        const next = await traverseFrom(id, depth);
        if (next) accumulated = mergeSubgraphs(accumulated, next);
      }
      if (!cancelled) {
        setSubgraph(accumulated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, depth, traverseFrom]);

  const expand = useCallback(
    async (nodeId: string) => {
      const next = await traverseFrom(nodeId, depth);
      if (next) setSubgraph((previous) => mergeSubgraphs(previous, next));
    },
    [traverseFrom, depth],
  );

  return { subgraph, loading, error, expand };
}
