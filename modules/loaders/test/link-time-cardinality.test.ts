import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import { GraphLoader, toAsyncIterable } from "../src/index";
import { edgeEntry, nodeEntry } from "./cross-layer-helpers";

// Feature 2.5 — acceptance criterion 2: cardinality/conditional rules are enforced at
// link time, reading the single shared RelationshipTypeRegistry (D-P2.2). Max-cardinality
// breaches are quarantined per-edge; min/conditional completeness is reported by the
// integrity check (D-P2.5: queue, do not silently drop).
describe("GraphLoader — link-time cardinality enforcement", () => {
  it("quarantines a second belongsTo edge (N:1 — a Service belongs to exactly one context)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const result = await loader.load(
      toAsyncIterable([
        nodeEntry("Service", "svc1"),
        nodeEntry("BoundedContext", "ctx1"),
        nodeEntry("BoundedContext", "ctx2"),
        edgeEntry("belongsTo", "svc1", "ctx1", "b1"),
        edgeEntry("belongsTo", "svc1", "ctx2", "b2"), // violates N:1
      ]),
      "run-belongs",
    );

    expect(result.quarantined).toBe(1);
    expect(result.quarantine?.[0]).toMatchObject({ entryId: "b2", reason: "cardinality-violation" });
    // Exactly one belongsTo edge committed.
    expect(await graph.getEdges("svc1", "out")).toHaveLength(1);
  });

  it("reports an incomplete automated Decision: evaluates≥1, produces≥1, automated⇒triggeredBy", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    await loader.load(
      toAsyncIterable([nodeEntry("Decision", "d1", { decisionType: "automated", outcomes: ["ok"] })]),
      "run-incomplete",
    );

    const violations = await loader.checkDecisionIntegrity("d1");
    const byType = violations.map((v) => v.relationshipType).sort();
    expect(byType).toEqual(["evaluates", "produces", "triggeredBy"]);
    expect(violations.find((v) => v.relationshipType === "triggeredBy")?.keyword).toBe(
      "conditionalCardinality",
    );
  });

  it("passes integrity for a complete automated Decision", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    await loader.load(
      toAsyncIterable([
        nodeEntry("Decision", "d1", { decisionType: "automated", outcomes: ["ok"] }),
        nodeEntry("Rule", "r1"),
        nodeEntry("Event", "ev-out"),
        nodeEntry("Event", "ev-trigger"),
        edgeEntry("evaluates", "d1", "r1", "e1"),
        edgeEntry("produces", "d1", "ev-out", "p1"),
        edgeEntry("triggeredBy", "ev-trigger", "d1", "t1"),
      ]),
      "run-complete",
    );

    expect(await loader.checkDecisionIntegrity("d1")).toEqual([]);
  });

  it("a manual Decision needs no triggeredBy edge (conditional rule is automated-only)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    await loader.load(
      toAsyncIterable([
        nodeEntry("Decision", "d1", { decisionType: "manual", outcomes: ["ok"] }),
        nodeEntry("Rule", "r1"),
        nodeEntry("Event", "ev-out"),
        edgeEntry("evaluates", "d1", "r1", "e1"),
        edgeEntry("produces", "d1", "ev-out", "p1"),
      ]),
      "run-manual",
    );

    expect(await loader.checkDecisionIntegrity("d1")).toEqual([]);
  });
});
