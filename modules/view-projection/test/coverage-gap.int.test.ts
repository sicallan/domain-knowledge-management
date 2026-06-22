import { afterAll, describe, expect, it } from "vitest";
import { InMemoryGraphAdapter, neo4jAdapterFromEnv } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { GraphQueryService } from "@dkm/query";
import {
  DefaultViewEngine,
  GapAnalysisProjector,
  VendorCoverageProjector,
} from "../src/index";
import type { GapAnalysisView, VendorCoverageView } from "../src/index";
import { ctx, seedCoverageGraph } from "./helpers";

// The same seeded Coverage/Gap scenario projected through the engine over BOTH adapters,
// proving adapter parity (feature 03 criterion 7 / feature 04 criterion 9 / D-P1.2): the
// projectors compose only the Query Interface, so the projection must be byte-identical
// across in-memory and Neo4j. Mirrors the Phase 2 cross-adapter e2e.
async function projectBoth(graph: GraphPort): Promise<{ coverage: VendorCoverageView; gaps: GapAnalysisView }> {
  await seedCoverageGraph(graph);
  const service = new GraphQueryService(graph);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(new VendorCoverageProjector(service));
  engine.registerProjector(new GapAnalysisProjector(service));

  const coverage = (await engine.getView<VendorCoverageView>("vendor-coverage", {}, ctx())).data;
  const gaps = (await engine.getView<GapAnalysisView>("gap-analysis", {}, ctx())).data;
  return { coverage, gaps };
}

describe("Coverage + Gap over the engine — in-memory adapter", () => {
  it("projects the expected coverage matrix and gap list", async () => {
    const { coverage, gaps } = await projectBoth(new InMemoryGraphAdapter());

    expect(coverage.summary).toEqual({
      totalCapabilities: 4,
      covered: 1,
      partial: 1,
      uncovered: 2,
      coveragePercentage: 38,
    });
    expect(gaps.gaps.map((g) => g.id)).toEqual(["cap-settle", "dc-ledger", "dc-notify", "cap-fraud", "cap-report"]);
    // The two views agree on functional gaps (the predicate is shared).
    const coverageGaps = coverage.rows.filter((r) => r.gap).map((r) => r.id).sort();
    const functionalGaps = gaps.gaps.filter((g) => g.missingLayers.includes("L2") && g.kind === "BusinessCapability").map((g) => g.id).sort();
    expect(coverageGaps).toEqual(functionalGaps);
  });
});

// Opt-in only (D-P1.2): the Neo4j leg never gates CI — auto-skips without NEO4J_URI.
const neo4j = neo4jAdapterFromEnv();
if (neo4j) {
  const { adapter, driver } = neo4j;
  afterAll(async () => {
    await adapter.clear();
    await driver.close();
  });
  describe("Coverage + Gap over the engine — Neo4j adapter", () => {
    it("projects an identical coverage matrix and gap list", async () => {
      await adapter.clear();
      const inMemory = await projectBoth(new InMemoryGraphAdapter());
      await adapter.clear();
      const overNeo4j = await projectBoth(adapter);
      expect(overNeo4j.coverage).toEqual(inMemory.coverage);
      expect(overNeo4j.gaps).toEqual(inMemory.gaps);
    });
  });
} else {
  describe.skip("Coverage + Gap over the engine — Neo4j adapter (set NEO4J_URI to run)", () => {
    it("is skipped without a configured Neo4j — never a CI gate (D-P1.2)", () => {
      /* documents the guarded, opt-in adapter-parity path */
    });
  });
}
