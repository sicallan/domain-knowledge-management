import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import { GraphLoader, toAsyncIterable } from "../src/index";
import { edgeEntry, nodeEntry } from "./cross-layer-helpers";

// Feature 2.5 — acceptance criterion 6 (D-P2.5): an edge whose endpoint was not (yet)
// extracted — e.g. invokes(Step → Decision) emitted before the Decision pass — is routed
// to the review queue and COUNTED, never committed as a dangling edge and never dropped.
describe("GraphLoader — dangling-edge policy (cross-pass resolution)", () => {
  it("quarantines (does not commit, does not drop) an edge with a missing endpoint", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const result = await loader.load(
      toAsyncIterable([
        nodeEntry("OrchestrationStep", "step1", { sequence: 1, actionType: "invoke" }),
        // The Decision endpoint "d-missing" was not (yet) extracted.
        edgeEntry("invokes", "step1", "d-missing", "inv1"),
      ]),
      "run-dangling",
    );

    expect(result.loaded).toBe(1); // the step node
    expect(result.failed).toBe(0); // dangling is NOT a hard failure
    expect(result.quarantined).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.quarantine?.[0]).toMatchObject({
      entryId: "inv1",
      relationshipType: "invokes",
      reason: "dangling-endpoint",
    });
    expect(result.quarantine?.[0]?.detail).toMatch(/d-missing/);

    // The dangling edge was never committed.
    expect(await graph.getEdges("step1", "out")).toHaveLength(0);
  });

  it("counts both endpoints when neither exists", async () => {
    const graph = new InMemoryGraphAdapter();
    const loader = new GraphLoader(graph);
    await loader.initialize({});

    const result = await loader.load(
      toAsyncIterable([edgeEntry("realizedBy", "d-missing", "svc-missing", "rb1")]),
      "run-both-missing",
    );

    expect(result.quarantined).toBe(1);
    expect(result.quarantine?.[0]?.reason).toBe("dangling-endpoint");
    expect(result.quarantine?.[0]?.detail).toMatch(/d-missing/);
    expect(result.quarantine?.[0]?.detail).toMatch(/svc-missing/);
  });
});
