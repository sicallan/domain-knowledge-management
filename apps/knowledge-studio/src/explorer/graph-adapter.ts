import type { ElementDefinition } from "cytoscape";
import { colourOfLayer, layerOfType } from "./encoding";

/**
 * The graph-data adapter boundary (UI-3.4 §7, criterion 8). `Subgraph` → renderer
 * elements is the **one seam** a Sigma.js/WebGL renderer would reuse (ADR-0005), so the
 * canvas never holds a second graph model and a renderer swap touches nothing else.
 *
 * These types mirror the gateway's `traverse` result (`Subgraph { nodes, edges, truncated }`)
 * normalised to the minimum the renderer needs — `label` is derived from the entry's
 * `data.name` by the query layer, not fetched as a special field.
 */

export interface GraphNode {
  id: string;
  type: string;
  /** Display label (from the entry's `data.name`); falls back to the id. */
  label?: string;
  /** Lifecycle status — reserved for coverage/lifecycle visual overlays. */
  lifecycleStatus?: string;
}

export interface GraphEdge {
  id?: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when the source `traverse` was clamped by the depth cap (truncation UX). */
  truncated?: boolean;
}

const edgeKey = (edge: GraphEdge): string =>
  edge.id ?? `${edge.sourceId}->${edge.targetId}:${edge.relationshipType}`;

/**
 * Map a `Subgraph` to Cytoscape elements. De-duplicates nodes and edges by identity and
 * **drops dangling edges** (an endpoint absent from the node set) so the renderer never
 * references a missing node. Each node carries `type` + derived `layer` data for encoding.
 */
export function toCytoscapeElements(subgraph: Subgraph): ElementDefinition[] {
  const nodeIds = new Set<string>();
  const nodes: ElementDefinition[] = [];
  for (const node of subgraph.nodes) {
    if (nodeIds.has(node.id)) continue;
    nodeIds.add(node.id);
    const layer = layerOfType(node.type);
    nodes.push({
      group: "nodes",
      data: {
        id: node.id,
        label: node.label ?? node.id,
        type: node.type,
        layer,
        colour: colourOfLayer(layer),
      },
    });
  }

  const seenEdges = new Set<string>();
  const edges: ElementDefinition[] = [];
  for (const edge of subgraph.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) continue;
    const key = edgeKey(edge);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({
      group: "edges",
      data: {
        id: key,
        source: edge.sourceId,
        target: edge.targetId,
        label: edge.relationshipType,
      },
    });
  }

  return [...nodes, ...edges];
}

/**
 * Merge two subgraphs (lazy expand, criterion 4) de-duplicating nodes by id and edges by
 * identity — so expanding a node that shares neighbours never produces duplicates.
 */
export function mergeSubgraphs(base: Subgraph, incoming: Subgraph): Subgraph {
  const nodeById = new Map<string, GraphNode>();
  for (const node of [...base.nodes, ...incoming.nodes]) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }
  const edgeByKey = new Map<string, GraphEdge>();
  for (const edge of [...base.edges, ...incoming.edges]) {
    const key = edgeKey(edge);
    if (!edgeByKey.has(key)) edgeByKey.set(key, edge);
  }
  return {
    nodes: [...nodeById.values()],
    edges: [...edgeByKey.values()],
    truncated: Boolean(base.truncated || incoming.truncated),
  };
}

/** Client-side filters narrowing the visible element set (criterion 5). */
export interface GraphFilters {
  layers?: string[];
  types?: string[];
}

/**
 * Narrow a subgraph by layer and/or inventory type. Edges are kept only when **both**
 * endpoints survive the node filter, so the result is always internally consistent.
 */
export function applyFilters(subgraph: Subgraph, filters: GraphFilters): Subgraph {
  let nodes = subgraph.nodes;
  if (filters.layers && filters.layers.length > 0) {
    const layers = new Set(filters.layers);
    nodes = nodes.filter((node) => layers.has(layerOfType(node.type)));
  }
  if (filters.types && filters.types.length > 0) {
    const types = new Set(filters.types);
    nodes = nodes.filter((node) => types.has(node.type));
  }
  const kept = new Set(nodes.map((node) => node.id));
  const edges = subgraph.edges.filter((edge) => kept.has(edge.sourceId) && kept.has(edge.targetId));
  return { nodes, edges, truncated: subgraph.truncated };
}
