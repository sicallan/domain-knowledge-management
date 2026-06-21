import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import { GraphLoader, toAsyncIterable } from "../src/index";
import { edgeEntry, nodeEntry } from "./cross-layer-helpers";

// Feature 2.5 — acceptance criterion 1: an edge is persisted only after its endpoint
// types validate against the shared registry. A wrong-typed endpoint is quarantined +
// reported (D-P2.5: never silently dropped); a structurally-broken entry is excluded.
describe("GraphLoader — cross-layer edge load with endpoint-type validation", () => {
  it("creates the edge when endpoint types are valid (evaluates: Decision → Rule)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const result = await loader.load(
      toAsyncIterable([
        nodeEntry("Decision", "d1", { decisionType: "manual", outcomes: ["ok"] }),
        nodeEntry("Rule", "r1"),
        edgeEntry("evaluates", "d1", "r1", "e1"),
      ]),
      "run-valid",
    );

    expect(result.loaded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.quarantined ?? 0).toBe(0);
    const out = await graph.getEdges("d1", "out");
    expect(out.map((e) => e.relationshipType)).toEqual(["evaluates"]);
  });

  it("quarantines (does not commit) an edge whose endpoint is the wrong type", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    // evaluates must target a Rule/BusinessInvariant; a Service target is wrong-typed.
    const result = await loader.load(
      toAsyncIterable([
        nodeEntry("Decision", "d1", { decisionType: "manual", outcomes: ["ok"] }),
        nodeEntry("Service", "svc1"),
        edgeEntry("evaluates", "d1", "svc1", "e-bad"),
      ]),
      "run-wrong-type",
    );

    expect(result.loaded).toBe(2); // the two nodes only
    expect(result.failed).toBe(0); // not a hard failure — quarantined
    expect(result.quarantined).toBe(1);
    expect(result.quarantine?.[0]).toMatchObject({
      entryId: "e-bad",
      relationshipType: "evaluates",
      reason: "endpoint-type-mismatch",
    });
    // The wrong-typed edge was never committed.
    expect(await graph.getEdges("d1", "out")).toHaveLength(0);
  });

  it("excludes a structurally-broken relationship entry (missing endpoint id)", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const broken = edgeEntry("evaluates", "d1", "r1", "e-broken");
    delete (broken.data as Record<string, unknown>).targetEntityId;

    const result = await loader.load(
      toAsyncIterable([
        nodeEntry("Decision", "d1", { decisionType: "manual", outcomes: ["ok"] }),
        nodeEntry("Rule", "r1"),
        broken,
      ]),
      "run-broken",
    );

    expect(result.loaded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.entryId).toBe("e-broken");
    expect(await graph.getEdges("d1", "out")).toHaveLength(0);
  });
});
