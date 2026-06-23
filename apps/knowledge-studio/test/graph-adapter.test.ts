import { describe, expect, it } from "vitest";
import {
  applyFilters,
  mergeSubgraphs,
  type Subgraph,
  toCytoscapeElements,
} from "../src/explorer/graph-adapter";

const subgraph: Subgraph = {
  nodes: [
    { id: "sd-payments", type: "Subdomain", label: "Payments" },
    { id: "bc-auth", type: "BoundedContext", label: "Authorisation" },
    { id: "d-authorise", type: "Decision", label: "Authorise payment" },
    { id: "vp-acme", type: "VendorProduct", label: "Acme Switch" },
  ],
  edges: [
    { id: "e1", sourceId: "bc-auth", targetId: "sd-payments", relationshipType: "belongsTo" },
    { id: "e2", sourceId: "d-authorise", targetId: "bc-auth", relationshipType: "belongsTo" },
    // dangling edge — target absent from the node set
    { id: "e3", sourceId: "d-authorise", targetId: "missing", relationshipType: "operatesOn" },
  ],
};

describe("toCytoscapeElements (adapter boundary, criterion 8)", () => {
  it("maps nodes with id/label/type/layer and keeps only edges with both endpoints", () => {
    const elements = toCytoscapeElements(subgraph);
    const nodes = elements.filter((e) => e.group === "nodes");
    const edges = elements.filter((e) => e.group === "edges");

    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(2); // the dangling e3 is dropped

    const authority = nodes.find((n) => n.data.id === "bc-auth");
    expect(authority?.data.label).toBe("Authorisation");
    expect(authority?.data.layer).toBe("L1");

    const vendor = nodes.find((n) => n.data.id === "vp-acme");
    expect(vendor?.data.layer).toBe("L2");
  });

  it("de-duplicates repeated nodes and edges", () => {
    const dupes: Subgraph = {
      nodes: [...subgraph.nodes, subgraph.nodes[0]!],
      edges: [...subgraph.edges, subgraph.edges[0]!],
    };
    const elements = toCytoscapeElements(dupes);
    expect(elements.filter((e) => e.group === "nodes")).toHaveLength(4);
    expect(elements.filter((e) => e.group === "edges")).toHaveLength(2);
  });

  it("falls back to the id when a node has no label", () => {
    const elements = toCytoscapeElements({ nodes: [{ id: "x1", type: "Event" }], edges: [] });
    expect(elements[0]?.data.label).toBe("x1");
  });
});

describe("mergeSubgraphs (lazy expand, criterion 4)", () => {
  it("merges without duplicating shared nodes/edges", () => {
    const expansion: Subgraph = {
      nodes: [
        { id: "d-authorise", type: "Decision", label: "Authorise payment" }, // already present
        { id: "e-authorisation", type: "Event", label: "Authorised" }, // new
      ],
      edges: [
        { id: "e2", sourceId: "d-authorise", targetId: "bc-auth", relationshipType: "belongsTo" }, // dup
        { id: "e4", sourceId: "d-authorise", targetId: "e-authorisation", relationshipType: "operatesOn" },
      ],
    };
    const merged = mergeSubgraphs(subgraph, expansion);
    expect(merged.nodes.map((n) => n.id)).toContain("e-authorisation");
    expect(merged.nodes.filter((n) => n.id === "d-authorise")).toHaveLength(1);
    expect(merged.edges.filter((e) => e.id === "e2")).toHaveLength(1);
  });

  it("propagates truncation if either side was truncated", () => {
    const merged = mergeSubgraphs({ nodes: [], edges: [] }, { nodes: [], edges: [], truncated: true });
    expect(merged.truncated).toBe(true);
  });
});

describe("applyFilters (criterion 5)", () => {
  it("narrows nodes by layer and drops now-dangling edges", () => {
    const filtered = applyFilters(subgraph, { layers: ["L1"] });
    expect(filtered.nodes.map((n) => n.id).sort()).toEqual(["bc-auth", "d-authorise", "sd-payments"]);
    // edges to vp-acme would dangle, but there were none; both L1 edges survive
    expect(filtered.edges).toHaveLength(2);
  });

  it("narrows nodes by inventory type", () => {
    const filtered = applyFilters(subgraph, { types: ["Decision"] });
    expect(filtered.nodes.map((n) => n.id)).toEqual(["d-authorise"]);
    expect(filtered.edges).toHaveLength(0); // both endpoints no longer present
  });

  it("returns everything when no filter is set", () => {
    expect(applyFilters(subgraph, {}).nodes).toHaveLength(4);
  });
});
