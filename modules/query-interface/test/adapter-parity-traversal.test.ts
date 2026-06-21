import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { afterAll, describe, expect, it } from "vitest";
import { GraphQueryService } from "../src/index";
import { ctx, makeEdge, makeNode } from "./helpers";

// Feature 2.5 — acceptance criterion 7 (D-P1.2): cross-layer traversal must give identical
// results on the in-memory and Neo4j adapters (the port-parity contract). Neo4j auto-skips
// unless NEO4J_URI is set, so this is never a CI gate.

async function seed(graph: GraphPort): Promise<void> {
  await graph.upsertNode(makeNode("RegulatoryRequirement", "reg"));
  await graph.upsertNode(makeNode("Decision", "d", { decisionType: "automated" }));
  await graph.upsertNode(makeNode("Rule", "rule"));
  await graph.upsertNode(makeNode("Service", "svc"));
  await graph.createEdge(makeEdge("satisfiedBy", "reg", "d", "e-sat"));
  await graph.createEdge(makeEdge("evaluates", "d", "rule", "e-eval"));
  await graph.createEdge(makeEdge("realizedBy", "d", "svc", "e-real"));
}

/** The cross-layer probes whose results must match across adapters. */
async function probe(graph: GraphPort): Promise<{ regOut: string[]; svcIn: string[]; path: string[][] }> {
  const service = new GraphQueryService(graph);
  const regOut = (await service.traverse({ startNodeId: "reg", direction: "out", maxDepth: 2, includeEdges: false }, ctx())).nodes
    .map((n) => n.id)
    .sort();
  const svcIn = (await service.traverse({ startNodeId: "svc", direction: "in", maxDepth: 1, includeEdges: false }, ctx())).nodes
    .map((n) => n.id)
    .sort();
  const path = (await service.findPaths({ sourceId: "d", targetId: "svc" }, ctx())).paths.map((p) => p.nodeIds);
  return { regOut, svcIn, path };
}

describe("cross-layer traversal — in-memory baseline", () => {
  it("produces the expected cross-layer results", async () => {
    const graph = new InMemoryGraphAdapter();
    await seed(graph);
    const result = await probe(graph);
    // From the requirement, depth 2 reaches the decision (depth 1) and both its targets.
    expect(result.regOut).toEqual(["d", "reg", "rule", "svc"]);
    expect(result.svcIn).toEqual(["d", "svc"]);
    expect(result.path).toEqual([["d", "svc"]]);
  });
});

const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("cross-layer traversal — Neo4j parity (set NEO4J_URI to run)", () => {
    it("returns identical results to the in-memory adapter", async () => {
      await adapter.clear();
      const inMemory = new InMemoryGraphAdapter();
      await seed(inMemory);
      await seed(adapter);
      expect(await probe(adapter)).toEqual(await probe(inMemory));
    });
  });
} else {
  describe.skip("cross-layer traversal — Neo4j parity (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in parity path */
    });
  });
}
