import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { GraphQueryService } from "../src/index";
import { ctx } from "./helpers";

// Reuse the Feature 03 (graph loader) fixtures: the same JSONL pair that loads into
// the populated graph the Query Interface reads from (plan 1.4 — "query returns
// expected results for seeded graph").
const EXTRACTIONS = fileURLToPath(
  new URL("../../loaders/test/fixtures/run-001-extractions.jsonl", import.meta.url),
);
const RELATIONSHIPS = fileURLToPath(
  new URL("../../loaders/test/fixtures/run-001-relationships.jsonl", import.meta.url),
);

/** Load the fixtures through the graph loader, then assert the full query set over the result. */
async function assertQueriesOverLoadedGraph(graph: GraphPort): Promise<void> {
  const loader = new GraphLoader(graph);
  await loader.initialize({});
  const load = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "run-001");
  expect(load.loaded).toBe(6);

  const service = new GraphQueryService(graph);

  // Entity lookup.
  const decision = await service.getEntry("e-authorise", ctx());
  expect(decision?.entry.name).toBe("Authorise Payment");
  expect(decision?.entry.type).toBe("Decision");
  expect(await service.getEntry("not-loaded", ctx())).toBeNull();

  // Type listing.
  const concepts = await service.listEntries({ type: "DomainConcept" }, ctx());
  expect(concepts.items.map((n) => n.name)).toEqual(["Payment"]);
  expect(concepts.totalCount).toBe(1);
  expect(concepts.hasMore).toBe(false);

  // Traversal: Decision —evaluates→ Rule, Decision —consumes→ ReferenceData.
  const subgraph = await service.traverse(
    { startNodeId: "e-authorise", direction: "out", maxDepth: 1, includeEdges: true },
    ctx(),
  );
  expect(subgraph.nodes.map((n) => n.id).sort()).toEqual(["e-authorise", "e-funds", "e-limits"]);
  expect(subgraph.edges.map((e) => e.relationshipType).sort()).toEqual(["consumes", "evaluates"]);

  const evaluatesOnly = await service.traverse(
    { startNodeId: "e-authorise", direction: "out", edgeTypes: ["evaluates"], maxDepth: 1, includeEdges: true },
    ctx(),
  );
  expect(evaluatesOnly.nodes.map((n) => n.id).sort()).toEqual(["e-authorise", "e-funds"]);

  // Path finding.
  const connected = await service.findPaths({ sourceId: "e-authorise", targetId: "e-funds" }, ctx());
  expect(connected.found).toBe(true);
  expect(connected.paths[0]?.nodeIds).toEqual(["e-authorise", "e-funds"]);

  // e-payment was loaded but has no edges — unconnected to the decision.
  const unconnected = await service.findPaths({ sourceId: "e-authorise", targetId: "e-payment" }, ctx());
  expect(unconnected.found).toBe(false);
}

describe("Query over a loader-populated graph — in-memory adapter", () => {
  it("returns the expected results for the seeded graph", async () => {
    await assertQueriesOverLoadedGraph(new InMemoryGraphAdapter());
  });
});

// Same end-to-end query set against Neo4j — opt-in only (D-P1.2), never a CI gate.
const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("Query over a loader-populated graph — Neo4j adapter", () => {
    it("returns identical results from the same JSONL pair", async () => {
      await adapter.clear();
      await assertQueriesOverLoadedGraph(adapter);
    });
  });
} else {
  describe.skip("Query over a loader-populated graph — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in adapter-parity path */
    });
  });
}
