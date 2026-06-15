import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { GraphLoader, toAsyncIterable } from "../src/index";

let seq = 0;
function entity(): JsonlEntry {
  seq += 1;
  return {
    id: `e-${seq}`,
    type: "DomainConcept",
    version: "1.0.0",
    source: { file: "spec.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.9,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { name: "Payment", conceptType: "aggregate" },
  };
}

async function freshLoader(): Promise<{ loader: GraphLoader; graph: InMemoryGraphAdapter }> {
  const graph = new InMemoryGraphAdapter();
  const loader = new GraphLoader(graph);
  await loader.initialize({});
  return { loader, graph };
}

describe("GraphLoader idempotency (processed-set semantics across re-runs)", () => {
  it("re-running the same run skips all entries, loads nothing, and leaves the graph unchanged", async () => {
    const { loader, graph } = await freshLoader();
    const entries = [entity(), entity(), entity()];

    const first = await loader.load(toAsyncIterable(entries), "run-A");
    expect(first.loaded).toBe(3);
    expect(first.skipped).toBe(0);

    const nodesAfterFirst = (await graph.findByType("DomainConcept")).length;
    const eventsAfterFirst = (await graph.getEvents()).length;

    const second = await loader.load(toAsyncIterable(entries), "run-A");
    expect(second.totalEntries).toBe(3);
    expect(second.skipped).toBe(3);
    expect(second.loaded).toBe(0);
    expect(second.failed).toBe(0);

    // Graph unchanged: same node count, no further mutation events.
    expect((await graph.findByType("DomainConcept")).length).toBe(nodesAfterFirst);
    expect((await graph.getEvents()).length).toBe(eventsAfterFirst);
  });

  it("tracks processed by (entryId, runId): the same id under a different run is unprocessed", async () => {
    const { loader } = await freshLoader();
    const entry = entity();
    expect(await loader.hasProcessed(entry.id, "run-B")).toBe(false);
    await loader.loadSingle(entry, "run-B");
    expect(await loader.hasProcessed(entry.id, "run-B")).toBe(true);
    expect(await loader.hasProcessed(entry.id, "run-C")).toBe(false);
  });

  it("rollback clears processed marks so a subsequent load is fresh, not skipped", async () => {
    const { loader, graph } = await freshLoader();
    const entries = [entity(), entity()];
    await loader.load(toAsyncIterable(entries), "run-D");
    expect(await loader.hasProcessed(entries[0]!.id, "run-D")).toBe(true);

    await loader.rollbackRun("run-D");
    expect(await loader.hasProcessed(entries[0]!.id, "run-D")).toBe(false);
    expect((await graph.findByType("DomainConcept")).length).toBe(0);

    const after = await loader.load(toAsyncIterable(entries), "run-D");
    expect(after.loaded).toBe(2);
    expect(after.skipped).toBe(0);
  });
});
