import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { afterAll, describe, expect, it } from "vitest";
import { concatJsonl, GraphLoader } from "../src/index";

const EXTRACTIONS = fileURLToPath(new URL("./fixtures/cross-layer-extractions.jsonl", import.meta.url));
const RELATIONSHIPS = fileURLToPath(new URL("./fixtures/cross-layer-relationships.jsonl", import.meta.url));

// Feature 2.5 — acceptance criterion 8: a JSONL pair of cross-layer edges loads through the
// loader into a graph whose cross-layer traversal returns the expected connected subgraph,
// with an EdgeCreated event per committed edge and the one dangling edge quarantined (D-P2.5).
async function assertCrossLayerRoundTrip(graph: GraphPort): Promise<void> {
  const loader = new GraphLoader(graph);
  await loader.initialize({});

  const result = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "run-cl");

  // 6 entities + 6 valid edges committed; the 1 dangling edge quarantined, none failed.
  expect(result.totalEntries).toBe(13);
  expect(result.loaded).toBe(12);
  expect(result.failed).toBe(0);
  expect(result.quarantined).toBe(1);
  expect(result.quarantine?.[0]).toMatchObject({ entryId: "r-dangling", reason: "dangling-endpoint" });

  // The decision is fully cross-linked: out to L1 rule/invariant + L3 service/event; in from
  // the regulatory requirement and the triggering event.
  const out = (await graph.getEdges("d-auth", "out")).map((e) => e.relationshipType).sort();
  expect(out).toEqual(["constrainedBy", "evaluates", "produces", "realizedBy"]);
  const incoming = (await graph.getEdges("d-auth", "in")).map((e) => e.relationshipType).sort();
  expect(incoming).toEqual(["satisfiedBy", "triggeredBy"]);

  // Regulatory trace: from the requirement, two hops reach the decision and its rule (L1).
  const trace = await graph.traverse({ startNodeId: "reg-psd2", direction: "out", maxDepth: 2 });
  const traced = new Set(trace.nodes.map((n) => n.id));
  expect(traced.has("d-auth")).toBe(true);
  expect(traced.has("rule-funds")).toBe(true);
  expect(traced.has("svc-auth")).toBe(true);

  // Decision → Service path (blast-radius direction).
  const paths = await graph.findPath({ sourceId: "d-auth", targetId: "svc-auth" });
  expect(paths.some((p) => p.edges.map((e) => e.relationshipType).join() === "realizedBy")).toBe(true);

  // Bidirectional: from the Service, walking 'in' reaches the Decision.
  const back = await graph.traverse({ startNodeId: "svc-auth", direction: "in", maxDepth: 1 });
  expect(back.nodes.map((n) => n.id).sort()).toEqual(["d-auth", "svc-auth"]);

  // One EdgeCreated event per committed edge (feeds Feature 04 view invalidation).
  const edgeEvents = await graph.getEvents(undefined, undefined, [{ mutationType: "EdgeCreated" }]);
  expect(edgeEvents).toHaveLength(6);

  // The complete automated decision passes the integrity check.
  expect(await loader.checkDecisionIntegrity("d-auth")).toEqual([]);
}

describe("cross-layer end-to-end — in-memory adapter", () => {
  it("loads the cross-layer JSONL pair and traverses it in both directions", async () => {
    await assertCrossLayerRoundTrip(new InMemoryGraphAdapter());
  });
});

const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("cross-layer end-to-end — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("produces identical cross-layer graph state", async () => {
      await adapter.clear();
      await assertCrossLayerRoundTrip(adapter);
    });
  });
} else {
  describe.skip("cross-layer end-to-end — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in integration path */
    });
  });
}
