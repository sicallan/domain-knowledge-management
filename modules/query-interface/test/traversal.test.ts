import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { DEFAULT_MAX_DEPTH_CAP, GraphQueryService } from "../src/index";
import { ctx, makeEdge, makeNode } from "./helpers";

// A small chain plus a branch:
//   a --evaluates--> b --consumes--> c --consumes--> d --consumes--> e --consumes--> f
//   a --consumes--> g   (a different edge type off the start node)
async function seedChain(graph: InMemoryGraphAdapter): Promise<void> {
  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
    await graph.upsertNode(makeNode(id === "g" ? "ReferenceData" : "DomainConcept", id, { name: id }));
  }
  await graph.createEdge(makeEdge("evaluates", "a", "b", "e-ab"));
  await graph.createEdge(makeEdge("consumes", "b", "c", "e-bc"));
  await graph.createEdge(makeEdge("consumes", "c", "d", "e-cd"));
  await graph.createEdge(makeEdge("consumes", "d", "e", "e-de"));
  await graph.createEdge(makeEdge("consumes", "e", "f", "e-ef"));
  await graph.createEdge(makeEdge("consumes", "a", "g", "e-ag"));
}

describe("traverse — direction / filters / depth", () => {
  let graph: InMemoryGraphAdapter;
  let service: GraphQueryService;

  beforeEach(async () => {
    graph = new InMemoryGraphAdapter();
    service = new GraphQueryService(graph);
    await seedChain(graph);
  });

  it("direction 'out' walks forward from the start", async () => {
    const result = await service.traverse({ startNodeId: "a", direction: "out", maxDepth: 1, includeEdges: false }, ctx());
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "g"]);
  });

  it("direction 'in' walks backward to the start", async () => {
    const result = await service.traverse({ startNodeId: "b", direction: "in", maxDepth: 1, includeEdges: false }, ctx());
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("direction 'both' walks in either direction", async () => {
    const result = await service.traverse({ startNodeId: "b", direction: "both", maxDepth: 1, includeEdges: false }, ctx());
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("filters by edge type", async () => {
    const result = await service.traverse(
      { startNodeId: "a", direction: "out", edgeTypes: ["consumes"], maxDepth: 1, includeEdges: false },
      ctx(),
    );
    // Only the consumes edge (a→g) is followed; the evaluates edge (a→b) is not.
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "g"]);
  });

  it("filters by node type", async () => {
    const result = await service.traverse(
      { startNodeId: "a", direction: "out", nodeTypes: ["ReferenceData"], maxDepth: 1, includeEdges: false },
      ctx(),
    );
    // b is a DomainConcept (excluded); g is ReferenceData (included).
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a", "g"]);
  });

  it("limits the walk to the requested depth", async () => {
    const depth2 = await service.traverse({ startNodeId: "a", direction: "out", maxDepth: 2, includeEdges: false }, ctx());
    expect(depth2.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "g"]);
    expect(depth2.truncated).toBe(false);
  });

  it("enforces the default maxDepth cap to prevent full-graph scans (spec Open Q1)", async () => {
    // The chain a→b→c→d→e→f is 5 hops; requesting an unbounded depth must clamp.
    const result = await service.traverse(
      { startNodeId: "a", direction: "out", maxDepth: 999, includeEdges: false },
      ctx(),
    );
    expect(result.truncated).toBe(true);
    // With the cap at DEFAULT_MAX_DEPTH_CAP, the deepest node beyond the cap is unreachable.
    const reached = new Set(result.nodes.map((n) => n.id));
    expect(DEFAULT_MAX_DEPTH_CAP).toBeLessThan(999);
    // a (depth 0) + up to DEFAULT_MAX_DEPTH_CAP hops along the chain.
    expect(reached.has("a")).toBe(true);
    expect(result.nodes.length).toBeLessThanOrEqual(DEFAULT_MAX_DEPTH_CAP + 2);
  });
});
