import { describe, expect, it } from "vitest";
import { seedInMemoryGraph } from "../src/seed";

const CONTEXT = { userId: "test", roles: ["reader"], scopes: ["*"], requestId: "seed-test" };

describe("seedInMemoryGraph()", () => {
  it("loads the Payments demo seed through the real GraphLoader with no failures", async () => {
    const { loadResult } = await seedInMemoryGraph();
    expect(loadResult.failed).toBe(0);
    expect(loadResult.loaded).toBeGreaterThan(0);
  });

  it("exposes a queryService that can read a seeded entry back", async () => {
    const { graph, queryService } = await seedInMemoryGraph();
    // Pick any seeded node id straight from the graph, then read it via the port.
    const capabilities = await graph.findByType("BusinessCapability");
    expect(capabilities.length).toBeGreaterThan(0);
    const id = capabilities[0]!.id;
    const result = await queryService.getEntry(id, CONTEXT);
    expect(result?.entry.id).toBe(id);
  });

  it("registers the four view projectors on the engine", async () => {
    const { views } = await seedInMemoryGraph();
    const viewTypes = views.listViews().map((v) => v.viewType);
    expect(viewTypes).toEqual(
      expect.arrayContaining(["domain-map", "behaviour-flow", "vendor-coverage", "gap-analysis"]),
    );
  });
});
