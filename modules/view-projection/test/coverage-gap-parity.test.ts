import { describe, expect, it } from "vitest";
import { GapAnalysisProjector, VendorCoverageProjector } from "../src/index";
import type { CoverageRowKind } from "../src/index";
import { buildService, ctx, seededCoverageGraph } from "./helpers";

/**
 * The single-source-of-truth guard (feature 04 criterion 8 — a release blocker). Both
 * views consume the SAME realisation predicate (D-P3.3), so for any row kind the set of
 * rows the Coverage Map marks `uncovered` (a functional gap) must equal the set the Gap
 * view reports as a functional (L2-missing) gap. A divergence here is a silent
 * correctness bug — predicate drift.
 */
async function assertParity(rowKind: CoverageRowKind): Promise<void> {
  const graph = await seededCoverageGraph();
  const coverage = await new VendorCoverageProjector(buildService(graph)).project({ rowKind }, ctx());
  const gaps = await new GapAnalysisProjector(buildService(graph)).project({ layer: "functional" }, ctx());

  const coverageUncovered = coverage.rows
    .filter((r) => r.gap)
    .map((r) => r.id)
    .sort();
  const gapFunctional = gaps.gaps
    .filter((g) => g.kind === rowKind && g.missingLayers.includes("L2"))
    .map((g) => g.id)
    .sort();

  expect(coverageUncovered).toEqual(gapFunctional);
  expect(coverageUncovered.length).toBeGreaterThan(0); // the fixture exercises a real gap
}

describe("Coverage Map ⇄ Gap view parity (D-P3.3 — release blocker)", () => {
  it("agrees on functional gaps for BusinessCapability rows", async () => {
    await assertParity("BusinessCapability");
  });

  it("agrees on functional gaps for DomainConcept rows", async () => {
    await assertParity("DomainConcept");
  });
});
