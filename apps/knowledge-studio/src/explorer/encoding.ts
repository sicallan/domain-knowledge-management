import type { StylesheetStyle } from "cytoscape";

/**
 * Visual encoding for the canvas (UI-3.4 §6/criterion 7): node colour by **layer** (the
 * four-layer domain model) over a layer-banded palette, plus the layout-mode mapping and the
 * Cytoscape stylesheet. New encodings (coverage RAG overlays, shape-by-type) are additive
 * (OCP-open) and reuse this seam.
 */

/** Inventory type → domain layer (L0–L3). Unknown types fall back to L1 (pure-domain default). */
const TYPE_LAYER: Record<string, string> = {
  // L1 — pure domain
  Subdomain: "L1",
  BoundedContext: "L1",
  DomainConcept: "L1",
  Decision: "L1",
  BusinessInvariant: "L1",
  Rule: "L1",
  BusinessCapability: "L1",
  ReferenceData: "L1",
  // L2 — functional realisation
  VendorProduct: "L2",
  VendorCapabilityMapping: "L2",
  ProjectSpecification: "L2",
  // L3 — technical realisation
  Event: "L3",
  OrchestrationFlow: "L3",
  OrchestrationStep: "L3",
  StateTransition: "L3",
};

export function layerOfType(type: string): string {
  return TYPE_LAYER[type] ?? "L1";
}

/**
 * The inventory types the explorer can browse — the keys of the shared type→layer map, so the
 * canvas and the list/table (UI-3.5) derive their type universe from one source. OCP-open:
 * registering a new type's layer here makes it browsable in both modes (additive).
 */
export function knownInventoryTypes(): string[] {
  return Object.keys(TYPE_LAYER);
}

/** Layer-banded node colours (distinct hues per layer; HSL strings). */
const LAYER_COLOUR: Record<string, string> = {
  L0: "hsl(280 60% 55%)", // strategic — violet
  L1: "hsl(221 83% 53%)", // pure domain — blue (matches --primary)
  L2: "hsl(38 92% 50%)", // functional realisation — amber
  L3: "hsl(160 60% 40%)", // technical realisation — teal
};

export function colourOfLayer(layer: string): string {
  return LAYER_COLOUR[layer] ?? "hsl(215 16% 47%)";
}

/** The three layout modes (UI-3.4 §7), mapped to Cytoscape layout names. */
export type LayoutMode = "force" | "hierarchical" | "radial";

const LAYOUT_NAME: Record<LayoutMode, string> = {
  force: "fcose", // separation-aware force-directed (ADR-0005); registered in GraphCanvas
  hierarchical: "breadthfirst", // layered (dagre is the upgrade)
  radial: "concentric",
};

export function layoutNameFor(mode: LayoutMode): string {
  return LAYOUT_NAME[mode];
}

/** A Cytoscape layout-config bag (extension fields like fcose's `nodeSeparation` aren't in core types). */
export interface GraphLayoutOptions {
  name: string;
  nodeDimensionsIncludeLabels: boolean;
  padding: number;
  [option: string]: unknown;
}

/**
 * Layout configuration tuned so **nodes and their labels never overlap**, however large the
 * explored graph gets (enhancement). The shared knobs: `nodeDimensionsIncludeLabels` sizes each
 * node by its label box (so labels don't collide with neighbours) and a viewport `padding`.
 * Per mode:
 *  - **force → fcose**: strong `nodeSeparation`/`nodeRepulsion` + component packing — spreads even
 *    dense, disconnected graphs without clumping (the old bare `cose` clumped/overlapped);
 *  - **hierarchical → breadthfirst** and **radial → concentric**: built-ins with `avoidOverlap`
 *    plus extra `spacingFactor` / `minNodeSpacing`.
 */
export function layoutOptionsFor(mode: LayoutMode): GraphLayoutOptions {
  const name = layoutNameFor(mode);
  const shared = { name, nodeDimensionsIncludeLabels: true, padding: 40 };
  switch (mode) {
    case "force":
      return {
        ...shared,
        quality: "proof",
        randomize: true,
        animate: false,
        nodeSeparation: 120,
        nodeRepulsion: 12000,
        idealEdgeLength: 120,
        edgeElasticity: 0.45,
        gravity: 0.25,
        packComponents: true,
      };
    case "hierarchical":
      return { ...shared, directed: true, avoidOverlap: true, spacingFactor: 1.5 };
    case "radial":
      return { ...shared, avoidOverlap: true, minNodeSpacing: 50 };
  }
}

/** The Cytoscape stylesheet: layer-coloured nodes, labelled edges, and a `selected` class. */
export function buildStylesheet(): StylesheetStyle[] {
  return [
    {
      selector: "node",
      style: {
        // Colour is precomputed into node data by the adapter (data(colour)) so the
        // stylesheet stays a static, declarative map (no function mappers).
        "background-color": "data(colour)",
        label: "data(label)",
        color: "hsl(222 47% 11%)",
        "font-size": 10,
        "text-valign": "bottom",
        "text-halign": "center",
        width: 22,
        height: 22,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "hsl(214 20% 75%)",
        "target-arrow-color": "hsl(214 20% 75%)",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "font-size": 8,
        color: "hsl(215 16% 47%)",
      },
    },
    {
      selector: "node.selected",
      style: {
        "border-width": 3,
        "border-color": "hsl(0 84% 60%)",
      },
    },
  ];
}
