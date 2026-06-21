import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { afterAll, describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { concatJsonl, GraphLoader, toAsyncIterable } from "../src/index";

const EXTRACTIONS = fileURLToPath(new URL("./fixtures/run-001-extractions.jsonl", import.meta.url));
const RELATIONSHIPS = fileURLToPath(new URL("./fixtures/run-001-relationships.jsonl", import.meta.url));

/** The shared "feature-02 JSONL pair → populated graph" round-trip, run per adapter. */
async function assertFixtureRoundTrip(graph: GraphPort): Promise<void> {
  const loader = new GraphLoader(graph);
  await loader.initialize({});

  const result = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "run-001");

  // Acceptance 1 — exactly the expected nodes and edges, totals reconcile.
  expect(result.totalEntries).toBe(6);
  expect(result.loaded).toBe(6);
  expect(result.failed).toBe(0);
  expect(result.loaded + result.skipped + result.failed).toBe(result.totalEntries);

  expect((await graph.findByType("DomainConcept")).map((n) => n.name)).toEqual(["Payment"]);
  expect((await graph.findByType("Decision"))).toHaveLength(1);
  expect((await graph.findByType("Rule"))).toHaveLength(1);
  expect((await graph.findByType("ReferenceData"))).toHaveLength(1);

  const decision = await graph.getNode("e-authorise");
  expect(decision?.name).toBe("Authorise Payment");

  // Edges: Decision —evaluates→ Rule, Decision —consumes→ ReferenceData.
  const out = await graph.getEdges("e-authorise", "out");
  expect(out.map((e) => e.relationshipType).sort()).toEqual(["consumes", "evaluates"]);

  const reachable = await graph.traverse({ startNodeId: "e-authorise", direction: "out", maxDepth: 1 });
  expect(reachable.nodes.map((n) => n.id).sort()).toEqual(["e-authorise", "e-funds", "e-limits"]);

  // Acceptance 8 — a mutation event per change (4 nodes + 2 edges).
  const created = await graph.getEvents(undefined, undefined, [{ mutationType: "NodeCreated" }]);
  expect(created).toHaveLength(4);
  expect(await graph.getEvents(undefined, undefined, [{ mutationType: "EdgeCreated" }])).toHaveLength(2);
}

describe("GraphLoader integration — in-memory adapter", () => {
  it("round-trips a feature-02 JSONL pair into the expected graph state", async () => {
    await assertFixtureRoundTrip(new InMemoryGraphAdapter());
  });

  it("quarantines a relationship with a missing endpoint (cross-pass resolution, D-P2.5)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const decision: JsonlEntry = {
      id: "d1",
      type: "Decision",
      version: "1.0.0",
      source: { file: "f.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
      confidence: 0.9,
      extractedAt: "2026-01-02T00:00:00Z",
      data: { name: "Authorise", decisionType: "automated", outcomes: ["ok"] },
    };
    const danglingRel: JsonlEntry = {
      id: "r1",
      type: "Relationship",
      version: "1.0.0",
      source: { file: "f.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
      confidence: 0.8,
      extractedAt: "2026-01-02T00:00:00Z",
      data: { relationshipType: "evaluates", sourceEntityId: "d1", targetEntityId: "does-not-exist" },
    };

    const result = await loader.load(toAsyncIterable([decision, danglingRel]), "run-dangling");
    expect(result.loaded).toBe(1); // the decision node
    expect(result.failed).toBe(0); // dangling is quarantined, not a hard failure
    expect(result.errors).toHaveLength(0);
    expect(result.quarantined).toBe(1);
    expect(result.quarantine?.[0]?.entryId).toBe("r1");
    expect(result.quarantine?.[0]?.reason).toBe("dangling-endpoint");
    expect(result.quarantine?.[0]?.detail).toMatch(/does-not-exist/);
    // The edge was never created.
    expect(await graph.getEdges("d1", "out")).toHaveLength(0);
  });

  it("skips a schema-broken entry and still loads the rest (partial failure, totals reconcile)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const good: JsonlEntry = {
      id: "g1",
      type: "DomainConcept",
      version: "1.0.0",
      source: { file: "f.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
      confidence: 0.9,
      extractedAt: "2026-01-02T00:00:00Z",
      data: { name: "Payment", conceptType: "aggregate" },
    };
    const bad = { ...good, id: "b1" } as Partial<JsonlEntry>;
    delete bad.data;

    const result = await loader.load(toAsyncIterable([good, bad as JsonlEntry]), "run-partial");
    expect(result.totalEntries).toBe(2);
    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.entryId).toBe("b1");
    expect(result.errors[0]?.retriable).toBe(false);
    expect(result.loaded + result.skipped + result.failed).toBe(result.totalEntries);
    expect(await graph.nodeExists("g1")).toBe(true);
  });

  it("rollbackRun removes the run's nodes and edges and records the reversal in the event log", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});
    await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "run-001");

    await loader.rollbackRun("run-001");

    expect(await graph.findByType("DomainConcept")).toHaveLength(0);
    expect(await graph.findByType("Decision")).toHaveLength(0);
    expect(await graph.nodeExists("e-authorise")).toBe(false);
    // Reversal recorded: a NodeRetired event for a removed node.
    const retired = await graph.getEvents(undefined, undefined, [{ mutationType: "NodeRetired", entityId: "e-authorise" }]);
    expect(retired).toHaveLength(1);
  });
});

// Same round-trip against Neo4j — opt-in only (D-P1.2), never a CI gate. Run with:
//   docker run -d --rm -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
//   NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=testpassword \
//     pnpm exec vitest run modules/loaders
const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("GraphLoader integration — Neo4j adapter", () => {
    it("produces identical graph state from the same JSONL pair", async () => {
      await adapter.clear();
      await assertFixtureRoundTrip(adapter);
    });
  });
} else {
  describe.skip("GraphLoader integration — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in integration path */
    });
  });
}
