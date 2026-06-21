import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphQueryService } from "../src/index";
import { ctx, makeEdge, makeNode } from "./helpers";

// A cross-layer slice spanning regulation → L1 decision/rule → L3 service:
//   reg (RegulatoryRequirement) --satisfiedBy--> d (Decision)
//   d --evaluates--> rule (Rule, L1)
//   d --realizedBy--> svc (Service, L3)
//   d --produces--> ev (Event, L3)
async function seedCrossLayer(graph: InMemoryGraphAdapter): Promise<void> {
  await graph.upsertNode(makeNode("RegulatoryRequirement", "reg", { name: "PSD2 SCA" }));
  await graph.upsertNode(makeNode("Decision", "d", { name: "Authorise Payment", decisionType: "automated" }));
  await graph.upsertNode(makeNode("Rule", "rule", { name: "Sufficient Funds" }));
  await graph.upsertNode(makeNode("Service", "svc", { name: "auth-service" }));
  await graph.upsertNode(makeNode("Event", "ev", { name: "PaymentAuthorised" }));
  await graph.createEdge(makeEdge("satisfiedBy", "reg", "d", "e-sat"));
  await graph.createEdge(makeEdge("evaluates", "d", "rule", "e-eval"));
  await graph.createEdge(makeEdge("realizedBy", "d", "svc", "e-real"));
  await graph.createEdge(makeEdge("produces", "d", "ev", "e-prod"));
}

describe("cross-layer traversal & path-finding (criteria 3–5)", () => {
  let graph: InMemoryGraphAdapter;
  let service: GraphQueryService;

  beforeEach(async () => {
    graph = new InMemoryGraphAdapter();
    service = new GraphQueryService(graph);
    await seedCrossLayer(graph);
  });

  it("finds the cross-layer path Decision → Service (criterion 3)", async () => {
    const result = await service.findPaths({ sourceId: "d", targetId: "svc" }, ctx());
    expect(result.found).toBe(true);
    const path = result.paths.find((p) => p.nodeIds.at(-1) === "svc");
    expect(path?.nodeIds).toEqual(["d", "svc"]);
    expect(path?.edges.map((e) => e.relationshipType)).toEqual(["realizedBy"]);
  });

  it("navigates the realizedBy edge backwards: from the Service reach the Decision (criterion 4)", async () => {
    const result = await service.traverse(
      { startNodeId: "svc", direction: "in", maxDepth: 1, includeEdges: true },
      ctx(),
    );
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["d", "svc"]);
    expect(result.edges.map((e) => e.relationshipType)).toEqual(["realizedBy"]);
  });

  it("returns the regulatory trace Requirement → Decision → Rule as a connected subgraph (criterion 5)", async () => {
    const result = await service.traverse(
      { startNodeId: "reg", direction: "out", maxDepth: 2, includeEdges: false },
      ctx(),
    );
    const ids = new Set(result.nodes.map((n) => n.id));
    expect(ids.has("reg")).toBe(true);
    expect(ids.has("d")).toBe(true);
    expect(ids.has("rule")).toBe(true); // reached at depth 2 across layers
  });

  it("filters a cross-layer traversal by edge type", async () => {
    const result = await service.traverse(
      { startNodeId: "d", direction: "out", edgeTypes: ["realizedBy"], maxDepth: 1, includeEdges: false },
      ctx(),
    );
    // Only the L3 service is reached; the L1 rule and the event are not.
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["d", "svc"]);
  });
});
