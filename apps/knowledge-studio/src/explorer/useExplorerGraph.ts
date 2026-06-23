import { useCallback, useEffect, useState } from "react";
import { useClient } from "urql";
import { mergeSubgraphs, type Subgraph } from "./graph-adapter";
import { ROOTS_QUERY, TRAVERSE_QUERY } from "./queries";

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
      const roots = await client.query<RawRoots>(ROOTS_QUERY, { limit: 5 }).toPromise();
      if (cancelled) return;
      if (roots.error) {
        setError(roots.error.message);
        setLoading(false);
        return;
      }
      let accumulated: Subgraph = { nodes: [], edges: [] };
      for (const root of roots.data?.entries.items ?? []) {
        const next = await traverseFrom(root.id, depth);
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
